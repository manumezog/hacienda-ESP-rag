import os
import json
import math
import time
import sqlite3
import argparse
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

import httpx
from tqdm import tqdm
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "embeddinggemma")

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "consultas_vinculantes.db"
SQLITE_DB_PATH = Path(os.getenv("SQLITE_DB_PATH", str(DEFAULT_DB_PATH))).resolve()
CHECKPOINT_FILE = Path(__file__).resolve().parent / "ingest_checkpoint.json"


def parse_fecha_iso(fecha_str: str, mes_scrape: str) -> Optional[str]:
    """Convierte 'DD/MM/YYYY' a 'YYYY-MM-DD' para PostgreSQL DATE."""
    if fecha_str:
        fecha_clean = fecha_str.strip()
        for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(fecha_clean, fmt).strftime("%Y-%m-%d")
            except ValueError:
                pass
    if mes_scrape and len(mes_scrape) == 7:
        return f"{mes_scrape}-01"
    return None


def normalize_l2(vec: List[float], decimals: int = 5) -> List[float]:
    """Normaliza el vector con norma L2 y redondea para optimizar el transporte hacia halfvec(768)."""
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        return [round(x / norm, decimals) for x in vec]
    return [round(x, decimals) for x in vec]


def build_contextual_chunks(
    row: sqlite3.Row,
    max_chars: int = 2400,
    overlap_chars: int = 300,
) -> List[Dict[str, Any]]:
    """
    Chunking Inteligente Legal con Inyección de Cabecera de Metadatos:
    Cada chunk recibe en su cabecera el número de consulta, fecha, órgano, normativa
    y la cuestión planteada, garantizando que ningún fragmento pierda su contexto jurídico
    al ser vectorizado por EmbeddingGemma.
    """
    num_consulta = (row["num_consulta"] or "").strip()
    fecha_salida = (row["fecha_salida"] or "").strip()
    mes_scrape = (row["mes_scrape"] or "").strip()
    fecha_iso = parse_fecha_iso(fecha_salida, mes_scrape)
    organo = " ".join((row["organo"] or "").split())
    normativa = " ".join((row["normativa"] or "").split())[:350]
    hechos = " ".join((row["descripcion_hechos"] or "").split())
    cuestion = " ".join((row["cuestion_planteada"] or "").split())
    contestacion = (row["contestacion_completa"] or "").strip()

    header = (
        f"[Consulta: {num_consulta} | Fecha: {fecha_iso or fecha_salida} | "
        f"Órgano: {organo} | Normativa: {normativa}]\n"
        f"CUESTIÓN PLANTEADA: {cuestion[:500]}\n"
    )

    # Cuerpo principal combinando hechos y contestación
    full_body = f"HECHOS: {hechos}\nCONTESTACIÓN: {contestacion}"

    chunks_text: List[str] = []
    if len(full_body) <= max_chars:
        chunks_text.append(f"{header}CONTEXTO: {full_body}")
    else:
        start = 0
        body_len = len(full_body)
        while start < body_len:
            end = min(start + max_chars, body_len)
            # Intentar cortar en salto de párrafo o punto cercano para no partir frases jurídicas
            if end < body_len:
                last_break = max(
                    full_body.rfind("\n\n", start, end),
                    full_body.rfind(". ", start, end),
                )
                if last_break > start + (max_chars // 2):
                    end = last_break + 1

            segment = full_body[start:end].strip()
            if segment:
                chunks_text.append(f"{header}CONTEXTO: {segment}")

            if end >= body_len:
                break
            start = max(start + 1, end - overlap_chars)

    chunk_records = []
    for idx, text in enumerate(chunks_text):
        # Prefijo oficial de documento para modelos EmbeddingGemma MRL
        embed_input = (
            f"title: Consulta Vinculante {num_consulta} ({organo}) | text: {text}"
            if "embeddinggemma" in OLLAMA_EMBED_MODEL.lower()
            else text
        )
        chunk_records.append(
            {
                "chunk_id": f"{num_consulta}_{idx}",
                "num_consulta": num_consulta,
                "chunk_index": idx,
                "fecha_iso": fecha_iso,
                "organo": organo[:200],
                "text_to_embed": embed_input,
            }
        )

    return chunk_records


def embed_batch_ollama(client: httpx.Client, texts: List[str]) -> List[List[float]]:
    """
    Vectoriza un lote de textos contra Ollama local (/api/embed soporta batching nativo).
    """
    resp = client.post(
        f"{OLLAMA_BASE_URL}/api/embed",
        json={"model": OLLAMA_EMBED_MODEL, "input": texts},
    )
    if resp.status_code == 200:
        embeddings = resp.json().get("embeddings", [])
        if len(embeddings) == len(texts):
            return [normalize_l2(vec) for vec in embeddings]

    # Fallback secuencial si la versión de Ollama no soporta batch en /api/embed
    vectors = []
    for t in texts:
        r = client.post(
            f"{OLLAMA_BASE_URL}/api/embeddings",
            json={"model": OLLAMA_EMBED_MODEL, "prompt": t},
        )
        r.raise_for_status()
        vectors.append(normalize_l2(r.json()["embedding"]))
    return vectors


def load_checkpoint() -> set:
    if CHECKPOINT_FILE.exists():
        try:
            data = json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))
            return set(data.get("completed_consultas", []))
        except Exception:
            return set()
    return set()


def save_checkpoint(completed: set):
    CHECKPOINT_FILE.write_text(
        json.dumps({"completed_consultas": list(completed), "updated_at": datetime.now().isoformat()}),
        encoding="utf-8",
    )


def main():
    parser = argparse.ArgumentParser(description="Ingesta por lotes a Supabase pgvector (halfvec 768D MRL)")
    parser.add_argument("--limit", type=int, default=0, help="Limitar número de consultas a procesar (ej. 10 para test)")
    parser.add_argument("--batch-size", type=int, default=100, help="Tamaño de lote para upsert en Supabase (default: 100)")
    parser.add_argument("--embed-batch", type=int, default=16, help="Tamaño de sub-lote para Ollama GPU (default: 16)")
    parser.add_argument("--year", type=str, default="", help="Filtrar por año de mes_scrape (ej. 2025)")
    parser.add_argument("--dry-run", action="store_true", help="Prueba chunking y Ollama sin subir a Supabase")
    args = parser.parse_args()

    if not SQLITE_DB_PATH.exists():
        raise FileNotFoundError(f"No se encontró la base de datos SQLite en {SQLITE_DB_PATH}")

    supabase: Optional[Client] = None
    if not args.dry_run:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("Debes configurar SUPABASE_URL y SUPABASE_KEY en backend/.env (o usar --dry-run)")
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    completed_consultas = load_checkpoint()
    print(f"[*] Conectando a SQLite local: {SQLITE_DB_PATH}")
    print(f"[*] Consultas ya procesadas en checkpoint: {len(completed_consultas)}")

    conn = sqlite3.connect(str(SQLITE_DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    query = "SELECT * FROM consultas"
    params = []
    if args.year:
        query += " WHERE mes_scrape LIKE ?"
        params.append(f"{args.year}%")
    query += " ORDER BY mes_scrape DESC, num_consulta ASC"
    if args.limit > 0:
        query += f" LIMIT {args.limit}"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    rows_to_process = [r for r in rows if r["num_consulta"] not in completed_consultas]
    print(f"[*] Consultas pendientes por procesar en esta sesión: {len(rows_to_process)}")

    if not rows_to_process:
        print("[✓] Nada pendiente por procesar.")
        return

    http_client = httpx.Client(timeout=120.0)
    supabase_buffer: List[Dict[str, Any]] = []
    consultas_in_buffer: List[str] = []
    total_chunks_uploaded = 0

    try:
        for row in tqdm(rows_to_process, desc="Procesando Consultas"):
            chunks = build_contextual_chunks(row)

            # Vectorizar chunks en sub-lotes para no saturar VRAM de la Jetson
            for i in range(0, len(chunks), args.embed_batch):
                sub_chunks = chunks[i : i + args.embed_batch]
                texts = [c["text_to_embed"] for c in sub_chunks]
                vectors = embed_batch_ollama(http_client, texts)

                for c_meta, vec in zip(sub_chunks, vectors):
                    supabase_buffer.append(
                        {
                            "chunk_id": c_meta["chunk_id"],
                            "num_consulta": c_meta["num_consulta"],
                            "chunk_index": c_meta["chunk_index"],
                            "fecha_iso": c_meta["fecha_iso"],
                            "organo": c_meta["organo"],
                            "embedding": vec,  # halfvec(768) en Supabase
                        }
                    )

            consultas_in_buffer.append(row["num_consulta"])

            if args.dry_run:
                sample = supabase_buffer[0]
                print(f"\n[DRY-RUN] Chunk generado: {sample['chunk_id']} | Fecha: {sample['fecha_iso']}")
                print(f"[DRY-RUN] Dimensión vector: {len(sample['embedding'])}D | Primeros 5 valores: {sample['embedding'][:5]}")
                print(f"[DRY-RUN] Preview texto embebido:\n{chunks[0]['text_to_embed'][:400]}...\n")
                break

            # Upsert a Supabase al alcanzar el tamaño de lote (100)
            if len(supabase_buffer) >= args.batch_size:
                while len(supabase_buffer) >= args.batch_size:
                    batch_to_send = supabase_buffer[: args.batch_size]
                    supabase.table("consultas_chunks").upsert(batch_to_send).execute()
                    total_chunks_uploaded += len(batch_to_send)
                    supabase_buffer = supabase_buffer[args.batch_size :]

                completed_consultas.update(consultas_in_buffer)
                save_checkpoint(completed_consultas)
                consultas_in_buffer.clear()

        # Subir remanente final en el buffer
        if supabase_buffer and not args.dry_run:
            for i in range(0, len(supabase_buffer), args.batch_size):
                batch_to_send = supabase_buffer[i : i + args.batch_size]
                supabase.table("consultas_chunks").upsert(batch_to_send).execute()
                total_chunks_uploaded += len(batch_to_send)

            completed_consultas.update(consultas_in_buffer)
            save_checkpoint(completed_consultas)

        print(f"\n[✓] Proceso finalizado. Total chunks subidos a Supabase: {total_chunks_uploaded}")

    finally:
        http_client.close()


if __name__ == "__main__":
    main()
