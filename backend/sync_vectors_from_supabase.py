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


def save_snapshot(all_vecs: list, all_meta: list) -> None:
    tmp_vec = OUT_DIR / "local_vectors_fp16.tmp.npy"
    tmp_meta = OUT_DIR / "local_chunks_meta.tmp.json"
    mat = np.array(all_vecs, dtype=np.float16)
    np.save(str(tmp_vec), mat)
    with open(tmp_meta, "w", encoding="utf-8") as f:
        json.dump(all_meta, f, ensure_ascii=False)
    os.replace(str(tmp_vec), str(VEC_FILE))
    os.replace(str(tmp_meta), str(META_FILE))


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Error: Faltan SUPABASE_URL o SUPABASE_KEY en .env", flush=True)
        return

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }

    batch_size = 500
    last_chunk_id = ""
    all_meta = []
    all_vecs = []

    if VEC_FILE.exists() and META_FILE.exists():
        try:
            existing_mat = np.load(str(VEC_FILE))
            with open(META_FILE, "r", encoding="utf-8") as f:
                all_meta = json.load(f)
            if len(existing_mat) == len(all_meta) and len(all_meta) > 0:
                all_vecs = existing_mat.tolist()
                last_chunk_id = all_meta[-1]["chunk_id"]
                print(
                    f"🔄 Reanudando desde {len(all_vecs)} vectores locales (último ID: {last_chunk_id})...",
                    flush=True,
                )
        except Exception:
            all_meta = []
            all_vecs = []

    print("🚀 Descargando vectores halfvec(768) desde Supabase a la Jetson (paginación O(1) por PK)...", flush=True)
    t0 = time.time()

    with httpx.Client(http1=True, timeout=30.0) as client:
        while True:
            filter_q = f"&chunk_id=gt.{last_chunk_id}" if last_chunk_id else ""
            url = (
                f"{SUPABASE_URL}/rest/v1/consultas_chunks"
                f"?select=chunk_id,num_consulta,chunk_index,fecha_iso,organo,embedding"
                f"{filter_q}&order=chunk_id.asc&limit={batch_size}"
            )
            try:
                resp = client.get(url, headers=headers)
            except Exception as e:
                print(f"⚠️ Error de red ({e}), reintentando en 2s...", flush=True)
                time.sleep(2)
                continue

            if resp.status_code != 200:
                print(f"⚠️ HTTP {resp.status_code} tras {last_chunk_id}: {resp.text[:200]}", flush=True)
                time.sleep(2)
                continue

            rows = resp.json()
            if not rows:
                break

            for r in rows:
                last_chunk_id = r["chunk_id"]
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

            elapsed = time.time() - t0
            print(
                f"  ✓ Descargados {len(all_vecs)} vectores ({elapsed:.1f}s) | último: {last_chunk_id}",
                flush=True,
            )

            # Guardar snapshot atómico cada 5.000 vectores para que la Jetson ya pueda usarlos en vivo
            if len(all_vecs) % 5000 < batch_size:
                save_snapshot(all_vecs, all_meta)
                size_mb = VEC_FILE.stat().st_size / (1024 * 1024)
                print(f"  💾 Snapshot intermedio activo en local ({len(all_vecs)} vectores, {size_mb:.1f} MB)", flush=True)

            if len(rows) < batch_size:
                break

    if not all_vecs:
        print("❌ No se encontraron vectores de 768D.", flush=True)
        return

    print("💾 Guardando matriz final float16 en disco NVMe local...", flush=True)
    save_snapshot(all_vecs, all_meta)
    size_mb = VEC_FILE.stat().st_size / (1024 * 1024)
    print(f"✅ ¡Completado! {len(all_vecs)} vectores guardados en {VEC_FILE.name} ({size_mb:.1f} MB)", flush=True)


if __name__ == "__main__":
    main()
