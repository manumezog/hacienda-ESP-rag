"use client";

import React, { useState } from "react";
import {
  Search,
  Database,
  Zap,
  HardDrive,
  Scale,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Settings,
  AlertCircle,
  BookOpen,
  ExternalLink,
  Copy,
  Check,
  X,
  HelpCircle,
  Globe,
  Mail,
  Layers,
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

interface SampleCategory {
  category: string;
  items: { label: string; query: string }[];
}

const SAMPLE_CATEGORIES: SampleCategory[] = [
  {
    category: "🏠 IRPF y Vivienda",
    items: [
      {
        label: "Reinversión en vivienda habitual comprando antes de vender",
        query:
          "Exención por reinversión en vivienda habitual en el IRPF cuando se compra la nueva vivienda antes de vender la anterior",
      },
      {
        label: "Deducción por obras de eficiencia energética en vivienda",
        query:
          "Requisitos y base máxima de la deducción por obras de mejora de la eficiencia energética en viviendas en el IRPF",
      },
      {
        label: "Indemnización por despido improcedente y límites de exención",
        query:
          "Exención en el IRPF de la indemnización por despido improcedente y requisitos de desvinculación con la empresa",
      },
    ],
  },
  {
    category: "🧾 IVA, Autónomos y Consumo",
    items: [
      {
        label: "Tipo de IVA en servicios de artistas, cantantes y animación",
        query:
          "Tipo impositivo de IVA aplicable a los servicios prestados por animadores de fiestas infantiles y cantantes en eventos",
      },
      {
        label: "Traspaso de negocio completo (No sujeción a IVA art. 7.1º)",
        query:
          "Transmisión de un conjunto empresarial o rama de actividad y supuesto de no sujeción al IVA del artículo 7.1 de la Ley 37/1992",
      },
      {
        label: "Deducción de gastos de vehículo y combustible en autónomos",
        query:
          "Porcentaje de deducción del IVA soportado en la adquisición y combustible de un vehículo turismo utilizado por un profesional autónomo",
      },
    ],
  },
  {
    category: "🏢 Impuesto sobre Sociedades y Startups",
    items: [
      {
        label: "Tipo reducido del 15% para Startups certificadas por ENISA",
        query:
          "Aplicación del tipo impositivo reducido del 15% en el Impuesto sobre Sociedades para empresa emergente certificada por ENISA en grupo fiscal",
      },
      {
        label: "Exención por dividendos y venta de participaciones (art. 21 LIS)",
        query:
          "Requisitos de participación mínima y mantenimiento de 1 año para la exención sobre dividendos del artículo 21 de la Ley del Impuesto sobre Sociedades",
      },
    ],
  },
  {
    category: "🏛️ Patrimonio, Sucesiones y Donaciones",
    items: [
      {
        label: "Exención de empresa familiar en el Impuesto sobre el Patrimonio",
        query:
          "Exención en el Impuesto sobre el Patrimonio del artículo 4.Ocho.Dos por participaciones en entidades y activos afectos a la actividad económica",
      },
      {
        label: "Donación de derechos o participaciones de padres a hijos",
        query:
          "Tributación y valoración en el Impuesto sobre Sucesiones y Donaciones de la cesión gratuita o donación de derechos de padres a hijos",
      },
    ],
  },
  {
    category: "🌍 Criptomonedas y Fiscalidad Internacional",
    items: [
      {
        label: "Pérdidas por estafas o quiebras en plataformas de criptomonedas",
        query:
          "Imputación temporal en el IRPF de pérdidas patrimoniales derivadas de estafas o insolvencia de plataformas de inversión o criptoactivos",
      },
      {
        label: "Régimen especial de impatriados (Ley Beckham art. 93 LIRPF)",
        query:
          "Requisitos para acogerse al régimen especial de trabajadores desplazados a territorio español del artículo 93 de la LIRPF",
      },
    ],
  },
];

const PETETE_OFFICIAL_URL =
  "https://petete.tributos.hacienda.gob.es/consultas";

export default function MatryoshkaBenchmarkPage() {
  const [apiUrl, setApiUrl] = useState<string>(
    process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.194:8000"
  );
  const [query, setQuery] = useState<string>(
    SAMPLE_CATEGORIES[0].items[0].query
  );
  const [mrlDimension, setMrlDimension] = useState<DimensionOption>(128);
  const [topK, setTopK] = useState<number>(5);
  const [generateAnswer, setGenerateAnswer] = useState<boolean>(true);

  const [showEduGuide, setShowEduGuide] = useState<boolean>(true);
  const [showTechSettings, setShowTechSettings] = useState<boolean>(false);
  const [selectedDocModal, setSelectedDocModal] =
    useState<HydratedDocument | null>(null);

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

    const leftPromise = fetchPanel(768)
      .then((data) => setTradResult(data))
      .finally(() => setLoadingLeft(false));

    const rightPromise = fetchPanel(targetMrlDim)
      .then((data) => setMrlResult(data))
      .finally(() => setLoadingRight(false));

    try {
      await Promise.all([leftPromise, rightPromise]);
    } catch (err: any) {
      setErrorMsg(
        err.message ||
          "No se pudo conectar con el servidor de IA. Revisa los ajustes técnicos (⚙️)."
      );
    }
  };

  const handleDimensionChange = (dim: DimensionOption) => {
    setMrlDimension(dim);
    if (tradResult && query.trim()) {
      runParallelSearch(query, dim);
    }
  };

  // Mapa rápido de todos los documentos cargados para abrirlos al clicar una cita (ej. V0703-26)
  const allLoadedDocsMap = React.useMemo(() => {
    const map = new Map<string, HydratedDocument>();
    tradResult?.results.forEach((d) => map.set(d.num_consulta.toUpperCase(), d));
    mrlResult?.results.forEach((d) => map.set(d.num_consulta.toUpperCase(), d));
    return map;
  }, [tradResult, mrlResult]);

  const handleCitationClick = (code: string) => {
    const normalized = code.trim().toUpperCase();
    const found = allLoadedDocsMap.get(normalized);
    if (found) {
      setSelectedDocModal(found);
    } else {
      window.open(PETETE_OFFICIAL_URL, "_blank", "noopener,noreferrer");
    }
  };

  const computeRecallOverlap = () => {
    if (!tradResult || !mrlResult || tradResult.results.length === 0)
      return null;
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
  const vectorRatioPct = Math.round((mrlDimension / 768) * 100);
  const ramSavedPct = Math.round((1 - mrlDimension / 768) * 100);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* ==================== CABECERA PRINCIPAL ==================== */}
      <header className="border-b border-slate-800/80 bg-slate-900/70 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1550px] mx-auto px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg">
              🪆
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-bold text-lg tracking-tight text-white">
                  hacienda-ESP-rag
                </h1>
                <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Laboratorio Educativo RAG & Matryoshka AI
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Buscador inteligente sobre{" "}
                <strong className="text-slate-200">
                  36.053 Consultas Vinculantes
                </strong>{" "}
                de la Dirección General de Tributos (Hacienda Española)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs">
            <button
              type="button"
              onClick={() => setShowEduGuide(!showEduGuide)}
              className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition ${
                showEduGuide
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              {showEduGuide ? "Ocultar explicación" : "¿Cómo funciona esto?"}
            </button>

            <label className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 cursor-pointer hover:border-slate-700">
              <input
                type="checkbox"
                checked={generateAnswer}
                onChange={(e) => setGenerateAnswer(e.target.checked)}
                className="rounded accent-emerald-500"
              />
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-200 font-medium">
                Redactar respuesta con IA
              </span>
            </label>

            <button
              type="button"
              onClick={() => setShowTechSettings(!showTechSettings)}
              title="Ajustes técnicos del servidor"
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Panel desplegable de Ajustes Técnicos (Oculto por defecto) */}
        {showTechSettings && (
          <div className="border-t border-slate-800 bg-slate-950/95 px-6 py-3">
            <div className="max-w-[1550px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">
                    Servidor Backend (Jetson Orin / Tunnel):
                  </span>
                  <input
                    type="text"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-slate-200 font-mono w-64 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">
                    Nº de documentos a comparar (Top-K):
                  </span>
                  <select
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 font-mono"
                  >
                    <option value={3}>3 documentos</option>
                    <option value={5}>5 documentos</option>
                    <option value={10}>10 documentos</option>
                  </select>
                </div>
              </div>
              <span className="text-slate-500">
                Modelo Embeddings: EmbeddingGemma · LLM: Gemini 3.8 Flash
              </span>
            </div>
          </div>
        )}
      </header>

      {/* ==================== GUÍA EDUCATIVA INICIAL ==================== */}
      {showEduGuide && (
        <section className="border-b border-slate-800/80 bg-gradient-to-b from-emerald-950/20 via-slate-900/40 to-slate-950 px-6 py-6">
          <div className="max-w-[1550px] mx-auto space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Guía rápida para entender el experimento
                </span>
                <h2 className="text-xl md:text-2xl font-bold text-white mt-0.5">
                  ¿Cómo ahorrar un 83% de memoria en Inteligencia Artificial sin
                  perder precisión legal?
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Tarjeta 1: Qué es RAG */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
                <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm">
                  <Scale className="w-4 h-4" />
                  1. ¿Qué es un RAG Legal?
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Si le preguntas una duda de impuestos a una IA normal, puede{" "}
                  <strong>inventarse leyes</strong>. Un sistema{" "}
                  <strong>RAG</strong> evita esto: primero busca en las{" "}
                  <strong>36.053 resoluciones oficiales de Hacienda</strong> los
                  casos reales más parecidos al tuyo y obliga a la IA a
                  responder basándose solo en ellos.
                </p>
              </div>

              {/* Tarjeta 2: Qué es Matryoshka */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                  <Layers className="w-4 h-4" />
                  2. El Efecto &ldquo;Muñeca Rusa&rdquo; (Matryoshka MRL)
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Para buscar por significado, la IA traduce cada ley a una
                  lista de <strong>768 números</strong> (vector). Los nuevos
                  modelos <strong>Matryoshka</strong> concentran la información
                  más importante al principio de la lista. Así podemos{" "}
                  <strong>recortar y usar solo los primeros 128 números</strong>{" "}
                  (un <strong>83% menos de memoria</strong>) llegando casi a la
                  misma conclusión.
                </p>
              </div>

              {/* Tarjeta 3: Arquitectura Híbrida */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
                <div className="flex items-center gap-2 text-purple-400 font-semibold text-sm">
                  <Database className="w-4 h-4" />
                  3. Casa + Nube (Hidratación Local)
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Las 36.053 leyes ocupan <strong>más de 1 GB</strong>. Para no
                  pagar servidores caros en la nube, guardamos solo los números
                  ligeros en la nube (Supabase) y leemos los textos completos en{" "}
                  <strong>1 milisegundo</strong> desde un mini-ordenador{" "}
                  <strong>NVIDIA Jetson Orin</strong> en casa.
                </p>
              </div>
            </div>

            {/* Visualizador interactivo de la Muñeca Rusa */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="text-xs font-semibold text-white flex items-center gap-2">
                  <span>
                    🪆 Visualizador de Recorte Matryoshka ({mrlDimension} de 768
                    números activos = {vectorRatioPct}% del tamaño original)
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Cambia entre <strong>128D, 256D y 512D</strong> para ver qué
                  fracción del vector estamos usando en el panel derecho frente
                  al vector completo de 768 números del panel izquierdo:
                </p>
              </div>

              <div className="flex-1 w-full max-w-xl space-y-1.5">
                <div className="h-5 w-full rounded-lg bg-slate-800 overflow-hidden p-0.5 border border-slate-700 flex items-center">
                  <div
                    style={{ width: `${vectorRatioPct}%` }}
                    className="h-full rounded-md bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 flex items-center justify-end pr-2"
                  >
                    <span className="text-[10px] font-bold text-slate-950">
                      {mrlDimension}D ({vectorRatioPct}%)
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 ml-auto pr-2">
                    Resto descartado (-{ramSavedPct}% memoria)
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>Posición 1 (Conceptos clave)</span>
                  <span>128</span>
                  <span>256</span>
                  <span>512</span>
                  <span>768 (Matices finos)</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ==================== BUSCADOR Y DROPDOWN DE EJEMPLOS ==================== */}
      <section className="border-b border-slate-800/70 bg-slate-900/30 py-5 px-6">
        <div className="max-w-[1550px] mx-auto space-y-3">
          {/* Selector Dropdown de Casos Reales */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <label className="text-xs font-medium text-emerald-400 shrink-0 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5" />
              Prueba con un caso fiscal real:
            </label>
            <select
              value={query}
              onChange={(e) => {
                const selectedQ = e.target.value;
                if (selectedQ) {
                  setQuery(selectedQ);
                  runParallelSearch(selectedQ, mrlDimension);
                }
              }}
              className="flex-1 bg-slate-900 border border-slate-700/90 hover:border-slate-600 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition cursor-pointer"
            >
              <option value="">
                -- Selecciona una pregunta de ejemplo por tipo de impuesto --
              </option>
              {SAMPLE_CATEGORIES.map((group) => (
                <optgroup key={group.category} label={group.category}>
                  {group.items.map((item, i) => (
                    <option key={i} value={item.query}>
                      {item.label}: &ldquo;{item.query.slice(0, 95)}...&rdquo;
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Barra de Búsqueda Principal */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runParallelSearch(query, mrlDimension);
            }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="O escribe aquí tu propia duda fiscal (IRPF, IVA, Sociedades, Sucesiones, Alquileres, Cripto...)"
                className="w-full pl-12 pr-4 py-3.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>
            <button
              type="submit"
              disabled={loadingLeft || loadingRight}
              className="px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/10 shrink-0"
            >
              <Zap className="w-4 h-4 fill-current" />
              {loadingLeft || loadingRight
                ? "Consultando en paralelo..."
                : "Comparar Ambos Modelos"}
            </button>
          </form>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Tarjetas Resumen en Lenguaje Sencillo */}
          {recallStats && tradResult && mrlResult && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    Coincidencia de Documentos
                  </p>
                  <p className="text-xl font-bold text-emerald-400 mt-0.5">
                    {recallStats.pct}%{" "}
                    <span className="text-xs font-normal text-slate-400">
                      ({recallStats.matched} de {recallStats.total} leyes
                      idénticas)
                    </span>
                  </p>
                </div>
                <CheckCircle2 className="w-6 h-6 text-emerald-500/60 shrink-0" />
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    Memoria Ahorrada en la Nube
                  </p>
                  <p className="text-xl font-bold text-cyan-400 mt-0.5">
                    -{mrlResult.ram_savings_pct}% RAM{" "}
                    <span className="text-xs font-normal text-slate-400">
                      ({mrlDimension} vs 768 números)
                    </span>
                  </p>
                </div>
                <HardDrive className="w-6 h-6 text-cyan-500/60 shrink-0" />
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    Tiempo de Búsqueda en Nube
                  </p>
                  <p className="text-xl font-bold text-amber-300 mt-0.5">
                    {(mrlResult.latency.vector_search_ms / 1000).toFixed(2)} s{" "}
                    <span className="text-xs font-normal text-slate-400">
                      vs{" "}
                      {(tradResult.latency.vector_search_ms / 1000).toFixed(2)}{" "}
                      s (768D)
                    </span>
                  </p>
                </div>
                <Clock className="w-6 h-6 text-amber-500/60 shrink-0" />
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    Lectura de Leyes en Disco Local
                  </p>
                  <p className="text-xl font-bold text-purple-300 mt-0.5">
                    {mrlResult.latency.sqlite_hydration_ms} ms{" "}
                    <span className="text-xs font-normal text-slate-400">
                      (Instantáneo desde casa)
                    </span>
                  </p>
                </div>
                <Database className="w-6 h-6 text-purple-500/60 shrink-0" />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ==================== COMPARATIVA SIDE-BY-SIDE ==================== */}
      <main className="flex-1 max-w-[1550px] w-full mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PANEL IZQUIERDO: MODELO ESTÁNDAR 768D */}
        <section className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full bg-blue-400" />
              <div>
                <h2 className="font-semibold text-sm text-white">
                  Búsqueda Estándar (Vector Completo: 768 números)
                </h2>
                <p className="text-xs text-slate-400">
                  Usa el 100% del tamaño del vector · Mayor consumo de memoria
                </p>
              </div>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/30">
              768D (100% Memoria)
            </span>
          </div>

          <div className="p-4 flex-1 space-y-4">
            {loadingLeft ? (
              <SkeletonLoader count={topK} />
            ) : tradResult ? (
              <>
                {tradResult.synthesized_answer && (
                  <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-500/30 space-y-2">
                    <div className="font-semibold text-xs text-blue-300 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" /> Conclusión IA con
                        Vector Completo (768D)
                      </span>
                      <span className="text-[11px] font-normal text-slate-400">
                        Haz clic en cualquier consulta (ej. V0703-26) para
                        abrirla
                      </span>
                    </div>
                    <FormattedLLMResponse
                      text={tradResult.synthesized_answer}
                      onCitationClick={handleCitationClick}
                    />
                  </div>
                )}

                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                    Consultas Vinculantes Recuperadas ({tradResult.results.length}
                    )
                  </h3>
                  {tradResult.results.map((doc, idx) => (
                    <DocumentCard
                      key={doc.chunk_id}
                      rank={idx + 1}
                      doc={doc}
                      accent="blue"
                      onOpenModal={() => setSelectedDocModal(doc)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <EmptyPanelState label="Selecciona un caso fiscal arriba o escribe tu consulta para comparar ambos motores." />
            )}
          </div>
        </section>

        {/* PANEL DERECHO: MODELO MATRYOSHKA RECORTADO */}
        <section className="flex flex-col rounded-2xl border border-emerald-500/30 bg-slate-900/40 overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
              <div>
                <h2 className="font-semibold text-sm text-white flex items-center gap-2">
                  Búsqueda Matryoshka ({mrlDimension} números)
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                    Ahorra {ramSavedPct}% RAM
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Usa solo el {vectorRatioPct}% inicial del vector descartando
                  el resto
                </p>
              </div>
            </div>

            {/* Selector 128D / 256D / 512D */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              {([128, 256, 512] as DimensionOption[]).map((dim) => {
                const active = mrlDimension === dim;
                return (
                  <button
                    key={dim}
                    type="button"
                    onClick={() => handleDimensionChange(dim)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
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

          <div className="p-4 flex-1 space-y-4">
            {loadingRight ? (
              <SkeletonLoader count={topK} />
            ) : mrlResult ? (
              <>
                {mrlResult.synthesized_answer && (
                  <div className="p-4 rounded-xl bg-emerald-950/25 border border-emerald-500/30 space-y-2">
                    <div className="font-semibold text-xs text-emerald-300 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" /> Conclusión IA con
                        Vector Reducido ({mrlDimension}D)
                      </span>
                      <span className="text-[11px] font-normal text-slate-400">
                        Haz clic en cualquier consulta citada para ver la ley
                      </span>
                    </div>
                    <FormattedLLMResponse
                      text={mrlResult.synthesized_answer}
                      onCitationClick={handleCitationClick}
                    />
                  </div>
                )}

                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                    Consultas Vinculantes Recuperadas ({mrlResult.results.length}
                    )
                  </h3>
                  {mrlResult.results.map((doc, idx) => (
                    <DocumentCard
                      key={doc.chunk_id}
                      rank={idx + 1}
                      doc={doc}
                      accent="emerald"
                      isMatchWith768={tradIdsSet.has(doc.num_consulta)}
                      onOpenModal={() => setSelectedDocModal(doc)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <EmptyPanelState label="Elige el nivel de recorte (128D, 256D o 512D) y lanza una búsqueda para comparar con el vector completo." />
            )}
          </div>
        </section>
      </main>

      {/* ==================== MODAL VISOR DE CONSULTA OFICIAL ==================== */}
      {selectedDocModal && (
        <OfficialDocumentModal
          doc={selectedDocModal}
          onClose={() => setSelectedDocModal(null)}
        />
      )}

      {/* ==================== FOOTER CON BRANDING PERSONAL ==================== */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 mt-10 py-6 px-6">
        <div className="max-w-[1550px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="text-base">🪆</span>
            <span>
              Proyecto educativo open-source desarrollado por{" "}
              <strong className="text-white">Manuel Mezo</strong> · Datos
              oficiales de la Dirección General de Tributos (Hacienda Española)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <a
              href="https://cv.manuelmezo.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-slate-300 hover:text-emerald-400 transition font-medium"
            >
              <Globe className="w-3.5 h-3.5" />
              cv.manuelmezo.com
            </a>
            <a
              href="https://github.com/manumezog/hacienda-ESP-rag"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-slate-300 hover:text-emerald-400 transition font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              GitHub (@manumezog)
            </a>
            <a
              href="https://www.linkedin.com/search/results/all/?keywords=Manuel%20Mezo"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-slate-300 hover:text-emerald-400 transition font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              LinkedIn (Manuel Mezo)
            </a>
            <a
              href="mailto:manumezog@gmail.com"
              className="flex items-center gap-1.5 text-slate-300 hover:text-emerald-400 transition font-medium"
            >
              <Mail className="w-3.5 h-3.5" />
              manumezog@gmail.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ============================================================================
 * Renderizador de Markdown Limpio + Chips Interactivos de Consultas (Vxxxx-xx)
 * ============================================================================ */

function FormattedLLMResponse({
  text,
  onCitationClick,
}: {
  text: string;
  onCitationClick: (code: string) => void;
}) {
  const lines = text.split("\n");

  const renderInlineFormatting = (lineText: string) => {
    // Dividir primero por negritas **...**
    const boldParts = lineText.split(/(\*\*.*?\*\*)/g);

    return boldParts.map((part, i) => {
      const isBold = part.startsWith("**") && part.endsWith("**");
      const cleanPart = isBold ? part.slice(2, -2) : part;

      // Detectar códigos de Consultas Vinculantes (ej. V0703-26, V1249-26)
      const subParts = cleanPart.split(/\b(V\d{3,5}-\d{2})\b/g);

      return (
        <React.Fragment key={i}>
          {subParts.map((sub, j) => {
            if (/^V\d{3,5}-\d{2}$/.test(sub)) {
              return (
                <button
                  key={j}
                  type="button"
                  onClick={() => onCitationClick(sub)}
                  title={`Ver texto oficial de la Consulta Vinculante ${sub}`}
                  className="inline-flex items-center gap-1 mx-0.5 px-2 py-0.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-500/40 font-mono text-[11px] font-semibold transition cursor-pointer"
                >
                  📄 {sub}
                </button>
              );
            }
            return isBold ? (
              <strong key={j} className="font-semibold text-white">
                {sub}
              </strong>
            ) : (
              <span key={j}>{sub}</span>
            );
          })}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="space-y-2 text-xs text-slate-200 leading-relaxed">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) return <div key={idx} className="h-1" />;

        // Listas con viñetas (* o -)
        if (line.startsWith("* ") || line.startsWith("- ")) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-emerald-400 font-bold mt-0.5">•</span>
              <div className="flex-1">
                {renderInlineFormatting(line.slice(2))}
              </div>
            </div>
          );
        }

        // Listas numeradas (1. , 2. , etc.)
        const numMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-emerald-400 font-mono font-bold shrink-0">
                {numMatch[1]}.
              </span>
              <div className="flex-1">
                {renderInlineFormatting(numMatch[2])}
              </div>
            </div>
          );
        }

        return <p key={idx}>{renderInlineFormatting(line)}</p>;
      })}
    </div>
  );
}

/* ============================================================================
 * Tarjeta de Consulta Vinculante
 * ============================================================================ */

function DocumentCard({
  rank,
  doc,
  accent,
  isMatchWith768,
  onOpenModal,
}: {
  rank: number;
  doc: HydratedDocument;
  accent: "blue" | "emerald";
  isMatchWith768?: boolean;
  onOpenModal: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const badgeColor =
    accent === "emerald"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
      : "bg-blue-500/15 text-blue-300 border-blue-500/30 hover:bg-blue-500/25";

  return (
    <article className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-4 space-y-2.5 hover:border-slate-700 transition">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
            #{rank}
          </span>
          <button
            type="button"
            onClick={onOpenModal}
            className={`text-xs font-mono font-semibold px-2.5 py-0.5 rounded-md border transition flex items-center gap-1 ${badgeColor}`}
          >
            📄 Consulta {doc.num_consulta}
          </button>
          <span className="text-xs text-slate-400 font-mono">
            {doc.fecha_salida}
          </span>
          {isMatchWith768 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Mismo resultado que 768D
            </span>
          )}
        </div>

        <span className="text-xs text-slate-400">
          Afinidad:{" "}
          <strong className="text-slate-100 font-mono">
            {(doc.similarity * 100).toFixed(1)}%
          </strong>
        </span>
      </div>

      {doc.organo && (
        <p className="text-[11px] text-slate-400 truncate">
          <strong className="text-slate-300">Órgano DGT:</strong> {doc.organo}
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

      <div className="pt-2 border-t border-slate-800/70 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" /> Ocultar texto rápido
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" /> Desplegar resolución aquí
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenModal}
          className="text-xs text-slate-300 hover:text-white flex items-center gap-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 px-2.5 py-1 rounded-lg transition"
        >
          <ExternalLink className="w-3 h-3" /> Abrir visor completo y web DGT
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-2.5 text-xs text-slate-300 bg-slate-900/90 p-3.5 rounded-lg border border-slate-800 max-h-96 overflow-y-auto">
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
    </article>
  );
}

/* ============================================================================
 * Modal de Documento Oficial Completo + Enlace a Hacienda (PETETE)
 * ============================================================================ */

function OfficialDocumentModal({
  doc,
  onClose,
}: {
  doc: HydratedDocument;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyCodeAndOpenPetete = (openWeb: boolean) => {
    navigator.clipboard.writeText(doc.num_consulta);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    if (openWeb) {
      window.open(PETETE_OFFICIAL_URL, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Cabecera del Modal */}
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-950">
          <div className="flex items-center gap-2.5">
            <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono text-sm font-bold">
              Consulta Vinculante {doc.num_consulta}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Fecha Salida: {doc.fecha_salida}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => copyCodeAndOpenPetete(false)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 transition"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Código{" "}
                  {doc.num_consulta} copiado
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Copiar código
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => copyCodeAndOpenPetete(true)}
              title="Copia automáticamente el número de consulta y abre el buscador oficial PETETE de Hacienda"
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Verificar en Web Oficial Hacienda (PETETE)
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Cuerpo del Documento Oficial */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs leading-relaxed text-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
            <div>
              <span className="text-slate-400 block text-[11px]">
                Órgano Directivo Emisor:
              </span>
              <strong className="text-white">{doc.organo}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">
                Normativa Aplicable:
              </span>
              <span className="text-amber-200 font-mono">{doc.normativa}</span>
            </div>
          </div>

          {doc.cuestion_planteada && (
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Cuestión Planteada
              </h4>
              <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 whitespace-pre-line">
                {doc.cuestion_planteada}
              </div>
            </div>
          )}

          {doc.descripcion_hechos && (
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400">
                Descripción de los Hechos
              </h4>
              <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 whitespace-pre-line text-slate-300">
                {doc.descripcion_hechos}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">
              Contestación Completa de la Dirección General de Tributos
            </h4>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 whitespace-pre-line text-slate-200 leading-relaxed">
              {doc.contestacion_completa}
            </div>
          </div>
        </div>
      </div>
    </div>
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
      <BookOpen className="w-8 h-8 mb-2 text-slate-600" />
      <p className="text-xs max-w-xs">{label}</p>
    </div>
  );
}
