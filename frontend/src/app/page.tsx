"use client";

import React, { useState, useEffect } from "react";
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
  Key,
  ThumbsUp,
  ThumbsDown,
  Bug,
  RefreshCw,
  Send,
} from "lucide-react";

type DimensionOption = 128 | 256 | 512;
type Lang = "es" | "en";

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
  llm_status?: "ok" | "skipped" | "quota_exceeded" | "invalid_key" | "error";
  search_backend?: "supabase_pgvector" | "sqlite_local_fallback";
}

interface SampleCategory {
  categoryEs: string;
  categoryEn: string;
  items: { labelEs: string; labelEn: string; query: string }[];
}

const SAMPLE_CATEGORIES: SampleCategory[] = [
  {
    categoryEs: "🏠 IRPF y Vivienda",
    categoryEn: "🏠 Income Tax (IRPF) & Housing",
    items: [
      {
        labelEs:
          "¿Pago IRPF al vender mi casa si compré la nueva vivienda habitual antes de vender la anterior?",
        labelEn:
          "Do I pay tax when selling my home if I bought my new main residence before selling the old one?",
        query:
          "¿Tengo que pagar IRPF al vender mi casa si me he comprado la nueva vivienda habitual antes de vender la anterior? Exención por reinversión en vivienda habitual",
      },
      {
        labelEs:
          "He hecho obras en casa para mejorar la eficiencia energética, ¿cuánto me puedo deducir en la Renta?",
        labelEn:
          "I renovated my home to improve energy efficiency — how much can I deduct on my income tax?",
        query:
          "He hecho obras en casa para mejorar el aislamiento y la eficiencia energética, ¿qué requisitos hay y cuánto me puedo deducir como máximo en el IRPF?",
      },
      {
        labelEs:
          "Me han despedido de forma improcedente, ¿está libre de impuestos la indemnización en el IRPF?",
        labelEn:
          "I was unfairly dismissed — is my severance pay exempt from income tax?",
        query:
          "Me han despedido de forma improcedente, ¿hasta qué límite está exenta de IRPF la indemnización por despido y qué requisitos de desvinculación pide Hacienda?",
      },
    ],
  },
  {
    categoryEs: "🧾 IVA, Autónomos y Consumo",
    categoryEn: "🧾 VAT (IVA), Freelancers & Consumption",
    items: [
      {
        labelEs:
          "Soy autónomo y uso mi coche para trabajar, ¿cuánto IVA del coche y de la gasolina me puedo deducir?",
        labelEn:
          "I'm self-employed and use my car for work — how much VAT on the car and fuel can I deduct?",
        query:
          "Soy autónomo y utilizo mi vehículo turismo para mi actividad profesional, ¿qué porcentaje del IVA soportado en la compra del coche y el combustible puedo deducirme?",
      },
      {
        labelEs:
          "Voy a traspasar mi negocio entero con local y mobiliario, ¿la venta lleva IVA o está exenta?",
        labelEn:
          "I'm transferring my entire business with premises and equipment — is it subject to VAT?",
        query:
          "Voy a traspasar mi negocio completo (conjunto empresarial con local, existencias y mobiliario) a otro empresario, ¿está no sujeto a IVA por el artículo 7.1?",
      },
      {
        labelEs:
          "Soy cantante y animador de fiestas infantiles, ¿debo cobrar el 10% o el 21% de IVA en mis facturas?",
        labelEn:
          "I'm a singer and children's party entertainer — should I charge 10% or 21% VAT on my invoices?",
        query:
          "Soy cantante y animador de fiestas infantiles y eventos, ¿qué tipo impositivo de IVA (10% reducido o 21% general) debo aplicar en mis facturas?",
      },
    ],
  },
  {
    categoryEs: "🏢 Impuesto sobre Sociedades y Startups",
    categoryEn: "🏢 Corporate Tax & Startups",
    items: [
      {
        labelEs:
          "Tenemos una startup certificada por ENISA, ¿podemos pagar solo el 15% en el Impuesto sobre Sociedades?",
        labelEn:
          "We have an ENISA-certified startup — can we pay the reduced 15% Corporate Tax rate?",
        query:
          "Hemos creado una startup certificada por ENISA como empresa emergente, ¿podemos aplicar el tipo impositivo reducido del 15% en el Impuesto sobre Sociedades?",
      },
      {
        labelEs:
          "Nuestra empresa cobra dividendos de una filial, ¿qué requisitos hay para que estén exentos al 95%?",
        labelEn:
          "Our company receives dividends from a subsidiary — what are the requirements for the participation exemption?",
        query:
          "Nuestra sociedad tiene participaciones en otra empresa, ¿qué porcentaje mínimo y tiempo de mantenimiento de 1 año se exige para la exención sobre dividendos del artículo 21 LIS?",
      },
    ],
  },
  {
    categoryEs: "🏛️ Patrimonio, Sucesiones y Donaciones",
    categoryEn: "🏛️ Wealth, Inheritance & Gift Tax",
    items: [
      {
        labelEs:
          "Tengo participaciones en la empresa familiar, ¿cómo consigo que estén exentas en el Impuesto sobre el Patrimonio?",
        labelEn:
          "I own shares in our family business — how do they qualify for the Wealth Tax exemption?",
        query:
          "Tengo participaciones en una empresa familiar, ¿qué requisitos pide el artículo 4.Ocho.Dos para que estén exentas en el Impuesto sobre el Patrimonio?",
      },
      {
        labelEs:
          "Mis padres quieren donarme bienes o derechos en vida, ¿qué impuestos se pagan por la donación?",
        labelEn:
          "My parents want to gift me assets or rights during their lifetime — how is the gift taxed?",
        query:
          "Mis padres quieren hacerme una donación o cesión gratuita de derechos a favor de los hijos, ¿cómo tributa y se valora en el Impuesto sobre Sucesiones y Donaciones?",
      },
    ],
  },
  {
    categoryEs: "🌍 Criptomonedas y Fiscalidad Internacional",
    categoryEn: "🌍 Crypto Assets & International Tax (Beckham Law)",
    items: [
      {
        labelEs:
          "Me han estafado en una plataforma de criptomonedas, ¿puedo declarar el dinero perdido en la Renta?",
        labelEn:
          "I was scammed on a crypto platform — can I deduct the lost money as a capital loss on my tax return?",
        query:
          "Me han estafado o ha quebrado una plataforma de inversión y criptoactivos y he perdido mis ahorros, ¿cuándo y cómo puedo imputar esa pérdida patrimonial en el IRPF?",
      },
      {
        labelEs:
          "Me mudo a trabajar a España desde el extranjero, ¿cómo puedo acogerme a la Ley Beckham?",
        labelEn:
          "I'm relocating to Spain for work — what are the requirements to apply for the Beckham Law expat tax regime?",
        query:
          "Me desplazo a vivir y trabajar a España por un nuevo contrato laboral, ¿qué requisitos debo cumplir para acogerme al régimen especial de impatriados (Ley Beckham, artículo 93 LIRPF)?",
      },
    ],
  },
];

const UI_TEXT = {
  es: {
    badge: "Laboratorio Educativo RAG & Matryoshka AI",
    subtitlePrefix: "Buscador inteligente sobre",
    subtitleStrong: "36.053 Consultas Vinculantes",
    subtitleSuffix: "de la Dirección General de Tributos (Hacienda Española)",
    hideGuide: "Ocultar explicación",
    showGuide: "¿Cómo funciona esto?",
    aiSynthesisToggle: "Redactar respuesta con IA",
    eduTag: "Guía rápida para entender el experimento",
    eduTitle:
      "¿Cómo ahorrar un 83% de memoria en Inteligencia Artificial sin perder precisión legal?",
    card1Title: "1. ¿Qué es un RAG Legal?",
    card1Body:
      "Si le preguntas una duda de impuestos a una IA normal, puede inventarse leyes. Un sistema RAG evita esto: primero busca en las 36.053 resoluciones oficiales de Hacienda los casos reales más parecidos al tuyo y obliga a la IA a responder basándose solo en ellos.",
    card2Title: "2. El Efecto “Muñeca Rusa” (Matryoshka MRL)",
    card2Body:
      "Para buscar por significado, la IA traduce cada ley a una lista de 768 números (vector). Los modelos Matryoshka concentran la información más importante al principio de la lista. Así podemos recortar y usar solo los primeros 128 números (un 83% menos de memoria) llegando casi a la misma conclusión.",
    card3Title: "3. Casa + Nube (Hidratación Local)",
    card3Body:
      "Las 36.053 leyes ocupan más de 1 GB. Para no pagar servidores caros en la nube, guardamos solo los números ligeros en la nube (Supabase) y leemos los textos completos en 1 milisegundo desde un mini-servidor NVIDIA Jetson Orin local.",
    visualizerTitle: (dim: number, pct: number) =>
      `🪆 Visualizador de Recorte Matryoshka (${dim} de 768 números activos = ${pct}% del tamaño original)`,
    visualizerDesc:
      "Cambia entre 128D, 256D y 512D en el panel derecho para ver qué fracción del vector estamos usando frente al vector completo de 768 números:",
    visualizerDiscarded: (saved: number) =>
      `Resto descartado (-${saved}% memoria)`,
    posStart: "Posición 1 (Conceptos clave)",
    posEnd: "768 (Matices secundarios)",
    sampleLabel: "Prueba con un caso fiscal real:",
    samplePlaceholder:
      "-- Selecciona una pregunta de ejemplo por tipo de impuesto --",
    searchPlaceholder:
      "O escribe aquí tu propia duda fiscal (IRPF, IVA, Sociedades, Sucesiones, Alquileres, Cripto...)",
    searchingBtn: "Consultando en paralelo...",
    searchBtn: "Comparar Ambos Modelos",
    metricMatchTitle: "Coincidencia de Documentos",
    metricMatchSub: (m: number, t: number) => `(${m} de ${t} leyes idénticas)`,
    metricRamTitle: "Memoria Ahorrada en la Nube",
    metricRamSub: (dim: number) => `(${dim} vs 768 números)`,
    metricCloudTitle: "Tiempo de Búsqueda Vectorial",
    metricDiskTitle: "Lectura de Leyes (Disco Local)",
    metricDiskSub: "(Instantáneo desde SQLite)",
    leftPanelTitle: "Búsqueda Estándar (Vector Completo: 768 números)",
    leftPanelSub:
      "Usa el 100% del tamaño del vector · Mayor consumo de memoria",
    leftPanelBadge: "768D (100% Memoria)",
    leftAiTitle: "Conclusión IA con Vector Completo (768D)",
    rightPanelTitle: (dim: number) => `Búsqueda Matryoshka (${dim} números)`,
    rightPanelBadge: (saved: number) => `Ahorra ${saved}% RAM`,
    rightPanelSub: (pct: number) =>
      `Usa solo el ${pct}% inicial del vector descartando el resto`,
    rightAiTitle: (dim: number) =>
      `Conclusión IA con Vector Reducido (${dim}D)`,
    clickCitationHint:
      "Haz clic en cualquier consulta citada (ej. V0703-26) para abrir la ley",
    recoveredDocsHeader: (n: number) =>
      `Consultas Vinculantes Oficiales Recuperadas (${n})`,
    emptyLeft:
      "Selecciona un caso fiscal arriba o escribe tu consulta para comparar ambos motores.",
    emptyRight:
      "Elige el nivel de recorte (128D, 256D o 512D) y lanza una búsqueda para comparar con el vector completo.",
    sameAs768: "Mismo resultado que 768D",
    affinity: "Afinidad:",
    organoLabel: "Órgano DGT:",
    questionLabel: "Cuestión Planteada (Original ES):",
    hideQuickText: "Ocultar texto rápido",
    showQuickText: "Desplegar resolución aquí",
    openFullModal: "Abrir visor completo y web oficial DGT",
    factsTitle: "Descripción de los Hechos",
    rulingTitle: "Contestación Vinculante Íntegra (DGT)",
    modalDate: "Fecha Salida:",
    copiedCode: (c: string) => `Código ${c} copiado`,
    copyCode: "Copiar código",
    verifyOfficialWeb: "Verificar en Web Oficial Hacienda (PETETE)",
    modalOrgano: "Órgano Directivo Emisor:",
    modalNormativa: "Normativa Aplicable:",
    footerAuthor: "Proyecto educativo open-source desarrollado por",
    footerSourceLabel: "Fuente de datos oficial: DGT (Ministerio de Hacienda)",
  },
  en: {
    badge: "Educational RAG & Matryoshka AI Lab",
    subtitlePrefix: "Intelligent legal search across",
    subtitleStrong: "36,053 Binding Tax Rulings",
    subtitleSuffix: "from the Spanish Tax Agency (Dirección General de Tributos)",
    hideGuide: "Hide explanation",
    showGuide: "How does this work?",
    aiSynthesisToggle: "Generate AI Summary (in English)",
    eduTag: "Quick guide to understand this experiment",
    eduTitle:
      "How to save 83% of Vector RAM in AI without losing legal accuracy?",
    card1Title: "1. What is Legal RAG?",
    card1Body:
      "If you ask a standard AI a tax question, it can hallucinate laws. A RAG system prevents this: it first searches across 36,053 official Spanish Tax Rulings to find the closest real cases, forcing the AI to answer strictly based on official rulings.",
    card2Title: "2. The “Russian Doll” Effect (Matryoshka MRL)",
    card2Body:
      "To search by meaning, AI converts each law into a list of 768 numbers (vector). Matryoshka models pack the most critical meaning into the very first numbers. This lets us slice and keep only the first 128 numbers (saving 83% of RAM) while reaching nearly the exact same legal answer.",
    card3Title: "3. Edge + Cloud (Local Hydration Pattern)",
    card3Body:
      "The 36,053 full rulings take over 1 GB. To avoid paying for expensive cloud storage, we store only the lightweight vectors in the cloud (Supabase) and hydrate the full legal texts in 1 millisecond from a local NVIDIA Jetson Orin server.",
    visualizerTitle: (dim: number, pct: number) =>
      `🪆 Matryoshka Vector Slicing Visualizer (${dim} of 768 active numbers = ${pct}% of original size)`,
    visualizerDesc:
      "Switch between 128D, 256D, and 512D on the right panel to see what fraction of the vector is used compared to the full 768-number vector:",
    visualizerDiscarded: (saved: number) =>
      `Remaining sliced off (-${saved}% memory)`,
    posStart: "Index 1 (Core concepts)",
    posEnd: "768 (Fine-grained nuances)",
    sampleLabel: "Try a real Spanish tax case:",
    samplePlaceholder: "-- Select a sample tax question by category --",
    searchPlaceholder:
      "Or type your own tax query (Income Tax, VAT, Corporate Tax, Startups, Crypto, Beckham Law...)",
    searchingBtn: "Running parallel benchmark...",
    searchBtn: "Compare Side-by-Side",
    metricMatchTitle: "Document Overlap (Recall)",
    metricMatchSub: (m: number, t: number) => `(${m} of ${t} identical rulings)`,
    metricRamTitle: "Cloud Vector RAM Saved",
    metricRamSub: (dim: number) => `(${dim} vs 768 dimensions)`,
    metricCloudTitle: "Cloud Vector Search Time",
    metricDiskTitle: "Local Disk Hydration (SQLite)",
    metricDiskSub: "(Instant from local Edge DB)",
    leftPanelTitle: "Standard RAG (Full Vector: 768 numbers)",
    leftPanelSub: "Uses 100% of vector dimensions · High memory footprint",
    leftPanelBadge: "768D (100% Memory)",
    leftAiTitle: "AI Legal Conclusion — Full Vector (768D)",
    rightPanelTitle: (dim: number) => `Matryoshka RAG (${dim} numbers)`,
    rightPanelBadge: (saved: number) => `Saves ${saved}% RAM`,
    rightPanelSub: (pct: number) =>
      `Uses only the first ${pct}% of the vector, discarding the rest`,
    rightAiTitle: (dim: number) =>
      `AI Legal Conclusion — Sliced Vector (${dim}D)`,
    clickCitationHint:
      "Click any cited ruling code (e.g., V0703-26) to inspect the official Spanish text",
    recoveredDocsHeader: (n: number) =>
      `Retrieved Official Tax Rulings (${n} — Original Spanish DGT Text)`,
    emptyLeft:
      "Select a sample tax case above or type a query to benchmark both engines side-by-side.",
    emptyRight:
      "Choose a slicing level (128D, 256D, or 512D) and run a search to compare against the full 768D vector.",
    sameAs768: "Exact match with 768D",
    affinity: "Similarity:",
    organoLabel: "Issuing Body:",
    questionLabel: "Legal Question (Original Spanish):",
    hideQuickText: "Hide quick preview",
    showQuickText: "Expand ruling preview here",
    openFullModal: "Open full viewer & official DGT portal",
    factsTitle: "Description of Facts (Original Spanish)",
    rulingTitle: "Full Binding Tax Ruling (Original Spanish DGT)",
    modalDate: "Issue Date:",
    copiedCode: (c: string) => `Code ${c} copied`,
    copyCode: "Copy ID",
    verifyOfficialWeb: "Verify on Official Spanish Tax Portal (PETETE)",
    modalOrgano: "Issuing Tax Authority:",
    modalNormativa: "Applicable Legislation:",
    footerAuthor: "Open-source educational project built by",
    footerSourceLabel:
      "Official Data Source: DGT (Spanish Ministry of Finance)",
  },
};

const PETETE_OFFICIAL_URL =
  "https://petete.tributos.hacienda.gob.es/consultas";

// URL oficial del Backend en la Jetson Orin expuesta vía Cloudflare Tunnel HTTPS
const _rawEnvApiUrl = process.env.NEXT_PUBLIC_API_URL || "";
const BACKEND_API_URL = (
  _rawEnvApiUrl && !_rawEnvApiUrl.includes("manuelmezo.com")
    ? _rawEnvApiUrl
    : "https://api-hacienda.mezapps.com"
).replace(/\/+$/, "");

export default function MatryoshkaBenchmarkPage() {
  const [lang, setLang] = useState<Lang>("es");
  const t = UI_TEXT[lang];

  const [query, setQuery] = useState<string>(
    SAMPLE_CATEGORIES[0].items[0].query
  );
  const [mrlDimension, setMrlDimension] = useState<DimensionOption>(128);
  const [topK] = useState<number>(10);
  const [generateAnswer, setGenerateAnswer] = useState<boolean>(true);

  const [showEduGuide, setShowEduGuide] = useState<boolean>(true);
  const [mobileTab, setMobileTab] = useState<"mrl" | "trad" | "both">("mrl");
  const [selectedDocModal, setSelectedDocModal] =
    useState<HydratedDocument | null>(null);

  // BYOK (Bring Your Own API Key: Gemini AIza... / OpenRouter sk-or-...)
  const [customApiKey, setCustomApiKey] = useState<string>("");
  const [draftApiKey, setDraftApiKey] = useState<string>("");
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);

  // Feedback & Bug Reporting
  const [feedbackStats, setFeedbackStats] = useState<{
    likes: number;
    dislikes: number;
    bugs: number;
  }>({ likes: 12, dislikes: 0, bugs: 0 });
  const [activeFeedbackType, setActiveFeedbackType] = useState<
    "like" | "dislike" | "bug" | null
  >(null);
  const [feedbackComment, setFeedbackComment] = useState<string>("");
  const [feedbackSent, setFeedbackSent] = useState<boolean>(false);
  const [sendingFeedback, setSendingFeedback] = useState<boolean>(false);

  const [loadingLeft, setLoadingLeft] = useState<boolean>(false);
  const [loadingRight, setLoadingRight] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [tradResult, setTradResult] = useState<SearchResponse | null>(null);
  const [mrlResult, setMrlResult] = useState<SearchResponse | null>(null);

  useEffect(() => {
    try {
      const savedKey = localStorage.getItem("hacienda_rag_custom_api_key");
      if (savedKey) {
        setCustomApiKey(savedKey);
        setDraftApiKey(savedKey);
      }
    } catch {}
    fetch(`${BACKEND_API_URL}/api/feedback/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.likes === "number") {
          setFeedbackStats({
            likes: Math.max(data.likes, 1),
            dislikes: data.dislikes || 0,
            bugs: data.bugs || 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = draftApiKey.trim();
    setCustomApiKey(cleaned);
    try {
      if (cleaned) {
        localStorage.setItem("hacienda_rag_custom_api_key", cleaned);
      } else {
        localStorage.removeItem("hacienda_rag_custom_api_key");
      }
    } catch {}
    setShowApiKeyModal(false);
    if (query.trim()) {
      runParallelSearch(query, mrlDimension, lang, cleaned);
    }
  };

  const handleClearApiKey = () => {
    setDraftApiKey("");
    setCustomApiKey("");
    try {
      localStorage.removeItem("hacienda_rag_custom_api_key");
    } catch {}
    setShowApiKeyModal(false);
  };

  const handleSendFeedback = async (
    rating: "like" | "dislike" | "bug",
    commentText: string = feedbackComment
  ) => {
    setSendingFeedback(true);
    try {
      const res = await fetch(`${BACKEND_API_URL}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          comment: commentText,
          query,
          lang,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setFeedbackStats(data.stats);
      } else {
        setFeedbackStats((prev) => ({
          ...prev,
          likes: rating === "like" ? prev.likes + 1 : prev.likes,
          dislikes: rating === "dislike" ? prev.dislikes + 1 : prev.dislikes,
          bugs: rating === "bug" ? prev.bugs + 1 : prev.bugs,
        }));
      }
    } catch {
      setFeedbackStats((prev) => ({
        ...prev,
        likes: rating === "like" ? prev.likes + 1 : prev.likes,
        dislikes: rating === "dislike" ? prev.dislikes + 1 : prev.dislikes,
        bugs: rating === "bug" ? prev.bugs + 1 : prev.bugs,
      }));
    } finally {
      setSendingFeedback(false);
      setFeedbackSent(true);
      setFeedbackComment("");
    }
  };

  const runParallelSearch = async (
    searchQuery: string = query,
    targetMrlDim: DimensionOption = mrlDimension,
    targetLang: Lang = lang,
    overrideApiKey: string = customApiKey
  ) => {
    if (!searchQuery.trim()) return;
    setErrorMsg(null);
    setLoadingLeft(true);
    setLoadingRight(true);

    const fetchPanel = async (dimensions: number): Promise<SearchResponse> => {
      const payload: Record<string, unknown> = {
        query: searchQuery,
        dimensions,
        top_k: topK,
        generate_answer: generateAnswer,
        lang: targetLang,
      };
      if (overrideApiKey && overrideApiKey.trim()) {
        payload.custom_api_key = overrideApiKey.trim();
      }

      let lastErr: Error | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(`${BACKEND_API_URL}/api/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP_${res.status}`);
          }
          return await res.json();
        } catch (e: any) {
          lastErr = e;
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 400));
          }
        }
      }
      throw lastErr || new Error("Network error");
    };

    try {
      // Ejecutamos primero el motor Matryoshka (128D) y acto seguido el 768D para evitar
      // que dos escaneos vectoriales simultáneos colisionen en la CPU de Supabase Free Tier (t4g.nano)
      const rightData = await fetchPanel(targetMrlDim);
      setMrlResult(rightData);
      setLoadingRight(false);

      const leftData = await fetchPanel(768);
      setTradResult(leftData);
      setLoadingLeft(false);
    } catch (err: any) {
      setLoadingLeft(false);
      setLoadingRight(false);
      const raw = String(err?.message || "");
      if (raw.includes("DAILY_LIMIT_REACHED") || raw.includes("200 consultas diarias")) {
        setErrorMsg(
          targetLang === "en"
            ? "⏳ Daily free query limit reached due to high traffic from LinkedIn! Come back tomorrow, or click '🔑 Bring Your Own API Key' above to paste a free Google Gemini (AIza...) or OpenRouter (sk-or-...) key and keep searching immediately."
            : "⏳ Se ha alcanzado el límite diario gratuito por el alto tráfico desde LinkedIn. Puedes volver mañana o pulsar el botón '🔑 Usar mi API Key' arriba e introducir una clave gratuita de Google Gemini (AIza...) u OpenRouter (sk-or-...) para seguir consultando al instante."
        );
      } else if (raw.includes("Failed to fetch") || raw.includes("HTTP_502") || raw.includes("HTTP_503") || raw.includes("NetworkError")) {
        setErrorMsg(
          targetLang === "en"
            ? "⚡ High visitor traffic right now (LinkedIn spike): the Supabase Free Tier vector index or local NVIDIA Jetson Orin GPU timed out on this query. Please click 'Retry Search' or add your own Gemini/OpenRouter API Key."
            : "⚡ Alto tráfico de visitas en este momento (pico desde LinkedIn): la base vectorial gratuita en Supabase o la GPU de la Jetson Orin ha tardado más de lo habitual. Pulsa 'Reintentar ahora' o configura tu propia API Key (Gemini / OpenRouter)."
        );
      } else {
        setErrorMsg(raw);
      }
    }
  };

  const handleDimensionChange = (dim: DimensionOption) => {
    setMrlDimension(dim);
    if (tradResult && query.trim()) {
      runParallelSearch(query, dim, lang);
    }
  };

  const handleLanguageChange = (newLang: Lang) => {
    if (newLang === lang) return;
    setLang(newLang);
    if (typeof document !== "undefined") {
      document.title =
        newLang === "es"
          ? "Consultas Vinculantes DGT · Buscador Fiscal IA (36.053 Resoluciones)"
          : "Spanish Tax Rulings (DGT) · AI Legal Search (36,053 Rulings)";
    }
    if (tradResult && query.trim()) {
      runParallelSearch(query, mrlDimension, newLang);
    }
  };

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
      {/* ==================== CABECERA PRINCIPAL (OPTIMIZADA PARA MÓVIL) ==================== */}
      <header className="border-b border-slate-800/80 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1550px] mx-auto px-3.5 sm:px-6 py-2.5 sm:py-3.5 flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="h-8 w-8 sm:h-10 sm:w-10 shrink-0 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-base sm:text-lg">
              🪆
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-bold text-sm sm:text-lg tracking-tight text-white truncate">
                  hacienda-ESP-rag
                </h1>
                <span className="hidden md:inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {t.badge}
                </span>
              </div>
              <p className="hidden sm:block text-xs text-slate-400 truncate">
                {t.subtitlePrefix}{" "}
                <strong className="text-slate-200">{t.subtitleStrong}</strong>{" "}
                {t.subtitleSuffix}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 text-xs ml-auto flex-wrap">
            {/* Selector de Idioma ES / EN */}
            <div className="flex items-center bg-slate-950 p-0.5 sm:p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => handleLanguageChange("es")}
                className={`px-2 sm:px-2.5 py-1 rounded-md font-semibold transition flex items-center gap-1 ${
                  lang === "es"
                    ? "bg-emerald-500 text-slate-950 shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🇪🇸 ES
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange("en")}
                className={`px-2 sm:px-2.5 py-1 rounded-md font-semibold transition flex items-center gap-1 ${
                  lang === "en"
                    ? "bg-emerald-500 text-slate-950 shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🇬🇧 EN
              </button>
            </div>

            {/* Botón BYOK: Bring Your Own API Key */}
            <button
              type="button"
              onClick={() => {
                setDraftApiKey(customApiKey);
                setShowApiKeyModal(true);
              }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg border flex items-center gap-1.5 font-medium transition ${
                customApiKey
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
              }`}
              title={
                lang === "en"
                  ? "Use your own Google Gemini or OpenRouter API Key"
                  : "Usar tu propia API Key de Google Gemini u OpenRouter"
              }
            >
              <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">
                {customApiKey
                  ? lang === "en"
                    ? "Custom Key Active"
                    : "API Key Activa"
                  : lang === "en"
                  ? "Use API Key"
                  : "Usar API Key"}
              </span>
              <span className="sm:hidden">Key</span>
            </button>

            <button
              type="button"
              onClick={() => setShowEduGuide(!showEduGuide)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition ${
                showEduGuide
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">
                {showEduGuide ? t.hideGuide : t.showGuide}
              </span>
              <span className="sm:hidden">
                {lang === "en" ? "Guide" : "Guía"}
              </span>
            </button>

            <label className="flex items-center gap-1.5 sm:gap-2 bg-slate-900 border border-slate-800 rounded-lg px-2.5 sm:px-3 py-1.5 cursor-pointer hover:border-slate-700">
              <input
                type="checkbox"
                checked={generateAnswer}
                onChange={(e) => setGenerateAnswer(e.target.checked)}
                className="rounded accent-emerald-500"
              />
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden sm:inline text-slate-200 font-medium">
                {t.aiSynthesisToggle}
              </span>
              <span className="sm:hidden text-slate-200 font-medium">IA</span>
            </label>
          </div>
        </div>
      </header>

      {/* ==================== HERO PRINCIPAL Y GUÍA EDUCATIVA ==================== */}
      <section className="border-b border-slate-800/80 bg-gradient-to-b from-emerald-950/25 via-slate-900/50 to-slate-950 px-4 sm:px-6 pt-5 sm:pt-7 pb-5 sm:pb-6">
        <div className="max-w-[1550px] mx-auto space-y-4 sm:space-y-5">
          {/* Título Principal Prominente (Siempre visible) */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 sm:px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] sm:text-xs font-semibold">
              <span>🪆 {t.eduTag}</span>
            </div>
            <h2 className="text-xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-snug sm:leading-tight">
              {lang === "es" ? (
                <>
                  Buscador inteligente sobre{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                    36.053 Consultas Vinculantes
                  </span>{" "}
                  de la Dirección General de Tributos (Hacienda Española)
                </>
              ) : (
                <>
                  Intelligent Search Engine across{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                    36,053 Binding Tax Rulings
                  </span>{" "}
                  from the Spanish Tax Agency (Hacienda)
                </>
              )}
            </h2>
            <p className="text-xs sm:text-base text-slate-300 max-w-4xl">
              {t.eduTitle}
            </p>
          </div>

          {showEduGuide && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 pt-1">
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 sm:p-4 space-y-1.5 sm:space-y-2">
                  <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs sm:text-sm">
                    <Scale className="w-4 h-4 shrink-0" />
                    {t.card1Title}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {t.card1Body}
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-3.5 sm:p-4 space-y-1.5 sm:space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs sm:text-sm">
                    <Layers className="w-4 h-4 shrink-0" />
                    {t.card2Title}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {t.card2Body}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 sm:p-4 space-y-1.5 sm:space-y-2">
                  <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs sm:text-sm">
                    <Database className="w-4 h-4 shrink-0" />
                    {t.card3Title}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {t.card3Body}
                  </p>
                </div>
              </div>

              {/* Visualizador interactivo de la Muñeca Rusa */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
                <div className="space-y-1 max-w-xl">
                  <div className="text-xs font-semibold text-white">
                    {t.visualizerTitle(mrlDimension, vectorRatioPct)}
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-400">
                    {t.visualizerDesc}
                  </p>
                </div>

                <div className="flex-1 w-full max-w-xl space-y-1.5">
                  <div className="h-6 sm:h-5 w-full rounded-lg bg-slate-800 overflow-hidden p-0.5 border border-slate-700 flex items-center">
                    <div
                      style={{ width: `${vectorRatioPct}%` }}
                      className="min-w-[68px] h-full rounded-md bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 flex items-center justify-end pr-2 shrink-0"
                    >
                      <span className="text-[10px] font-bold text-slate-950 whitespace-nowrap">
                        {mrlDimension}D ({vectorRatioPct}%)
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 ml-auto pr-2 truncate pl-2">
                      {t.visualizerDiscarded(ramSavedPct)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span className="truncate max-w-[110px] sm:max-w-none">
                      {t.posStart}
                    </span>
                    <span>128</span>
                    <span>256</span>
                    <span>512</span>
                    <span className="truncate max-w-[110px] sm:max-w-none text-right">
                      {t.posEnd}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ==================== BUSCADOR Y DROPDOWN DE EJEMPLOS ==================== */}
      <section className="border-b border-slate-800/70 bg-slate-900/30 py-4 sm:py-5 px-4 sm:px-6">
        <div className="max-w-[1550px] mx-auto space-y-3">
          {/* Selector Dropdown de Casos Reales */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="text-xs font-medium text-emerald-400 shrink-0 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 shrink-0" />
              {t.sampleLabel}
            </label>
            <select
              value={query}
              onChange={(e) => {
                const selectedQ = e.target.value;
                if (selectedQ) {
                  setQuery(selectedQ);
                  runParallelSearch(selectedQ, mrlDimension, lang);
                }
              }}
              className="w-full sm:flex-1 bg-slate-900 border border-slate-700/90 hover:border-slate-600 rounded-xl px-3.5 py-2.5 sm:py-2 text-base sm:text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition cursor-pointer"
            >
              <option value="">{t.samplePlaceholder}</option>
              {SAMPLE_CATEGORIES.map((group) => (
                <optgroup
                  key={group.categoryEs}
                  label={lang === "en" ? group.categoryEn : group.categoryEs}
                >
                  {group.items.map((item, i) => (
                    <option key={i} value={item.query}>
                      {lang === "en" ? item.labelEn : item.labelEs}
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
              runParallelSearch(query, mrlDimension, lang);
            }}
            className="flex flex-col sm:flex-row gap-2.5 sm:gap-3"
          >
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full pl-11 sm:pl-12 pr-4 py-3 sm:py-3.5 bg-slate-900 border border-slate-700 rounded-xl text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>
            <button
              type="submit"
              disabled={loadingLeft || loadingRight}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] disabled:opacity-50 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/10 shrink-0"
            >
              <Zap className="w-4 h-4 fill-current shrink-0" />
              {loadingLeft || loadingRight ? t.searchingBtn : t.searchBtn}
            </button>
          </form>

          {errorMsg && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/35 text-amber-200 text-xs sm:text-sm space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <p className="font-semibold text-white">
                    {lang === "en"
                      ? "Service Notice / High Visitor Traffic"
                      : "Aviso de Servicio / Alto Tráfico de Visitas"}
                  </p>
                  <p className="text-slate-200 leading-relaxed">{errorMsg}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => runParallelSearch(query, mrlDimension, lang)}
                  className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {lang === "en" ? "Retry Search Now" : "Reintentar búsqueda"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftApiKey(customApiKey);
                    setShowApiKeyModal(true);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-semibold text-xs flex items-center gap-1.5 transition"
                >
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  {lang === "en"
                    ? "Enter My Own API Key (Gemini / OpenRouter)"
                    : "Introducir mi API Key (Gemini / OpenRouter)"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveFeedbackType("bug");
                    setFeedbackSent(false);
                    const el = document.getElementById("feedback-section");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition"
                >
                  <Bug className="w-3.5 h-3.5 text-rose-400" />
                  {lang === "en" ? "Report Issue" : "Reportar fallo"}
                </button>
              </div>
            </div>
          )}

          {/* Tarjetas Resumen (2x2 en móvil, 4 columnas en desktop) */}
          {recallStats && tradResult && mrlResult && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 pt-1 sm:pt-2">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 sm:p-3.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] sm:text-xs font-medium text-slate-400 truncate">
                    {t.metricMatchTitle}
                  </p>
                  <p className="text-base sm:text-xl font-bold text-emerald-400 mt-0.5">
                    {recallStats.pct}%{" "}
                    <span className="block sm:inline text-[10px] sm:text-xs font-normal text-slate-400 truncate">
                      {t.metricMatchSub(recallStats.matched, recallStats.total)}
                    </span>
                  </p>
                </div>
                <CheckCircle2 className="hidden sm:block w-6 h-6 text-emerald-500/60 shrink-0" />
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 sm:p-3.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] sm:text-xs font-medium text-slate-400 truncate">
                    {t.metricRamTitle}
                  </p>
                  <p className="text-base sm:text-xl font-bold text-cyan-400 mt-0.5">
                    -{mrlResult.ram_savings_pct}%{" "}
                    <span className="block sm:inline text-[10px] sm:text-xs font-normal text-slate-400 truncate">
                      {t.metricRamSub(mrlDimension)}
                    </span>
                  </p>
                </div>
                <HardDrive className="hidden sm:block w-6 h-6 text-cyan-500/60 shrink-0" />
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 sm:p-3.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] sm:text-xs font-medium text-slate-400 truncate">
                    {t.metricCloudTitle}
                  </p>
                  <p className="text-base sm:text-xl font-bold text-amber-300 mt-0.5">
                    {mrlResult.latency.vector_search_ms < 1000
                      ? `${mrlResult.latency.vector_search_ms.toFixed(1)} ms`
                      : `${(mrlResult.latency.vector_search_ms / 1000).toFixed(2)} s`}{" "}
                    <span className="block sm:inline text-[10px] sm:text-xs font-normal text-slate-400 truncate">
                      vs{" "}
                      {tradResult.latency.vector_search_ms < 1000
                        ? `${tradResult.latency.vector_search_ms.toFixed(1)} ms`
                        : `${(tradResult.latency.vector_search_ms / 1000).toFixed(2)} s`}{" "}
                      (768D)
                    </span>
                  </p>
                </div>
                <Clock className="hidden sm:block w-6 h-6 text-amber-500/60 shrink-0" />
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 sm:p-3.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] sm:text-xs font-medium text-slate-400 truncate">
                    {t.metricDiskTitle}
                  </p>
                  <p className="text-base sm:text-xl font-bold text-purple-300 mt-0.5">
                    {mrlResult.latency.sqlite_hydration_ms} ms{" "}
                    <span className="block sm:inline text-[10px] sm:text-xs font-normal text-slate-400 truncate">
                      {t.metricDiskSub}
                    </span>
                  </p>
                </div>
                <Database className="hidden sm:block w-6 h-6 text-purple-500/60 shrink-0" />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ==================== CONMUTADOR RÁPIDO PARA MÓVIL (< lg) ==================== */}
      <div className="lg:hidden sticky top-[49px] z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-2">
        <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setMobileTab("mrl")}
            className={`py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1 ${
              mobileTab === "mrl"
                ? "bg-emerald-500 text-slate-950 shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            🪆 {mrlDimension}D (-{ramSavedPct}%)
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("trad")}
            className={`py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1 ${
              mobileTab === "trad"
                ? "bg-blue-500 text-slate-950 shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            🔵 768D (100%)
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("both")}
            className={`py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1 ${
              mobileTab === "both"
                ? "bg-slate-700 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {lang === "en" ? "⚖️ Both" : "⚖️ Ambos"}
          </button>
        </div>
      </div>

      {/* ==================== COMPARATIVA SIDE-BY-SIDE ==================== */}
      <main className="flex-1 max-w-[1550px] w-full mx-auto px-3.5 sm:px-6 py-4 sm:py-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* PANEL IZQUIERDO: MODELO ESTÁNDAR 768D */}
        <section
          className={`${
            mobileTab === "mrl" ? "hidden lg:flex" : "flex"
          } flex-col rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden`}
        >
          <div className="p-3.5 sm:p-4 border-b border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="h-3 w-3 rounded-full bg-blue-400 shrink-0" />
              <div className="min-w-0">
                <h2 className="font-semibold text-xs sm:text-sm text-white truncate">
                  {t.leftPanelTitle}
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                  {t.leftPanelSub}
                </p>
              </div>
            </div>
            <span className="text-[11px] sm:text-xs font-medium px-2 sm:px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/30 shrink-0">
              {t.leftPanelBadge}
            </span>
          </div>

          <div className="p-3 sm:p-4 flex-1 space-y-4">
            {loadingLeft ? (
              <SkeletonLoader count={topK} />
            ) : tradResult ? (
              <>
                {tradResult.synthesized_answer && (
                  <div className="p-3.5 sm:p-4 rounded-xl bg-blue-950/30 border border-blue-500/30 space-y-2.5">
                    <div className="font-semibold text-xs text-blue-300 flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 shrink-0" />{" "}
                        {t.leftAiTitle}
                      </span>
                      <span className="text-[11px] font-normal text-slate-400">
                        {t.clickCitationHint}
                      </span>
                    </div>
                    <FormattedLLMResponse
                      text={tradResult.synthesized_answer}
                      onCitationClick={handleCitationClick}
                    />
                    {(tradResult.llm_status === "quota_exceeded" ||
                      tradResult.llm_status === "invalid_key" ||
                      tradResult.synthesized_answer.startsWith("⚠️") ||
                      tradResult.synthesized_answer.startsWith("⚡")) && (
                      <div className="pt-1 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDraftApiKey(customApiKey);
                            setShowApiKeyModal(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-semibold text-xs flex items-center gap-1.5 transition"
                        >
                          <Key className="w-3.5 h-3.5 text-amber-400" />
                          {lang === "en"
                            ? "🔑 Paste your Gemini / OpenRouter API Key"
                            : "🔑 Introducir mi API Key (Gemini / OpenRouter)"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                    {t.recoveredDocsHeader(tradResult.results.length)}
                  </h3>
                  {tradResult.results.map((doc, idx) => (
                    <DocumentCard
                      key={doc.chunk_id}
                      rank={idx + 1}
                      doc={doc}
                      accent="blue"
                      t={t}
                      onOpenModal={() => setSelectedDocModal(doc)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <EmptyPanelState label={t.emptyLeft} />
            )}
          </div>
        </section>

        {/* PANEL DERECHO: MODELO MATRYOSHKA RECORTADO */}
        <section
          className={`${
            mobileTab === "trad" ? "hidden lg:flex" : "flex"
          } flex-col rounded-2xl border border-emerald-500/30 bg-slate-900/40 overflow-hidden`}
        >
          <div className="p-3.5 sm:p-4 border-b border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <div className="min-w-0">
                <h2 className="font-semibold text-xs sm:text-sm text-white flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span>{t.rightPanelTitle(mrlDimension)}</span>
                  <span className="text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                    {t.rightPanelBadge(ramSavedPct)}
                  </span>
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                  {t.rightPanelSub(vectorRatioPct)}
                </p>
              </div>
            </div>

            {/* Selector 128D / 256D / 512D */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 ml-auto sm:ml-0">
              {([128, 256, 512] as DimensionOption[]).map((dim) => {
                const active = mrlDimension === dim;
                return (
                  <button
                    key={dim}
                    type="button"
                    onClick={() => handleDimensionChange(dim)}
                    className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition ${
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

          <div className="p-3 sm:p-4 flex-1 space-y-4">
            {loadingRight ? (
              <SkeletonLoader count={topK} />
            ) : mrlResult ? (
              <>
                {mrlResult.synthesized_answer && (
                  <div className="p-3.5 sm:p-4 rounded-xl bg-emerald-950/25 border border-emerald-500/30 space-y-2.5">
                    <div className="font-semibold text-xs text-emerald-300 flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 shrink-0" />{" "}
                        {t.rightAiTitle(mrlDimension)}
                      </span>
                      <span className="text-[11px] font-normal text-slate-400">
                        {t.clickCitationHint}
                      </span>
                    </div>
                    <FormattedLLMResponse
                      text={mrlResult.synthesized_answer}
                      onCitationClick={handleCitationClick}
                    />
                    {(mrlResult.llm_status === "quota_exceeded" ||
                      mrlResult.llm_status === "invalid_key" ||
                      mrlResult.synthesized_answer.startsWith("⚠️") ||
                      mrlResult.synthesized_answer.startsWith("⚡")) && (
                      <div className="pt-1 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDraftApiKey(customApiKey);
                            setShowApiKeyModal(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-semibold text-xs flex items-center gap-1.5 transition"
                        >
                          <Key className="w-3.5 h-3.5 text-amber-400" />
                          {lang === "en"
                            ? "🔑 Paste your Gemini / OpenRouter API Key"
                            : "🔑 Introducir mi API Key (Gemini / OpenRouter)"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                    {t.recoveredDocsHeader(mrlResult.results.length)}
                  </h3>
                  {mrlResult.results.map((doc, idx) => (
                    <DocumentCard
                      key={doc.chunk_id}
                      rank={idx + 1}
                      doc={doc}
                      accent="emerald"
                      t={t}
                      isMatchWith768={tradIdsSet.has(doc.num_consulta)}
                      onOpenModal={() => setSelectedDocModal(doc)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <EmptyPanelState label={t.emptyRight} />
            )}
          </div>
        </section>
      </main>

      {/* ==================== WIDGET DE FEEDBACK Y REPORTE DE FALLOS ==================== */}
      <section
        id="feedback-section"
        className="max-w-[1550px] w-full mx-auto px-3.5 sm:px-6 pt-2 pb-4"
      >
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
              <span>
                {lang === "en"
                  ? "💬 What do you think of this Matryoshka RAG experiment?"
                  : "💬 ¿Qué te parece este experimento RAG con Matryoshka?"}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              {lang === "en"
                ? "Let me know if you liked it, what could be improved, or report if something didn't work:"
                : "Dime si te ha resultado útil, qué mejorarías o avísame si algo ha dado error:"}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setActiveFeedbackType("like");
                  setFeedbackSent(false);
                  handleSendFeedback("like", "");
                }}
                className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                  activeFeedbackType === "like"
                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                    : "bg-slate-950 border-slate-800 text-slate-200 hover:border-emerald-500/50"
                }`}
              >
                <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>{lang === "en" ? "Like it" : "Me gusta"}</span>
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]">
                  {feedbackStats.likes}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveFeedbackType("dislike");
                  setFeedbackSent(false);
                }}
                className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                  activeFeedbackType === "dislike"
                    ? "bg-amber-500/20 border-amber-500 text-amber-300"
                    : "bg-slate-950 border-slate-800 text-slate-300 hover:border-amber-500/50"
                }`}
              >
                <ThumbsDown className="w-3.5 h-3.5 text-amber-400" />
                <span>{lang === "en" ? "Could improve" : "Mejorar"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveFeedbackType("bug");
                  setFeedbackSent(false);
                }}
                className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                  activeFeedbackType === "bug"
                    ? "bg-rose-500/20 border-rose-500 text-rose-300"
                    : "bg-slate-950 border-slate-800 text-slate-300 hover:border-rose-500/50"
                }`}
              >
                <Bug className="w-3.5 h-3.5 text-rose-400" />
                <span>
                  {lang === "en"
                    ? "Doesn't work / Report Bug"
                    : "No funciona / Reportar fallo"}
                </span>
              </button>
            </div>
          </div>
        </div>

        {(activeFeedbackType === "dislike" || activeFeedbackType === "bug") &&
          !feedbackSent && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendFeedback(activeFeedbackType, feedbackComment);
              }}
              className="mt-2.5 p-3.5 rounded-xl border border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row gap-2.5"
            >
              <input
                type="text"
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                placeholder={
                  activeFeedbackType === "bug"
                    ? lang === "en"
                      ? "What error did you see? (e.g., timeout, quota limit, mobile layout...)"
                      : "¿Qué error te ha aparecido? (ej. timeout, límite de cuota, fallo en móvil...)"
                    : lang === "en"
                    ? "What would you improve or add to this project?"
                    : "¿Qué mejorarías o añadirías a este proyecto?"
                }
                className="flex-1 px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={sendingFeedback}
                  className="px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  {lang === "en" ? "Send Feedback" : "Enviar a Manuel"}
                </button>
                <a
                  href="https://github.com/manumezog/hacienda-ESP-rag/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 shrink-0"
                >
                  GitHub Issue <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </form>
          )}

        {feedbackSent && (
          <div className="mt-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
            <span>
              {lang === "en"
                ? "✅ Thank you! Your feedback has been recorded on the Jetson server."
                : "✅ ¡Gracias! Tu feedback se ha guardado en el servidor Jetson."}
            </span>
            <button
              type="button"
              onClick={() => setFeedbackSent(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </section>

      {/* ==================== MODAL BYOK (INTRODUCIR API KEY PROPIA) ==================== */}
      {showApiKeyModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowApiKeyModal(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    {lang === "en"
                      ? "Bring Your Own API Key (BYOK)"
                      : "Usar tu propia API Key (BYOK)"}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {lang === "en"
                      ? "Bypass shared free-tier daily limits during traffic spikes"
                      : "Salta el límite diario gratuito compartido durante picos de tráfico"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowApiKeyModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-2 bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
              <p className="font-semibold text-white">
                {lang === "en"
                  ? "Supported API Key formats (auto-detected):"
                  : "Formatos de API Key compatibles (detección automática):"}
              </p>
              <ul className="space-y-1.5 text-slate-300 list-disc pl-4">
                <li>
                  <strong className="text-emerald-400">
                    Google Gemini API Key (<code>AIzaSy...</code>)
                  </strong>{" "}
                  —{" "}
                  {lang === "en" ? "100% free at " : "100% gratuita en "}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 underline hover:text-emerald-300"
                  >
                    Google AI Studio ↗
                  </a>
                </li>
                <li>
                  <strong className="text-amber-300">
                    OpenRouter API Key (<code>sk-or-v1-...</code>)
                  </strong>{" "}
                  —{" "}
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-300 underline hover:text-amber-200"
                  >
                    openrouter.ai/keys ↗
                  </a>
                </li>
                <li>
                  <strong className="text-blue-300">
                    OpenAI API Key (<code>sk-...</code> / <code>sk-proj-...</code>)
                  </strong>{" "}
                  — <code>gpt-4o-mini</code>
                </li>
                <li>
                  <strong className="text-purple-300">
                    Groq API Key (<code>gsk_...</code>)
                  </strong>{" "}
                  —{" "}
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-300 underline hover:text-purple-200"
                  >
                    console.groq.com ↗
                  </a>{" "}
                  (<code>llama-3.3-70b-versatile</code>)
                </li>
                <li>
                  <strong className="text-pink-300">
                    Anthropic Claude API Key (<code>sk-ant-...</code>)
                  </strong>{" "}
                  — <code>claude-3-5-haiku</code>
                </li>
              </ul>
              <p className="text-[11px] text-slate-400 pt-1">
                🔒{" "}
                {lang === "en"
                  ? "Your key is stored only in your browser (localStorage) and sent encrypted via HTTPS strictly for your request. It is never stored on the server."
                  : "Tu clave se guarda únicamente en tu navegador (localStorage) y se envía cifrada por HTTPS solo durante tu consulta. Nunca se almacena en el servidor."}
              </p>
            </div>

            <form onSubmit={handleSaveApiKey} className="space-y-3">
              <input
                type="password"
                value={draftApiKey}
                onChange={(e) => setDraftApiKey(e.target.value)}
                placeholder={
                  lang === "en"
                    ? "Paste AIzaSy..., sk-or-v1-..., sk-..., gsk_..., or sk-ant-..."
                    : "Pega tu clave AIzaSy..., sk-or-v1-..., sk-..., gsk_... o sk-ant-..."
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
              />
              <div className="flex items-center justify-end gap-2">
                {customApiKey && (
                  <button
                    type="button"
                    onClick={handleClearApiKey}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                  >
                    {lang === "en" ? "Remove Saved Key" : "Borrar clave"}
                  </button>
                )}
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs"
                >
                  {lang === "en"
                    ? "Save & Run Search"
                    : "Guardar y Buscar Ahora"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL VISOR DE CONSULTA OFICIAL ==================== */}
      {selectedDocModal && (
        <OfficialDocumentModal
          doc={selectedDocModal}
          t={t}
          onClose={() => setSelectedDocModal(null)}
        />
      )}

      {/* ==================== FOOTER CON BRANDING PERSONAL Y FUENTE OFICIAL ==================== */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 mt-10 py-6 px-6">
        <div className="max-w-[1550px] mx-auto flex flex-col lg:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-base">🪆</span>
            <span>
              {t.footerAuthor}{" "}
              <a
                href="https://cv.manuelmezo.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white font-semibold hover:text-emerald-400 transition"
              >
                Manuel Mezo
              </a>
            </span>
            <span>•</span>
            <a
              href={PETETE_OFFICIAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition font-medium"
            >
              <Scale className="w-3.5 h-3.5" />
              {t.footerSourceLabel}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-5">
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
              href="https://api-hacienda.mezapps.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-slate-300 hover:text-emerald-400 transition font-medium"
            >
              <Database className="w-3.5 h-3.5" />
              API Docs (Swagger)
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
              href="https://www.linkedin.com/in/manuelmezo/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-slate-300 hover:text-emerald-400 transition font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              LinkedIn
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
    const boldParts = lineText.split(/(\*\*.*?\*\*)/g);

    return boldParts.map((part, i) => {
      const isBold = part.startsWith("**") && part.endsWith("**");
      const cleanPart = isBold ? part.slice(2, -2) : part;

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
                  title={`Open official Tax Ruling ${sub}`}
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
  t,
  isMatchWith768,
  onOpenModal,
}: {
  rank: number;
  doc: HydratedDocument;
  accent: "blue" | "emerald";
  t: (typeof UI_TEXT)["es"];
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
            📄 {doc.num_consulta}
          </button>
          <span className="text-xs text-slate-400 font-mono">
            {doc.fecha_salida}
          </span>
          {isMatchWith768 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {t.sameAs768}
            </span>
          )}
        </div>

        <span className="text-xs text-slate-400">
          {t.affinity}{" "}
          <strong className="text-slate-100 font-mono">
            {(doc.similarity * 100).toFixed(1)}%
          </strong>
        </span>
      </div>

      {doc.organo && (
        <p className="text-[11px] text-slate-400 truncate">
          <strong className="text-slate-300">{t.organoLabel}</strong>{" "}
          {doc.organo}
        </p>
      )}

      {doc.normativa && (
        <p className="text-xs text-amber-200/90 bg-amber-500/5 border border-amber-500/15 rounded-lg px-2.5 py-1.5 font-mono line-clamp-2">
          {doc.normativa}
        </p>
      )}

      <div className="text-xs text-slate-200 space-y-1">
        <p className="font-semibold text-slate-300">{t.questionLabel}</p>
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
              <ChevronUp className="w-3.5 h-3.5" /> {t.hideQuickText}
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" /> {t.showQuickText}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenModal}
          className="text-xs text-slate-300 hover:text-white flex items-center gap-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 px-2.5 py-1 rounded-lg transition"
        >
          <ExternalLink className="w-3 h-3" /> {t.openFullModal}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-2.5 text-xs text-slate-300 bg-slate-900/90 p-3.5 rounded-lg border border-slate-800 max-h-96 overflow-y-auto">
          {doc.descripcion_hechos && (
            <div>
              <h4 className="font-semibold text-slate-200 mb-1">
                {t.factsTitle}:
              </h4>
              <p className="whitespace-pre-line leading-relaxed text-slate-400">
                {doc.descripcion_hechos}
              </p>
            </div>
          )}
          <div>
            <h4 className="font-semibold text-slate-200 mb-1">
              {t.rulingTitle}:
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
  t,
  onClose,
}: {
  doc: HydratedDocument;
  t: (typeof UI_TEXT)["es"];
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
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-3 sm:p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 bg-slate-950">
          <div className="flex items-center justify-between w-full sm:w-auto gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 sm:px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono text-xs sm:text-sm font-bold">
                Consulta {doc.num_consulta}
              </span>
              <span className="text-[11px] sm:text-xs text-slate-400 font-mono">
                {t.modalDate} {doc.fecha_salida}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="sm:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => copyCodeAndOpenPetete(false)}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center justify-center gap-1.5 transition shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />{" "}
                  {t.copiedCode(doc.num_consulta)}
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 shrink-0" /> {t.copyCode}
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => copyCodeAndOpenPetete(true)}
              className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition truncate"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t.verifyOfficialWeb}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="hidden sm:inline-flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 text-xs leading-relaxed text-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
            <div>
              <span className="text-slate-400 block text-[11px]">
                {t.modalOrgano}
              </span>
              <strong className="text-white">{doc.organo}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">
                {t.modalNormativa}
              </span>
              <span className="text-amber-200 font-mono">{doc.normativa}</span>
            </div>
          </div>

          {doc.cuestion_planteada && (
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                {t.questionLabel}
              </h4>
              <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 whitespace-pre-line">
                {doc.cuestion_planteada}
              </div>
            </div>
          )}

          {doc.descripcion_hechos && (
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400">
                {t.factsTitle}
              </h4>
              <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 whitespace-pre-line text-slate-300">
                {doc.descripcion_hechos}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">
              {t.rulingTitle}
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
