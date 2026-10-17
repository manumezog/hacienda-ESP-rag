import os
import time
import math
import sqlite3
from pathlib import Path
from typing import List, Optional, Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import create_client, Client

# Cargar variables de entorno
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "embeddinggemma")

# Resolver ruta de SQLite tanto si se ejecuta desde la raíz como desde backend/
DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "consultas_vinculantes.db"
SQLITE_DB_PATH = Path(os.getenv("SQLITE_DB_PATH", str(DEFAULT_DB_PATH))).resolve()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "google/gemini-2.0-flash-001")

app = FastAPI(
    title="Hacienda-ESP-RAG API (Matryoshka Edge + Cloud)",
    description="Orquestador híbrido con truncado Matryoshka (MRL), búsqueda en Supabase pgvector (halfvec) e hidratación local desde SQLite.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cliente Supabase inicializado bajo demanda
_supabase_client: Optional[Client] = None


def get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise HTTPException(
                status_code=500,
                detail="Faltan credenciales SUPABASE_URL o SUPABASE_KEY en el archivo .env",
            )
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase_client


# =============================================================================
# Modelos Pydantic
# =============================================================================

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=3, description="Consulta fiscal o tributaria en lenguaje natural")
    dimensions: Literal[128, 256, 512, 768] = Field(
        default=128,
        description="Dimensiones Matryoshka (128, 256, 512 o 768)",
    )
    top_k: int = Field(default=5, ge=1, le=20, description="Número de documentos a recuperar")
    generate_answer: bool = Field(
        default=False,
        description="Si es True, genera síntesis jurídica con LLM usando el contexto hidratado",
    )


class HydratedDocument(BaseModel):
    chunk_id: str
    num_consulta: str
    chunk_index: int
    similarity: float
    fecha_salida: str
    organo: str
    normativa: str
    descripcion_hechos: str
    cuestion_planteada: str
    contestacion_completa: str


class LatencyMetrics(BaseModel):
    embedding_ms: float
    vector_search_ms: float
    sqlite_hydration_ms: float
    llm_generation_ms: float
    total_ms: float


class SearchResponse(BaseModel):
    query: str
    dimensions: int
    ram_savings_pct: float
    bytes_per_vector_float16: int
    latency: LatencyMetrics
    results: List[HydratedDocument]
    synthesized_answer: Optional[str] = None


# =============================================================================
# Funciones Auxiliares (MRL Truncation, Ollama, SQLite Hydration)
# =============================================================================

def truncate_and_normalize_mrl(vector: List[float], dimensions: int) -> List[float]:
    """
    Aplica el truncado Matryoshka (MRL) a las primeras `dimensions` componentes
    y re-normaliza con norma L2 para preservar la exactitud de la similitud coseno.
    """
    sliced = vector[:dimensions]
    norm = math.sqrt(sum(x * x for x in sliced))
    if norm > 0:
        return [round(x / norm, 6) for x in sliced]
    return sliced


async def get_ollama_embedding(text: str) -> List[float]:
    """
    Obtiene el vector nativo de 768D desde Ollama local.
    Para EmbeddingGemma en tareas de búsqueda, añade el prefijo de tarea recomendado si no está presente.
    """
    formatted_query = f"task: search result | query: {text}" if "embeddinggemma" in OLLAMA_EMBED_MODEL.lower() else text

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Endpoint moderno de Ollama (/api/embed)
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/embed",
                json={"model": OLLAMA_EMBED_MODEL, "input": formatted_query},
            )
            if resp.status_code == 200:
                data = resp.json()
                embeddings = data.get("embeddings")
                if embeddings and len(embeddings) > 0:
                    return embeddings[0]

            # Fallback a endpoint clásico (/api/embeddings)
            resp_legacy = await client.post(
                f"{OLLAMA_BASE_URL}/api/embeddings",
                json={"model": OLLAMA_EMBED_MODEL, "prompt": formatted_query},
            )
            resp_legacy.raise_for_status()
            return resp_legacy.json()["embedding"]

        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"No se pudo conectar con Ollama en {OLLAMA_BASE_URL}. Asegúrate de que esté corriendo (`ollama serve`). Error: {exc}",
            )


def hydrate_from_sqlite(matches: List[dict]) -> List[HydratedDocument]:
    """
    Hidratación Local (Cold Storage):
    Recibe los metadatos ligeros de Supabase (num_consulta, similarity)
    y recupera instantáneamente los textos completos desde el SQLite local de 1 GB.
    """
    if not matches:
        return []

    if not SQLITE_DB_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail=f"No se encontró la base de datos SQLite local en: {SQLITE_DB_PATH}",
        )

    num_consultas = list({m["num_consulta"] for m in matches})
    placeholders = ",".join(["?"] * len(num_consultas))

    conn = sqlite3.connect(str(SQLITE_DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT num_consulta, organo, fecha_salida, normativa,
                   descripcion_hechos, cuestion_planteada, contestacion_completa
            FROM consultas
            WHERE num_consulta IN ({placeholders})
            """,
            num_consultas,
        )
        rows_by_id = {row["num_consulta"]: dict(row) for row in cursor.fetchall()}
    finally:
        conn.close()

    hydrated_results: List[HydratedDocument] = []
    for match in matches:
        num_c = match["num_consulta"]
        local_doc = rows_by_id.get(num_c, {})
        hydrated_results.append(
            HydratedDocument(
                chunk_id=match.get("chunk_id", f"{num_c}_0"),
                num_consulta=num_c,
                chunk_index=match.get("chunk_index", 0),
                similarity=round(float(match.get("similarity", 0.0)), 4),
                fecha_salida=local_doc.get("fecha_salida") or str(match.get("fecha_iso", "")),
                organo=local_doc.get("organo") or match.get("organo", ""),
                normativa=local_doc.get("normativa", ""),
                descripcion_hechos=local_doc.get("descripcion_hechos", ""),
                cuestion_planteada=local_doc.get("cuestion_planteada", ""),
                contestacion_completa=local_doc.get("contestacion_completa", ""),
            )
        )

    return hydrated_results


async def generate_llm_response(query: str, docs: List[HydratedDocument]) -> Optional[str]:
    """
    Genera una respuesta legal citando las consultas vinculantes hidratadas,
    usando OpenRouter o la API directa de Gemini si están configuradas.
    Recarga .env en caliente para no depender de reinicios del servidor.
    """
    if not docs:
        return None

    load_dotenv(override=True)
    openrouter_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    llm_model = os.getenv("LLM_MODEL", "google/gemini-2.0-flash-001").strip()

    context_blocks = []
    for d in docs[:3]:
        context_blocks.append(
            f"--- CONSULTA VINCULANTE {d.num_consulta} (Fecha: {d.fecha_salida} | Órgano: {d.organo}) ---\n"
            f"Normativa: {d.normativa}\n"
            f"Cuestión: {d.cuestion_planteada}\n"
            f"Contestación: {d.contestacion_completa[:3000]}"
        )
    context_text = "\n\n".join(context_blocks)

    system_prompt = (
        "Eres un asesor fiscal experto en derecho tributario español. "
        "Responde de forma clara, directa y estructurada (máximo 200 palabras) a la consulta del usuario "
        "basándote EXCLUSIVAMENTE en las Consultas Vinculantes de la Dirección General de Tributos (DGT) "
        "proporcionadas en el contexto. Cita siempre el número de consulta vinculante (ej. V1234-23) y la normativa aplicable."
    )

    last_error = None

    if gemini_key:
        gemini_models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"]
        async with httpx.AsyncClient(timeout=45.0) as client:
            for g_model in gemini_models:
                try:
                    resp = await client.post(
                        f"https://generativelanguage.googleapis.com/v1beta/models/{g_model}:generateContent?key={gemini_key}",
                        json={
                            "contents": [
                                {
                                    "parts": [
                                        {"text": f"{system_prompt}\n\nPregunta: {query}\n\nContexto DGT:\n{context_text}"}
                                    ]
                                }
                            ],
                            "generationConfig": {"temperature": 0.1},
                        },
                    )
                    if resp.status_code == 200:
                        candidates = resp.json().get("candidates", [])
                        if candidates:
                            return candidates[0]["content"]["parts"][0]["text"]
                    else:
                        last_error = f"Gemini ({g_model}) HTTP {resp.status_code}: {resp.text[:200]}"
                except Exception as exc:
                    last_error = f"Error de red Gemini ({g_model}): {exc}"

    if openrouter_key:
        async with httpx.AsyncClient(timeout=45.0) as client:
            try:
                resp = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {openrouter_key}"},
                    json={
                        "model": llm_model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": f"Pregunta: {query}\n\nContexto DGT:\n{context_text}"},
                        ],
                        "temperature": 0.1,
                    },
                )
                if resp.status_code == 200:
                    return resp.json()["choices"][0]["message"]["content"]
                else:
                    last_error = f"OpenRouter HTTP {resp.status_code}: {resp.text[:200]}"
            except Exception as exc:
                last_error = f"Error de red OpenRouter: {exc}"

    if not gemini_key and not openrouter_key:
        return "⚠️ No se detectó GEMINI_API_KEY ni OPENROUTER_API_KEY en el archivo backend/.env de la Jetson."

    if last_error:
        return f"⚠️ No se pudo generar la síntesis LLM ({last_error})"

    return None


# =============================================================================
# Endpoints de la API
# =============================================================================

@app.get("/api/health")
async def health_check():
    """Verifica el estado de los 3 pilares: SQLite Local, Ollama Local y Configuración Supabase."""
    sqlite_ok = SQLITE_DB_PATH.exists()
    total_local_docs = 0
    if sqlite_ok:
        conn = sqlite3.connect(str(SQLITE_DB_PATH))
        try:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM consultas")
            total_local_docs = cur.fetchone()[0]
        finally:
            conn.close()

    ollama_ok = False
    ollama_models = []
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if r.status_code == 200:
                ollama_ok = True
                ollama_models = [m["name"] for m in r.json().get("models", [])]
    except Exception:
        pass

    return {
        "status": "ok" if (sqlite_ok and ollama_ok) else "degraded",
        "sqlite_cold_storage": {
            "connected": sqlite_ok,
            "path": str(SQLITE_DB_PATH),
            "total_documents": total_local_docs,
        },
        "ollama_edge_engine": {
            "connected": ollama_ok,
            "url": OLLAMA_BASE_URL,
            "configured_model": OLLAMA_EMBED_MODEL,
            "available_models": ollama_models,
        },
        "supabase_cloud": {
            "configured": bool(SUPABASE_URL and SUPABASE_KEY),
            "url": SUPABASE_URL,
        },
    }


@app.post("/api/search", response_model=SearchResponse)
async def search_consultas(req: SearchRequest):
    """
    Flujo Completo Híbrido Matryoshka:
    1. Vectoriza la query en 768D con Ollama local (EmbeddingGemma).
    2. Trunca el vector en caliente a `req.dimensions` (128/256/512/768) y re-normaliza (L2).
    3. Ejecuta RPC `match_documents` en Supabase (slicing dinámico sobre halfvec).
    4. Hidrata los textos íntegros desde el SQLite local (`consultas_vinculantes.db`).
    """
    t_start = time.perf_counter()

    # 1. Embedding local en 768D con Ollama
    t0 = time.perf_counter()
    raw_vector_768 = await get_ollama_embedding(req.query)
    if len(raw_vector_768) < req.dimensions:
        raise HTTPException(
            status_code=400,
            detail=f"El modelo Ollama devolvió un vector de {len(raw_vector_768)} dimensiones, menor a las {req.dimensions} solicitadas.",
        )

    # 2. Truncado Matryoshka en caliente + Normalización L2
    truncated_vector = truncate_and_normalize_mrl(raw_vector_768, req.dimensions)
    embedding_ms = (time.perf_counter() - t0) * 1000

    # 3. Búsqueda vectorial en Supabase (RPC match_documents)
    # Solicitamos un margen extra (top_k * 4) para deduplicar por num_consulta
    # y garantizar que el Top-K final contenga siempre K consultas vinculantes distintas.
    t1 = time.perf_counter()
    supabase = get_supabase()
    try:
        rpc_response = supabase.rpc(
            "match_documents",
            {
                "query_embedding": truncated_vector,
                "match_dimensions": req.dimensions,
                "match_count": min(req.top_k * 4, 60),
            },
        ).execute()
        raw_matches = rpc_response.data or []
        seen_consultas = set()
        matches = []
        for m in raw_matches:
            num_c = m.get("num_consulta")
            if num_c and num_c not in seen_consultas:
                seen_consultas.add(num_c)
                matches.append(m)
                if len(matches) >= req.top_k:
                    break
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Error al consultar la función RPC match_documents en Supabase: {exc}",
        )
    vector_search_ms = (time.perf_counter() - t1) * 1000

    # 4. Hidratación local desde SQLite (Cold Storage)
    t2 = time.perf_counter()
    hydrated_docs = hydrate_from_sqlite(matches)
    sqlite_hydration_ms = (time.perf_counter() - t2) * 1000

    # 5. Síntesis opcional con LLM
    t3 = time.perf_counter()
    synthesized_answer = None
    if req.generate_answer and hydrated_docs:
        synthesized_answer = await generate_llm_response(req.query, hydrated_docs)
    llm_generation_ms = (time.perf_counter() - t3) * 1000

    total_ms = (time.perf_counter() - t_start) * 1000
    ram_savings_pct = round((1.0 - (req.dimensions / 768.0)) * 100, 1)

    return SearchResponse(
        query=req.query,
        dimensions=req.dimensions,
        ram_savings_pct=ram_savings_pct,
        bytes_per_vector_float16=req.dimensions * 2,
        latency=LatencyMetrics(
            embedding_ms=round(embedding_ms, 2),
            vector_search_ms=round(vector_search_ms, 2),
            sqlite_hydration_ms=round(sqlite_hydration_ms, 2),
            llm_generation_ms=round(llm_generation_ms, 2),
            total_ms=round(total_ms, 2),
        ),
        results=hydrated_docs,
        synthesized_answer=synthesized_answer,
    )
