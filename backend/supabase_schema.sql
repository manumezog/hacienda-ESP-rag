-- =============================================================================
-- HACIENDA-ESP-RAG: Esquema Vectorial Matryoshka (MRL) en Supabase (pgvector)
-- =============================================================================
-- Estrategia de Almacenamiento:
-- 1. Guardamos un único vector halfvec(768) (float16, 2 bytes/dim = 1.5 KB/chunk)
--    para entrar holgadamente en los 500 MB del Free Tier de Supabase (~276 MB).
-- 2. NO guardamos el texto pesado en Supabase (Patrón de Hidratación Local):
--    el texto completo se recupera en milisegundos desde el SQLite local en la Jetson.
-- 3. El truncado Matryoshka (768D -> 512D / 256D / 128D) se ejecuta al vuelo
--    mediante subvector() en SQL + SET LOCAL statement_timeout = '30s'.
-- =============================================================================

-- 1. Habilitar extensión pgvector (0.7.0+ requerido para halfvec y subvector)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabla ligera de chunks y metadatos
CREATE TABLE IF NOT EXISTS consultas_chunks (
    chunk_id TEXT PRIMARY KEY,              -- Ej: "V2274-23_0"
    num_consulta TEXT NOT NULL,             -- FK lógica al SQLite local: "V2274-23"
    chunk_index INT NOT NULL DEFAULT 0,     -- Orden del fragmento dentro de la consulta
    fecha_iso DATE,                         -- Fecha parseada YYYY-MM-DD para filtros
    organo TEXT,                            -- Órgano directivo emisor
    embedding halfvec(768) NOT NULL         -- Vector Matryoshka completo en precisión float16
);

-- Índices B-Tree para búsquedas por metadatos
CREATE INDEX IF NOT EXISTS idx_consultas_chunks_num_consulta ON consultas_chunks (num_consulta);
CREATE INDEX IF NOT EXISTS idx_consultas_chunks_fecha_iso ON consultas_chunks (fecha_iso);

-- Ampliar el timeout de los roles de PostgREST en Supabase Free Tier (por defecto anon = 3s)
ALTER ROLE anon SET statement_timeout = '30s';
ALTER ROLE authenticated SET statement_timeout = '30s';
ALTER ROLE service_role SET statement_timeout = '60s';
ALTER ROLE authenticator SET statement_timeout = '30s';
NOTIFY pgrst, 'reload config';

-- 3. Función RPC optimizada para búsqueda semántica con Slicing Dinámico Matryoshka
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding halfvec,
    match_dimensions INT DEFAULT 128,
    match_count INT DEFAULT 10,
    min_similarity FLOAT DEFAULT 0.0
)
RETURNS TABLE (
    chunk_id TEXT,
    num_consulta TEXT,
    chunk_index INT,
    fecha_iso DATE,
    organo TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    q_vec halfvec;
BEGIN
    SET LOCAL statement_timeout = '30s';

    -- Asegurar que el vector de entrada está truncado a match_dimensions
    IF vector_dims(query_embedding) > match_dimensions THEN
        q_vec := subvector(query_embedding, 1, match_dimensions);
    ELSE
        q_vec := query_embedding;
    END IF;

    IF match_dimensions = 768 THEN
        RETURN QUERY
        SELECT
            c.chunk_id,
            c.num_consulta,
            c.chunk_index,
            c.fecha_iso,
            c.organo,
            (1 - (c.embedding <=> q_vec::halfvec(768)))::FLOAT AS similarity
        FROM consultas_chunks c
        ORDER BY c.embedding <=> q_vec::halfvec(768)
        LIMIT match_count;

    ELSIF match_dimensions = 128 THEN
        RETURN QUERY
        SELECT
            c.chunk_id,
            c.num_consulta,
            c.chunk_index,
            c.fecha_iso,
            c.organo,
            (1 - (subvector(c.embedding, 1, 128)::halfvec(128) <=> q_vec::halfvec(128)))::FLOAT AS similarity
        FROM consultas_chunks c
        ORDER BY subvector(c.embedding, 1, 128)::halfvec(128) <=> q_vec::halfvec(128)
        LIMIT match_count;

    ELSIF match_dimensions = 256 THEN
        RETURN QUERY
        SELECT
            c.chunk_id,
            c.num_consulta,
            c.chunk_index,
            c.fecha_iso,
            c.organo,
            (1 - (subvector(c.embedding, 1, 256)::halfvec(256) <=> q_vec::halfvec(256)))::FLOAT AS similarity
        FROM consultas_chunks c
        ORDER BY subvector(c.embedding, 1, 256)::halfvec(256) <=> q_vec::halfvec(256)
        LIMIT match_count;

    ELSIF match_dimensions = 512 THEN
        RETURN QUERY
        SELECT
            c.chunk_id,
            c.num_consulta,
            c.chunk_index,
            c.fecha_iso,
            c.organo,
            (1 - (subvector(c.embedding, 1, 512)::halfvec(512) <=> q_vec::halfvec(512)))::FLOAT AS similarity
        FROM consultas_chunks c
        ORDER BY subvector(c.embedding, 1, 512)::halfvec(512) <=> q_vec::halfvec(512)
        LIMIT match_count;

    ELSE
        RETURN QUERY
        SELECT
            c.chunk_id,
            c.num_consulta,
            c.chunk_index,
            c.fecha_iso,
            c.organo,
            (1 - (subvector(c.embedding, 1, match_dimensions) <=> q_vec))::FLOAT AS similarity
        FROM consultas_chunks c
        ORDER BY subvector(c.embedding, 1, match_dimensions) <=> q_vec
        LIMIT match_count;
    END IF;
END;
$$;
