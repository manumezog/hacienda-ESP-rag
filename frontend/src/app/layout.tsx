import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hacienda-ESP-RAG | Matryoshka (MRL) Legal Benchmark",
  description:
    "DevTool interactiva comparando RAG Tradicional (768D) vs Edge RAG Matryoshka (128D/256D/512D) con EmbeddingGemma, Supabase pgvector e hidratación local en SQLite.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
