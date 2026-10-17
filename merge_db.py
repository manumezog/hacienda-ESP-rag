import sqlite3

def merge():
    print("[*] Abriendo bases de datos...")
    db = sqlite3.connect('consultas_vinculantes.db')
    c = db.cursor()
    
    print("[*] Adjuntando base de datos de la Jetson...")
    c.execute("ATTACH 'consultas_jetson.db' AS jetson;")
    
    print("[*] Insertando consultas no duplicadas...")
    c.execute("INSERT OR IGNORE INTO consultas SELECT * FROM jetson.consultas;")
    
    print("[*] Sincronizando estado de los meses...")
    c.execute("INSERT OR REPLACE INTO estado_mes SELECT * FROM jetson.estado_mes;")
    
    db.commit()
    c.execute("DETACH DATABASE jetson;")
    
    c.execute("SELECT COUNT(*) FROM consultas;")
    total = c.fetchone()[0]
    print(f"\n[OK] ¡Fusión completada con éxito!")
    print(f"[OK] Total de consultas vinculantes unificadas: {total}")
    db.close()

if __name__ == '__main__':
    merge()
