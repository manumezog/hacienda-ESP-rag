"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  Bug,
  RefreshCw,
  Bell,
  Key,
  Database,
  Activity,
  ExternalLink,
  Search,
  Users,
  Cpu,
  ArrowLeft,
} from "lucide-react";

const _rawEnvApiUrl = process.env.NEXT_PUBLIC_API_URL || "";
const API_BASE_URL = (
  _rawEnvApiUrl && !_rawEnvApiUrl.includes("manuelmezo.com")
    ? _rawEnvApiUrl
    : "https://api-hacienda.mezapps.com"
).replace(/\/+$/, "");

interface FeedbackItem {
  id: number;
  rating: string;
  comment: string;
  query: string;
  lang: string;
  client_ip: string;
  created_at: string;
}

interface SearchLogItem {
  id: number;
  created_at: string;
  query: string;
  dimensions: number;
  lang: string;
  search_backend: string;
  llm_status: string;
  used_byok: number;
  vector_ms: number;
  hydration_ms: number;
  llm_ms: number;
  total_ms: number;
  results_count: number;
  client_ip: string;
}

interface TopQueryItem {
  query: string;
  count: number;
  avg_ms: number;
}

interface AdminOverview {
  feedback_stats: { likes: number; dislikes: number; bugs: number };
  feedback_list: FeedbackItem[];
  traffic_stats: {
    total_requests: number;
    unique_visitors: number;
    byok_requests: number;
    supabase_ok: number;
    sqlite_fallback: number;
    llm_ok: number;
    llm_quota_exceeded: number;
    avg_total_ms: number;
    avg_vector_ms: number;
    avg_hydration_ms: number;
  };
  recent_searches: SearchLogItem[];
  top_queries: TopQueryItem[];
  caches: {
    embedding_cache_items: number;
    vector_cache_items: number;
    llm_cache_items: number;
  };
  alerts: {
    ntfy_topic: string;
    ntfy_subscribe_url: string;
    smtp_configured: boolean;
    alert_email: string;
  };
}

export default function AdminDashboardPage() {
  const [adminKey, setAdminKey] = useState("manuel2026");
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ text: string; ok: boolean } | null>(
    null
  );
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchOverview = useCallback(
    async (customKey?: string) => {
      let k = (customKey ?? adminKey).trim() || "manuel2026";
      setLoading(true);
      try {
        let res = await fetch(
          `${API_BASE_URL}/api/admin/overview?key=${encodeURIComponent(k)}`
        );
        if (res.status === 401 && k !== "manuel2026") {
          k = "manuel2026";
          setAdminKey("manuel2026");
          res = await fetch(
            `${API_BASE_URL}/api/admin/overview?key=${encodeURIComponent(k)}`
          );
        }
        const json = await res.json();
        if (!res.ok) {
          setBanner({
            text: json.detail || "Clave de administrador incorrecta",
            ok: false,
          });
          setLoading(false);
          return;
        }
        setData(json);
        setLastUpdated(new Date().toLocaleTimeString());
        setBanner(null);
      } catch {
        setBanner({
          text: "No se pudo conectar con la API en la Jetson.",
          ok: false,
        });
      } finally {
        setLoading(false);
      }
    },
    [adminKey]
  );

  useEffect(() => {
    fetchOverview();
    const timer = setInterval(() => {
      fetchOverview();
    }, 15000);
    return () => clearInterval(timer);
  }, [fetchOverview]);

  const handleTestAlert = async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/test-alert?key=${encodeURIComponent(
          adminKey.trim()
        )}`,
        { method: "POST" }
      );
      const json = await res.json();
      if (res.ok) {
        setBanner({
          text: `✅ Alerta de prueba enviada! Push ntfy.sh: ${
            json.channels?.ntfy ? "Enviado OK" : "Error"
          } · Email SMTP: ${
            json.smtp_configured
              ? json.channels?.smtp
                ? "Enviado OK"
                : "Error"
              : "Usa el canal Push ntfy.sh o añade SMTP_PASS en backend/.env"
          }`,
          ok: true,
        });
      } else {
        setBanner({ text: json.detail || "Error al enviar alerta", ok: false });
      }
    } catch {
      setBanner({ text: "Error de red al probar alerta", ok: false });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Volver al buscador"
            >
              <ArrowLeft className="w-4 h-4" />
            </a>
            <div>
              <h1 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">
                <span>🪆 Hacienda-ESP-RAG · Panel Admin & Feedback</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Auto-refresh 15s
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Telemetría en vivo desde tu NVIDIA Jetson Orin{" "}
                {lastUpdated && `· Actualizado a las ${lastUpdated}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5">
              <Key className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="password"
                value={adminKey}
                onChange={(e) => {
                  setAdminKey(e.target.value);
                  window.localStorage.setItem(
                    "hacienda_admin_key",
                    e.target.value
                  );
                }}
                placeholder="Admin Key"
                className="bg-transparent text-xs text-white focus:outline-none font-mono w-28"
              />
            </div>

            <button
              type="button"
              onClick={() => fetchOverview()}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Actualizar
            </button>

            <button
              type="button"
              onClick={handleTestAlert}
              className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-semibold text-xs flex items-center gap-1.5 transition"
            >
              <Bell className="w-3.5 h-3.5" />
              Probar Alerta
            </button>

            {data?.alerts?.ntfy_subscribe_url && (
              <a
                href={data.alerts.ntfy_subscribe_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 font-semibold text-xs flex items-center gap-1.5 transition"
              >
                📱 Suscribirse a Alertas Push (ntfy.sh)
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </header>

        {banner && (
          <div
            className={`px-4 py-3 rounded-xl border text-xs ${
              banner.ok
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-red-500/10 border-red-500/30 text-red-300"
            }`}
          >
            {banner.text}
          </div>
        )}

        {/* KPI Cards */}
        <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" /> Likes
            </span>
            <p className="text-2xl font-bold text-emerald-400 mt-1">
              {data?.feedback_stats.likes ?? "-"}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <ThumbsDown className="w-3.5 h-3.5 text-amber-400" /> Dislikes
            </span>
            <p className="text-2xl font-bold text-amber-400 mt-1">
              {data?.feedback_stats.dislikes ?? "-"}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Bug className="w-3.5 h-3.5 text-red-400" /> Bugs Reportados
            </span>
            <p className="text-2xl font-bold text-red-400 mt-1">
              {data?.feedback_stats.bugs ?? "-"}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Search className="w-3.5 h-3.5 text-blue-400" /> Búsquedas
            </span>
            <p className="text-2xl font-bold text-white mt-1">
              {data?.traffic_stats.total_requests ?? "-"}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-indigo-400" /> IPs Únicas
            </span>
            <p className="text-2xl font-bold text-indigo-400 mt-1">
              {data?.traffic_stats.unique_visitors ?? "-"}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Key className="w-3.5 h-3.5 text-purple-400" /> Usos BYOK
            </span>
            <p className="text-2xl font-bold text-purple-400 mt-1">
              {data?.traffic_stats.byok_requests ?? "-"}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" /> Caché RAM
            </span>
            <p className="text-base font-bold text-emerald-300 mt-1.5 font-mono">
              {data
                ? `${data.caches.embedding_cache_items} / ${data.caches.vector_cache_items} / ${data.caches.llm_cache_items}`
                : "-/-/-"}
            </p>
          </div>
        </section>

        {/* Feedback + Top Queries */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">
                💬 Feedback y Comentarios Recibidos
              </h2>
              <span className="text-xs text-slate-400 font-mono">
                {data?.feedback_list.length ?? 0} registros
              </span>
            </div>

            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {data?.feedback_list.length ? (
                data.feedback_list.map((f) => (
                  <div
                    key={f.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                          f.rating === "like"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : f.rating === "bug"
                            ? "bg-red-500/20 text-red-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {f.rating === "like"
                          ? "👍 LIKE"
                          : f.rating === "bug"
                          ? "🐛 BUG"
                          : "👎 DISLIKE"}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {f.created_at.replace("T", " ").slice(0, 19)} UTC ·{" "}
                        {f.client_ip}
                      </span>
                    </div>
                    {f.comment && (
                      <p className="text-white font-medium">“{f.comment}”</p>
                    )}
                    {f.query && (
                      <p className="text-[11px] text-slate-400">
                        Consulta activa:{" "}
                        <span className="text-slate-300">{f.query}</span>
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">
                  No hay comentarios registrados todavía.
                </p>
              )}
            </div>
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400" />
                Consultas Fiscales Más Buscadas
              </h2>
              <span className="text-xs text-slate-400 font-mono">
                Hidratación media: {data?.traffic_stats.avg_hydration_ms ?? 0}{" "}
                ms
              </span>
            </div>

            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1 text-xs">
              {data?.top_queries.length ? (
                data.top_queries.map((q, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <span className="text-slate-200 truncate">{q.query}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono shrink-0">
                      {q.count}x · {q.avg_ms} ms
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">
                  Aún no hay búsquedas registradas desde el último reinicio.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Live Search Log Table */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Database className="w-4 h-4 text-blue-400" />
              Últimas Búsquedas en Tiempo Real
            </h2>
            <span className="text-xs text-slate-400 font-mono">
              Supabase OK: {data?.traffic_stats.supabase_ok ?? 0} · SQLite
              Fallback: {data?.traffic_stats.sqlite_fallback ?? 0} · LLM OK:{" "}
              {data?.traffic_stats.llm_ok ?? 0} · Cuota 429:{" "}
              {data?.traffic_stats.llm_quota_exceeded ?? 0}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 px-2">Hora UTC</th>
                  <th className="py-2 px-2">Consulta</th>
                  <th className="py-2 px-2">Dim</th>
                  <th className="py-2 px-2">Motor</th>
                  <th className="py-2 px-2">Estado LLM</th>
                  <th className="py-2 px-2">Total</th>
                  <th className="py-2 px-2">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {data?.recent_searches.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-950/60">
                    <td className="py-2 px-2 text-slate-400 whitespace-nowrap">
                      {s.created_at.slice(11, 19)}
                    </td>
                    <td className="py-2 px-2 text-slate-200 max-w-xl break-words font-sans">
                      {s.query}
                    </td>
                    <td className="py-2 px-2 text-emerald-400">
                      {s.dimensions}D
                    </td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      {s.search_backend === "jetson_local_vectors" ? (
                        <span className="text-emerald-400 font-bold">
                          🟢 Jetson Vector
                        </span>
                      ) : s.search_backend === "supabase_pgvector" ? (
                        <span className="text-blue-300">☁️ Supabase</span>
                      ) : (
                        <span className="text-amber-300">⚡ SQLite Léxico</span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {s.used_byok ? "🔑 BYOK · " : ""}
                      <span
                        className={
                          s.llm_status === "ok"
                            ? "text-emerald-300"
                            : s.llm_status === "quota_exceeded"
                            ? "text-amber-300"
                            : "text-slate-400"
                        }
                      >
                        {s.llm_status}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-slate-300">
                      {s.total_ms} ms
                    </td>
                    <td className="py-2 px-2 text-slate-500">{s.client_ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
