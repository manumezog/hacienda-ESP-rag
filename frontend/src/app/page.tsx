"use client";

import React, { useState } from "react";
import {
  Search,
  Cpu,
  Database,
  Zap,
  HardDrive,
  Scale,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Server,
  AlertCircle,
} from "lucide-react";

type DimensionOption = 128 | 256 | 512;

interface HydratedDocument {
  chunk_id: string;
  num_consulta: string;
  chunk_index: number;
  similarity: number;
  fecha_salida: string;
  organo: string;
  normativa: string;
  descripcion_hechos: string;
  cuestion_planteada: string;
  contestacion_completa: string;
}

interface LatencyMetrics {
  embedding_ms: number;
  vector_search_ms: number;
  sqlite_hydration_ms: number;
  llm_generation_ms: number;
  total_ms: number;
}

interface SearchResponse {
  query: string;
  dimensions: number;
  ram_savings_pct: number;
  bytes_per_vector_float16: number;
  latency: LatencyMetrics;
  results: HydratedDocument[];
  synthesized_answer?: string | null;
}

const SAMPLE_QUERIES = [
  "Exención por reinversión en vivienda habitual en el IRPF cuando se compra antes de vender",
  "Tipo de IVA aplicable a los servicios de animación infantil y cantantes en eventos",
  "Aplicación del tipo reducido del 15% en Impuesto sobre Sociedades para grupo con Startup certificada por ENISA",
  "Exención en el Impuesto sobre el Patrimonio por participaciones en entidad con actividad de préstamos hipotecarios",
];

export default function MatryoshkaBenchmarkPage() {
  const [apiUrl, setApiUrl] = useState<string>(
    process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.194:8000"
  );
  const [query, setQuery] = useState<string>(SAMPLE_QUERIES[0]);
  const [mrlDimension, setMrlDimension] = useState<DimensionOption>(128);
  const [topK, setTopK] = useState<number>(5);
  const [generateAnswer, setGenerateAnswer] = useState<boolean>(false);

  const [loadingLeft, setLoadingLeft] = useState<boolean>(false);
  const [loadingRight, setLoadingRight] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [tradResult, setTradResult] = useState<SearchResponse | null>(null);
  const [mrlResult, setMrlResult] = useState<SearchResponse | null>(null);

  const runParallelSearch = async (
    searchQuery: string = query,
    targetMrlDim: DimensionOption = mrlDimension
  ) => {
    if (!searchQuery.trim()) return;
    setErrorMsg(null);
    setLoadingLeft(true);
    setLoadingRight(true);

    const baseUrl = apiUrl.replace(/\/+$/, "");

    const fetchPanel = async (dimensions: number): Promise<SearchResponse> => {
      const res = await fetch(`${baseUrl}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          dimensions,
          top_k: topK,
          generate_answer: generateAnswer,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.detail || `Error HTTP ${res.status} al conectar con ${baseUrl}`
        );
      }
      return res.json();
    };

    // Lanzar ambas llamadas en paralelo (768D vs Matryoshka Truncated)
    const leftPromise = fetchPanel(768)
      .then((data) => {
        setTradResult(data);
      })
      .finally(() => setLoadingLeft(false));

    const rightPromise = fetchPanel(targetMrlDim)
      .then((data) => {
        setMrlResult(data);
      })
      .finally(() => setLoadingRight(false));

    try {
      await Promise.all([leftPromise, rightPromise]);
    } catch (err: any) {
      setErrorMsg(
        err.message ||
          "Error al conectar con el backend FastAPI. Verifica la IP/puerto de la Jetson."
      );
    }
  };

  const handleDimensionChange = (dim: DimensionOption) => {
    setMrlDimension(dim);
    if (tradResult && query.trim()) {
      runParallelSearch(query, dim);
    }
  };

  // Calcular Recall@K empírico (solapamiento de consultas entre 768D y MRL)
  const computeRecallOverlap = () => {
    if (!tradResult || !mrlResult || tradResult.results.length === 0) return null;
    const tradIds = new Set(tradResult.results.map((r) => r.num_consulta));
    const matched = mrlResult.results.filter((r) =>
      tradIds.has(r.num_consulta)
    ).length;
    const pct = Math.round((matched / tradResult.results.length) * 100);
    return { matched, total: tradResult.results.length, pct };
  };

  const recallStats = computeRecallOverlap();
  const tradIdsSet = new Set(
    tradResult?.results.map((r) => r.num_consulta) || []
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header & DevTool Status Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-bold text-lg tracking-tight text-white">
                  hacienda-ESP-rag
                </h1>
                <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  MRL Benchmark DevTool
                </span>
              </div>
              <p className="text-xs text-slate-400">
                EmbeddingGemma 2 (Jetson Orin GPU) + Supabase pgvector (halfvec) +
                SQLite Cold Hydration (36.053 Consultas DGT)
              </p>
            </div>
          </div>

          {/* Endpoint Config & Controls */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-400 font-medium">API Edge:</span>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="bg-transparent text-slate-200 font-mono w-48 focus:outline-none focus:text-emerald-300"
                placeholder="http://192.168.1.194:8000"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
              <span className="text-slate-400">Top-K:</span>
              <select
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="bg-slate-950 text-slate-200 font-mono focus:outline-none"
              >
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
            </div>

            <label className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 cursor-pointer hover:border-slate-700">
              <input
                type="checkbox"
                checked={generateAnswer}
                onChange={(e) => setGenerateAnswer(e.target.checked)}
                className="rounded accent-emerald-500"
              />
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-300">Síntesis LLM</span>
            </label>
          </div>
        </div>
      </header>

      {/* Main Search Bar Section */}
      <section className="border-b border-slate-800/70 bg-gradient-to-b from-slate-900/40 to-slate-950 py-6 px-6">
        <div className="max-w-[1600px] mx-auto space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runParallelSearch(query, mrlDimension);
            }}
            className="flex gap-3"
          >
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Escribe una consulta tributaria (IRPF, IVA, Sociedades, Sucesiones, Aduanas...)"
                className="w-full pl-12 pr-4 py-3.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>
            <button
              type="submit"
              disabled={loadingLeft || loadingRight}
              className="px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-sm flex items-center gap-2 transition shadow-lg shadow-emerald-500/10"
            >
              <Zap className="w-4 h-4 fill-current" />
              {loadingLeft || loadingRight
                ? "Ejecutando Benchmark..."
                : "Comparar Side-by-Side"}
            </button>
          </form>

          {/* Preset Queries */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-slate-500 font-medium">
              Ejemplos reales DGT:
            </span>
            {SAMPLE_QUERIES.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQuery(sample);
                  runParallelSearch(sample, mrlDimension);
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition truncate max-w-md"
              >
                {sample}
              </button>
            ))}
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Empirical Telemetry Summary Strip */}
          {recallStats && tradResult && mrlResult && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">
                    Retención Recall@{topK} ({mrlDimension}D vs 768D)
                  </p>
                  <p className="text-xl font-bold text-emerald-400 font-mono mt-0.5">
                    {recallStats.pct}%{" "}
                    <span className="text-xs font-normal text-slate-400">
                      ({recallStats.matched}/{recallStats.total} coinciden)
                    </span>
                  </p>
                </div>
                <CheckCircle2 className="w-6 h-6 text-emerald-500/60" />
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">
                    Ahorro de Memoria Vectorial
                  </p>
                  <p className="text-xl font-bold text-cyan-400 font-mono mt-0.5">
                    -{mrlResult.ram_savings_pct}% RAM{" "}
                    <span className="text-xs font-normal text-slate-400">
                      ({mrlResult.bytes_per_vector_float16}B vs{" "}
                      {tradResult.bytes_per_vector_float16}B)
                    </span>
                  </p>
                </div>
                <HardDrive className="w-6 h-6 text-cyan-500/60" />
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">
                    Latencia Búsqueda Cloud (pgvector)
                  </p>
                  <p className="text-xl font-bold text-amber-300 font-mono mt-0.5">
                    {mrlResult.latency.vector_search_ms} ms{" "}
                    <span className="text-xs font-normal text-slate-400">
                      vs {tradResult.latency.vector_search_ms} ms
                    </span>
                  </p>
                </div>
                <Clock className="w-6 h-6 text-amber-500/60" />
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">
                    Hidratación SQLite Cold Storage
                  </p>
                  <p className="text-xl font-bold text-purple-300 font-mono mt-0.5">
                    {mrlResult.latency.sqlite_hydration_ms} ms{" "}
                    <span className="text-xs font-normal text-slate-400">
                      (0 MB texto en Supabase)
                    </span>
                  </p>
                </div>
                <Database className="w-6 h-6 text-purple-500/60" />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Side-by-Side Comparison Panels */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ==================== PANEL IZQUIERDO: RAG TRADICIONAL (768D) ==================== */}
        <section className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full bg-blue-400" />
              <div>
                <h2 className="font-semibold text-sm text-white">
                  RAG Tradicional (768D Full Vector)
                </h2>
                <p className="text-xs text-slate-400">
                  Vector completo sin truncar · 1.536 Bytes/chunk (float16)
                </p>
              </div>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/30">
              768 Dimensiones (100% RAM)
            </span>
          </div>

          {/* Metrics Strip Left */}
          {tradResult && !loadingLeft && (
            <div className="px-4 py-2.5 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center gap-4 text-xs font-mono text-slate-300">
              <span>
                Total:{" "}
                <strong className="text-white">
                  {tradResult.latency.total_ms} ms
                </strong>
              </span>
              <span>•</span>
              <span>Ollama GPU: {tradResult.latency.embedding_ms} ms</span>
              <span>•</span>
              <span>Supabase: {tradResult.latency.vector_search_ms} ms</span>
              <span>•</span>
              <span>SQLite Hydrate: {tradResult.latency.sqlite_hydration_ms} ms</span>
            </div>
          )}

          <div className="p-4 flex-1 space-y-3">
            {loadingLeft ? (
              <SkeletonLoader count={topK} />
            ) : tradResult ? (
              <>
                {tradResult.synthesized_answer && (
                  <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-slate-200 space-y-1">
                    <div className="font-semibold text-blue-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> Respuesta Generada (768D)
                    </div>
                    <p className="whitespace-pre-line leading-relaxed">
                      {tradResult.synthesized_answer}
                    </p>
                  </div>
                )}
                {tradResult.results.map((doc, idx) => (
                  <DocumentCard
                    key={doc.chunk_id}
                    rank={idx + 1}
                    doc={doc}
                    accent="blue"
                  />
                ))}
              </>
            ) : (
              <EmptyPanelState label="Lanza una consulta para ejecutar la búsqueda en 768 dimensiones." />
            )}
          </div>
        </section>

        {/* ==================== PANEL DERECHO: EDGE RAG MATRYOSHKA ==================== */}
        <section className="flex flex-col rounded-2xl border border-emerald-500/30 bg-slate-900/40 overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
              <div>
                <h2 className="font-semibold text-sm text-white flex items-center gap-2">
                  Edge RAG Matryoshka ({mrlDimension}D)
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                    -{Math.round((1 - mrlDimension / 768) * 100)}% RAM
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Truncado MRL en caliente (`vector[:{mrlDimension}]` + L2 Norm) ·{" "}
                  {mrlDimension * 2} Bytes/chunk
                </p>
              </div>
            </div>

            {/* Selector de Dimensiones Matryoshka: 128 / 256 / 512 */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              {([128, 256, 512] as DimensionOption[]).map((dim) => {
                const active = mrlDimension === dim;
                return (
                  <button
                    key={dim}
                    type="button"
                    onClick={() => handleDimensionChange(dim)}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition ${
                      active
                        ? "bg-emerald-500 text-slate-950 shadow"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {dim}D
                  </button>
                );
              })}
            </div>
          </div>

          {/* Metrics Strip Right */}
          {mrlResult && !loadingRight && (
            <div className="px-4 py-2.5 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center gap-4 text-xs font-mono text-slate-300">
              <span>
                Total:{" "}
                <strong className="text-emerald-400">
                  {mrlResult.latency.total_ms} ms
                </strong>
              </span>
              <span>•</span>
              <span>Ollama GPU: {mrlResult.latency.embedding_ms} ms</span>
              <span>•</span>
              <span>Supabase: {mrlResult.latency.vector_search_ms} ms</span>
              <span>•</span>
              <span>SQLite Hydrate: {mrlResult.latency.sqlite_hydration_ms} ms</span>
            </div>
          )}

          <div className="p-4 flex-1 space-y-3">
            {loadingRight ? (
              <SkeletonLoader count={topK} />
            ) : mrlResult ? (
              <>
                {mrlResult.synthesized_answer && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-slate-200 space-y-1">
                    <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> Respuesta Generada (
                      {mrlDimension}D MRL)
                    </div>
                    <p className="whitespace-pre-line leading-relaxed">
                      {mrlResult.synthesized_answer}
                    </p>
                  </div>
                )}
                {mrlResult.results.map((doc, idx) => (
                  <DocumentCard
                    key={doc.chunk_id}
                    rank={idx + 1}
                    doc={doc}
                    accent="emerald"
                    isMatchWith768={tradIdsSet.has(doc.num_consulta)}
                  />
                ))}
              </>
            ) : (
              <EmptyPanelState label="Selecciona 128D, 256D o 512D y lanza una consulta para comparar con 768D." />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

/* ============================================================================
 * Subcomponentes: Tarjeta de Consulta Hidratada y Skeletons
 * ============================================================================ */

function DocumentCard({
  rank,
  doc,
  accent,
  isMatchWith768,
}: {
  rank: number;
  doc: HydratedDocument;
  accent: "blue" | "emerald";
  isMatchWith768?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const badgeColor =
    accent === "emerald"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : "bg-blue-500/15 text-blue-300 border-blue-500/30";

  return (
    <article className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-4 space-y-2.5 hover:border-slate-700 transition">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
            #{rank}
          </span>
          <span
            className={`text-xs font-mono font-semibold px-2.5 py-0.5 rounded-md border ${badgeColor}`}
          >
            Consulta {doc.num_consulta}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            {doc.fecha_salida}
          </span>
          {isMatchWith768 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Match 768D
            </span>
          )}
        </div>

        <span className="text-xs font-mono text-slate-400">
          Similitud:{" "}
          <strong className="text-slate-100">
            {(doc.similarity * 100).toFixed(1)}%
          </strong>
        </span>
      </div>

      {doc.organo && (
        <p className="text-[11px] text-slate-400 truncate">
          <strong className="text-slate-300">Órgano:</strong> {doc.organo}
        </p>
      )}

      {doc.normativa && (
        <p className="text-xs text-amber-200/90 bg-amber-500/5 border border-amber-500/15 rounded-lg px-2.5 py-1.5 font-mono line-clamp-2">
          {doc.normativa}
        </p>
      )}

      <div className="text-xs text-slate-200 space-y-1">
        <p className="font-semibold text-slate-300">Cuestión Planteada:</p>
        <p className="text-slate-300 leading-relaxed line-clamp-3">
          {doc.cuestion_planteada || doc.descripcion_hechos}
        </p>
      </div>

      {/* Desplegable con el texto hidratado desde SQLite local */}
      <div className="pt-1 border-t border-slate-800/70">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" /> Ocultar Contestación Hidratada
              (SQLite)
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" /> Ver Contestación Completa
              Hidratada ({doc.contestacion_completa.length.toLocaleString()} chars)
            </>
          )}
        </button>

        {expanded && (
          <div className="mt-3 space-y-2.5 text-xs text-slate-300 bg-slate-900/90 p-3.5 rounded-lg border border-slate-800 max-h-96 overflow-y-auto">
            {doc.descripcion_hechos && (
              <div>
                <h4 className="font-semibold text-slate-200 mb-1">
                  Descripción de Hechos:
                </h4>
                <p className="whitespace-pre-line leading-relaxed text-slate-400">
                  {doc.descripcion_hechos}
                </p>
              </div>
            )}
            <div>
              <h4 className="font-semibold text-slate-200 mb-1">
                Contestación Vinculante Íntegra:
              </h4>
              <p className="whitespace-pre-line leading-relaxed">
                {doc.contestacion_completa}
              </p>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function SkeletonLoader({ count }: { count: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 space-y-3 animate-pulse"
        >
          <div className="flex justify-between">
            <div className="h-5 w-36 bg-slate-800 rounded" />
            <div className="h-5 w-20 bg-slate-800 rounded" />
          </div>
          <div className="h-4 w-3/4 bg-slate-800/70 rounded" />
          <div className="h-12 w-full bg-slate-800/50 rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyPanelState({ label }: { label: string }) {
  return (
    <div className="h-72 flex flex-col items-center justify-center text-center px-6 border border-dashed border-slate-800 rounded-xl text-slate-500">
      <Cpu className="w-8 h-8 mb-2 text-slate-600" />
      <p className="text-xs max-w-xs">{label}</p>
    </div>
  );
}
