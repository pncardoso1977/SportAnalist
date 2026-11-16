import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SportAnalist — Futsal Match Analysis",
  description: "Plataforma de análise técnico-tática de futsal com vídeo sincronizado, eventos e estatísticas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt"><body>{children}</body></html>;
}