# 🏛️ hacienda-ESP-rag — Matryoshka Legal RAG (Edge + Cloud)

> **DevTool demostrativa y educativa:** Cómo **Matryoshka Representation Learning (MRL)** con **EmbeddingGemma** permite truncar vectores de `768D` a `128D`, ahorrando un **83.3% de memoria RAM** sin apenas pérdida de *Recall@K* sobre **36.053 Consultas Vinculantes** de la Dirección General de Tributos (Hacienda Española, 2016–2026).

---

## 🧠 Arquitectura Híbrida: "Hidratación Local" (Edge + Cloud)

Para indexar más de **1 GB de textos tributarios** sin superar el límite de **500 MB del Free Tier de Supabase**, este proyecto separa el índice semántico ligero del almacenamiento documental pesado:

1. **Motor IA Edge (NVIDIA Jetson Orin / Local):** Ejecuta **Ollama** con `embeddinggemma` (768D nativo con entrenamiento Matryoshka).
2. **Índice Vectorial Ultraligero (Supabase Cloud `pgvector`):**
   - Guarda únicamente metadatos mínimos (`chunk_id`, `num_consulta`, `fecha_iso`, `organo`) y un vector `halfvec(768)` (`float16`, 2 bytes/dimensión = ~276 MB en total).
   - Mediante `subvector(embedding, 1, dim)` en SQL e índices funcionales HNSW, permite truncar en vivo a **128D, 256D, 512D o 768D** para medir latencia y *Recall@K* lado a lado.
3. **Cold Storage & Hidratación Local (SQLite `consultas_vinculantes.db`):**
   - El texto íntegro de las leyes y contestaciones (1.05 GB) jamás sube a la nube.
   - Cuando Supabase devuelve los `num_consulta` ganadores, **FastAPI** hidrata el documento completo en `< 2 ms` leyendo desde el SQLite local por clave primaria.
4. **Frontend Comparativo Side-by-Side (Next.js + Tailwind):**
   - Compara en paralelo **RAG Tradicional (768D)** vs **Edge RAG Matryoshka (128D / 256D / 512D)**.

---

## 📁 Estructura del Monorepo

```text
.
├── backend/
│   ├── main.py                  # API FastAPI (/api/search, /api/health + Hidratación SQLite)
│   ├── ingest_to_supabase.py    # Ingesta por lotes con Chunking Contextual e inyección de cabeceras
│   ├── supabase_schema.sql      # Esquema pgvector con halfvec(768) y RPC match_documents
│   ├── requirements.txt         # Dependencias del backend
│   └── .env.example             # Variables de entorno de ejemplo
├── frontend/                    # UI Side-by-Side en Next.js (App Router, TS, Tailwind)
├── scraper_petete.py            # Scraper resiliente de la DGT (Knosys)
└── consultas_vinculantes.db     # [Ignorado en Git] Cold Storage local (1.05 GB, 36.053 consultas)
```

---

## 🚀 Guía de Inicio Rápido (Backend & Ingesta)

### 1. Preparar Supabase
Abre el **SQL Editor** en tu proyecto de Supabase y ejecuta el contenido íntegro de [`backend/supabase_schema.sql`](./backend/supabase_schema.sql).

### 2. Configurar el Entorno Python
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```
Edita `backend/.env` con tu `SUPABASE_URL` y `SUPABASE_KEY`.

### 3. Asegurar el modelo en Ollama
```bash
ollama pull embeddinggemma
```

### 4. Probar el Script de Ingesta (Modo Dry-Run / Test)
Antes de lanzar la ingesta completa, verifica la conexión con SQLite y Ollama procesando 1 consulta en seco:
```powershell
python ingest_to_supabase.py --dry-run --limit 1
```
Para subir una muestra inicial de 50 consultas a Supabase:
```powershell
python ingest_to_supabase.py --limit 50
```

### 5. Levantar la API FastAPI
```powershell
uvicorn main:app --reload --port 8000
```
- **Estado del sistema:** `GET http://localhost:8000/api/health`
- **Documentación interactiva (Swagger):** `http://localhost:8000/docs`
