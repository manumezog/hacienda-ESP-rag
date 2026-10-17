import sqlite3
import textwrap

def ver_consultas_aleatorias(n=2):
    conn = sqlite3.connect('consultas_vinculantes.db')
    c = conn.cursor()
    c.execute('''
        SELECT num_consulta, fecha_salida, organo, normativa, 
               descripcion_hechos, cuestion_planteada, contestacion_completa, mes_scrape
        FROM consultas 
        ORDER BY RANDOM() 
        LIMIT ?
    ''', (n,))
    
    filas = c.fetchall()
    conn.close()

    separador = "=" * 80
    sub_sep = "-" * 80

    for i, row in enumerate(filas, 1):
        num, fecha, organo, norm, hechos, cuestion, contestacion, mes = row
        print(f"\n{separador}")
        print(f" EJEMPLO {i}: {num}  |  Fecha: {fecha}  |  Mes Scrape: {mes}")
        print(f" Órgano: {organo.strip()}")
        print(separador)
        print("\n[ NORMATIVA CITADA ]:")
        print(textwrap.indent(norm.strip(), "  "))
        print("\n[ DESCRIPCIÓN DE LOS HECHOS ]:")
        print(textwrap.indent(hechos.strip(), "  "))
        print("\n[ CUESTIÓN PLANTEADA ]:")
        print(textwrap.indent(cuestion.strip(), "  "))
        print("\n[ CONTESTACIÓN (Primeros 500 caracteres) ]:")
        preview_cont = contestacion.strip()[:500] + ("..." if len(contestacion.strip()) > 500 else "")
        print(textwrap.indent(preview_cont, "  "))
        print(f"\n{sub_sep}\n")

if __name__ == '__main__':
    ver_consultas_aleatorias(2)
