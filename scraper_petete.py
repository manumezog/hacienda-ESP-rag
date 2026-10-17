import requests
import re
import calendar
import time
import sqlite3
import os
import random
import urllib3
from bs4 import BeautifulSoup
from datetime import datetime

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://petete.tributos.hacienda.gob.es/consultas/"
DB_FILE = 'consultas_vinculantes.db'
PAGE_SIZE = 20  # Knosys devuelve típicamente 20 resultados por página

def get_last_day_of_month(year, month):
    return calendar.monthrange(year, month)[1]

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS consultas (
            num_consulta TEXT PRIMARY KEY,
            organo TEXT,
            fecha_salida TEXT,
            normativa TEXT,
            descripcion_hechos TEXT,
            cuestion_planteada TEXT,
            contestacion_completa TEXT,
            html_crudo TEXT,
            mes_scrape TEXT
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS estado_mes (
            mes TEXT PRIMARY KEY,
            ultimo_indice_descargado INTEGER,
            total_resultados INTEGER
        )
    ''')
    conn.commit()
    return conn

def parse_document(html_content):
    soup = BeautifulSoup(html_content, 'html.parser')
    data = {}
    
    doc_table = soup.find('table', class_='document')
    data['html_crudo'] = str(doc_table) if doc_table else html_content
    
    fields = [
        ("num_consulta", "NUM-CONSULTA"),
        ("organo", "ORGANO"),
        ("fecha_salida", "FECHA-SALIDA"),
        ("normativa", "NORMATIVA"),
        ("descripcion_hechos", "DESCRIPCION-HECHOS"),
        ("cuestion_planteada", "CUESTION-PLANTEADA"),
        ("contestacion_completa", "CONTESTACION-COMPL")
    ]
    
    for key, class_name in fields:
        tr = soup.find('tr', class_=class_name)
        if tr:
            td = tr.find('td', class_='value')
            if td:
                paragraphs = td.find_all('p')
                if paragraphs:
                    text = "\n\n".join([p.get_text(strip=True) for p in paragraphs])
                else:
                    text = td.get_text(strip=True)
                data[key] = text
            else:
                data[key] = ""
        else:
            data[key] = ""
            
    return data

def build_search_payload(year, month, page):
    last_day = get_last_day_of_month(year, month)
    date_ini = f"01/{month:02d}/{year}"
    date_end = f"{last_day}/{month:02d}/{year}"
    
    return {
        'type2': 'on',
        'NMCMP_1': 'NUM-CONSULTA', 'VLCMP_1': '', 'OPCMP_1': '.Y',
        'NMCMP_2': 'FECHA-SALIDA', 'VLCMP_2': f"{date_ini}..{date_end}",
        'dateIni_2': date_ini, 'dateEnd_2': date_end, 'OPCMP_2': '.Y',
        'NMCMP_3': 'NORMATIVA', 'VLCMP_3': '', 'OPCMP_3': '.Y',
        'NMCMP_4': 'CUESTION-PLANTEADA', 'VLCMP_4': '', 'OPCMP_4': '.Y',
        'NMCMP_5': 'DESCRIPCION-HECHOS', 'VLCMP_5': '', 'OPCMP_5': '.Y',
        'NMCMP_6': 'FreeText', 'VLCMP_6': '', 'OPCMP_6': '.Y',
        'NMCMP_7': 'CRITERIO',
        'cmpOrder': 'FECHA-SALIDA', 'dirOrder': '1', 
        'tab': '2', 'page': str(page)
    }

def fetch_search_page(session, year, month, page):
    """Hace la búsqueda Knosys y devuelve (total_hits, lista_ids_globales)"""
    session.get(BASE_URL, verify=False, timeout=30)
    session.get(f"{BASE_URL}do/form", verify=False, timeout=30)
    
    payload = build_search_payload(year, month, page)
    session.headers.update({
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    })
    
    res = session.post(f"{BASE_URL}do/search", data=payload, verify=False, timeout=45)
    if res.status_code != 200:
        raise Exception(f"POST /do/search error HTTP {res.status_code}")
        
    match_total = re.search(r'updateNumResults\("2",\s*"(\d+)"\)', res.text)
    total_hits = int(match_total.group(1)) if match_total else 0
    
    ids_raw = re.findall(r'viewDocument\((\d+), 2\)', res.text)
    # Deduplicar manteniendo orden
    seen = set()
    doc_ids = [x for x in ids_raw if not (x in seen or seen.add(x))]
    
    return total_hits, doc_ids

def scrape_month(year, month, conn):
    month_id = f"{year}-{month:02d}"
    c = conn.cursor()
    
    c.execute('SELECT ultimo_indice_descargado, total_resultados FROM estado_mes WHERE mes = ?', (month_id,))
    row = c.fetchone()
    
    if row:
        ultimo_indice, total_resultados = row
        if total_resultados is not None and ultimo_indice >= total_resultados - 1:
            print(f"[i] Mes {month_id} ya completado. Saltando...")
            return True
        docs_processed_so_far = ultimo_indice + 1 if ultimo_indice is not None else 0
    else:
        docs_processed_so_far = 0
        total_resultados = None
        
    print(f"\n[*] Procesando mes {month_id} (Continuando desde indice global de procesamiento {docs_processed_so_far})")
    
    consecutive_errors = 0
    max_consecutive_errors = 10
    
    while True:
        try:
            session = requests.Session()
            session.headers.update({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': BASE_URL
            })
            
            # Calcular la página y el offset interno basándonos en docs_processed_so_far
            current_page = (docs_processed_so_far // PAGE_SIZE) + 1
            offset_in_page = docs_processed_so_far % PAGE_SIZE
            
            # Obtener IDs de la página actual
            current_total_hits, current_ids = fetch_search_page(session, year, month, current_page)
            
            if total_resultados is None:
                total_resultados = current_total_hits
                c.execute('INSERT OR REPLACE INTO estado_mes (mes, ultimo_indice_descargado, total_resultados) VALUES (?, ?, ?)',
                          (month_id, -1, current_total_hits))
                conn.commit()
                print(f"[i] Encontradas {total_resultados} consultas para {month_id}.")
                
            if current_total_hits == 0:
                c.execute('UPDATE estado_mes SET ultimo_indice_descargado = 0 WHERE mes = ?', (month_id,))
                conn.commit()
                return True
                
            if docs_processed_so_far >= current_total_hits:
                c.execute('UPDATE estado_mes SET ultimo_indice_descargado = ? WHERE mes = ?', (current_total_hits - 1, month_id))
                conn.commit()
                return True

            # Si ya hemos superado el offset de esta página, procesar el resto
            start_time_month = time.time()
            initial_processed = docs_processed_so_far
            
            # Iterar los IDs de la página
            ids_to_process = current_ids[offset_in_page:]
            
            if not ids_to_process:
                # Si la página está vacía pero current_total_hits > docs_processed_so_far, Knosys no devuelve más.
                # Hay una discrepancia con el servidor. Forzamos avance a siguiente página o damos por terminado.
                docs_processed_so_far += PAGE_SIZE - offset_in_page
                continue

            for local_idx, global_doc_id in enumerate(ids_to_process):
                # Request a Knosys mediante su ID GLOBAL (.T)
                res_doc = session.get(f"{BASE_URL}do/document?query=.T&doc={global_doc_id}&tab=2", verify=False, timeout=30)
                if res_doc.status_code != 200:
                    raise Exception(f"HTTP {res_doc.status_code} al solicitar ID global {global_doc_id}")
                    
                parsed_data = parse_document(res_doc.text)
                
                c.execute('''
                    INSERT OR IGNORE INTO consultas 
                    (num_consulta, organo, fecha_salida, normativa, descripcion_hechos, cuestion_planteada, contestacion_completa, html_crudo, mes_scrape)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    parsed_data.get('num_consulta', ''),
                    parsed_data.get('organo', ''),
                    parsed_data.get('fecha_salida', ''),
                    parsed_data.get('normativa', ''),
                    parsed_data.get('descripcion_hechos', ''),
                    parsed_data.get('cuestion_planteada', ''),
                    parsed_data.get('contestacion_completa', ''),
                    parsed_data.get('html_crudo', ''),
                    month_id
                ))
                
                c.execute('UPDATE estado_mes SET ultimo_indice_descargado = ? WHERE mes = ?', (docs_processed_so_far, month_id))
                conn.commit()
                
                docs_processed_so_far += 1
                consecutive_errors = 0
                
                if docs_processed_so_far % 25 == 0:
                    elapsed = time.time() - start_time_month
                    docs_done_in_loop = docs_processed_so_far - initial_processed
                    rate = docs_done_in_loop / elapsed if elapsed > 0 else 0
                    eta_seconds = (total_resultados - docs_processed_so_far) / rate if rate > 0 else 0
                    print(f"  -> Progreso mes {month_id}: {docs_processed_so_far}/{total_resultados} ({(docs_processed_so_far)/total_resultados*100:.1f}%) | Velocidad: {rate:.2f} docs/s | ETA: {eta_seconds/60:.1f} min")
                    
                time.sleep(random.uniform(0.5, 1.5))
                
        except Exception as e:
            consecutive_errors += 1
            print(f"[!] Error en mes {month_id} (doc {docs_processed_so_far}): {str(e)}")
            if consecutive_errors <= max_consecutive_errors:
                wait_time = 10 * consecutive_errors
                print(f"[i] (Intento {consecutive_errors}/{max_consecutive_errors}) Esperando {wait_time}s antes de reintentar...")
                time.sleep(wait_time)
            else:
                print(f"[!] Maximos reintentos consecutivos alcanzados.")
                return False
                
    return True

import argparse

def main():
    parser = argparse.ArgumentParser(description='Scraper Petete Hacienda')
    parser.add_argument('--start', type=int, default=datetime.now().year, help='Año inicial (descendente)')
    parser.add_argument('--end', type=int, default=2016, help='Año final limite')
    args = parser.parse_args()

    conn = init_db()
    current_year = args.start
    current_month = datetime.now().month if args.start == datetime.now().year else 12
    
    print(f"[*] Iniciando Scraper Global por Páginas Knosys - Desde {current_month:02d}/{current_year} hasta {args.end}")
    
    y = current_year
    m = current_month
    
    while y >= args.end:
        success = scrape_month(y, m, conn)
        if not success:
            print("[!] Se detiene el proceso de extraccion debido a fallos criticos irrecuperables.")
            break
            
        m -= 1
        if m == 0:
            m = 12
            y -= 1
            
    conn.close()
    print("[*] Proceso finalizado.")

if __name__ == '__main__':
    main()
