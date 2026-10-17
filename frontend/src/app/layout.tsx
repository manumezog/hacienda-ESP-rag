import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Consultas Vinculantes DGT · Buscador Fiscal IA (36.053 Resoluciones)",
  description:
    "Buscador inteligente sobre 36.053 Consultas Vinculantes de la Dirección General de Tributos (Hacienda Española) con IA y compresión vectorial Matryoshka (MRL). Desarrollado por Manuel Mezo.",
  applicationName: "Buscador DGT · Hacienda IA",
  authors: [{ name: "Manuel Mezo", url: "https://cv.manuelmezo.com" }],
  openGraph: {
    title: "Consultas Vinculantes DGT · Buscador Fiscal IA (36.053 Resoluciones)",
    description:
      "Compara en tiempo real búsqueda vectorial completa (768D) frente a Matryoshka (128D, -83% RAM) sobre 36.053 Consultas Vinculantes de Hacienda.",
    url: "https://hacienda.mezapps.com",
    siteName: "Buscador Fiscal IA · Consultas Vinculantes DGT",
    locale: "es_ES",
    type: "website",
  },
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
