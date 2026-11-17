import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "LinkedinStyle",
  description: "Busca de vagas e presença no LinkedIn, com você no controle do último clique.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1f2328" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#1f2328", color: "#fff" }}>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px", lineHeight: 1.55 }}>{children}</main>
      </body>
    </html>
  );
}
