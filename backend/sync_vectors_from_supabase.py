import os
import json
import time
from pathlib import Path
import numpy as np
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY", "")

OUT_DIR = Path(__file__).resolve().parent.parent
VEC_FILE = OUT_DIR / "local_vectors_fp16.npy"
META_FILE = OUT_DIR / "local_chunks_meta.json"


def parse_halfvec(raw_emb) -> list:
    if isinstance(raw_emb, list):
        return raw_emb
    if isinstance(raw_emb, str):
        s = raw_emb.strip("[](){}")
        return [float(x) for x in s.split(",") if x]
    return []


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Error: Faltan SUPABASE_URL o SUPABASE_KEY en .env")
        return

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }

    batch_size = 1000
    offset = 0
    all_meta = []
    all_vecs = []

    print("🚀 Descargando vectores halfvec(768) desde Supabase a la Jetson...")
    t0 = time.time()

    with httpx.Client(http1=True, timeout=30.0) as client:
        while True:
            url = (
                f"{SUPABASE_URL}/rest/v1/consultas_chunks"
                f"?select=chunk_id,num_consulta,chunk_index,fecha_iso,organo,embedding"
                f"&order=chunk_id.asc&limit={batch_size}&offset={offset}"
            )
            resp = client.get(url, headers=headers)
            if resp.status_code != 200:
                print(f"⚠️ HTTP {resp.status_code} en offset {offset}: {resp.text[:200]}")
                time.sleep(2)
                continue

            rows = resp.json()
            if not rows:
                break

            for r in rows:
                vec = parse_halfvec(r.get("embedding"))
                if len(vec) == 768:
                    all_vecs.append(vec)
                    all_meta.append(
                        {
                            "chunk_id": r["chunk_id"],
                            "num_consulta": r["num_consulta"],
                            "chunk_index": r.get("chunk_index", 0),
                            "fecha_iso": r.get("fecha_iso"),
                            "organo": r.get("organo"),
                        }
                    )

            offset += len(rows)
            elapsed = time.time() - t0
            print(f"  ✓ Descargados {len(all_vecs)} vectores ({elapsed:.1f}s)...")

            if len(rows) < batch_size:
                break

    if not all_vecs:
        print("❌ No se encontraron vectores de 768D.")
        return

    print("💾 Guardando matriz float16 en disco NVMe local...")
    mat = np.array(all_vecs, dtype=np.float16)
    np.save(str(VEC_FILE), mat)
    with open(META_FILE, "w", encoding="utf-8") as f:
        json.dump(all_meta, f, ensure_ascii=False)

    size_mb = VEC_FILE.stat().st_size / (1024 * 1024)
    print(f"✅ ¡Completado! {len(all_vecs)} vectores guardados en {VEC_FILE.name} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
