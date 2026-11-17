"use client";
import { useMemo, useState } from "react";
import { escolherArte } from "../actions";
import { buildArtSvg } from "@/lib/posts";

const input = { width: "100%", padding: 8, margin: "4px 0 8px", borderRadius: 6, border: "1px solid #444", background: "#2b3138", color: "#fff", boxSizing: "border-box" } as const;
const btn = { padding: "8px 14px", borderRadius: 6, border: 0, background: "#2F6FB5", color: "#fff", cursor: "pointer", marginRight: 8 } as const;
const ghost = { ...btn, background: "#444" } as const;

export default function ArtPanel({ id, hook, options, initial, pillar, color, sourceName, sourceDate }: { id: string; hook: string; options: string[]; initial: string; pillar: string; color: string; sourceName: string | null; sourceDate: string | null }) {
  const [phrase, setPhrase] = useState(initial || hook);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const svg = useMemo(() => buildArtSvg({ phrase, pillar, color, sourceName, sourceDate }), [phrase, pillar, color, sourceName, sourceDate]);

  function renderPng(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
        c.getContext("2d")!.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png");
      };
      img.onerror = () => reject(new Error("svg"));
      img.src = url;
    });
  }
  async function baixar() {
    const b = await renderPng(); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "arte-post.png"; a.click();
  }
  /** Guarda o PNG no app para a publicação automática usar a mesma imagem que você aprovou. */
  async function usar() {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/posts/${id}/art`, { method: "POST", body: await renderPng() });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "falha no envio");
      const fd = new FormData(); fd.set("id", id); fd.set("phrase", phrase);
      await escolherArte(fd);
    } catch (x) {
      if ((x as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw x;
      setErr(`Não consegui guardar a imagem (${(x as Error).message}). Você pode baixar o PNG e seguir sem publicação automática com imagem.`); setBusy(false);
    }
  }
  const choices = [...new Set([hook, ...options].filter(Boolean))];
  return (
    <div>
      <label>Frase da arte (o gancho ou uma frase do texto)
        <select style={input} value={choices.includes(phrase) ? phrase : ""} onChange={(e) => e.target.value && setPhrase(e.target.value)}>
          {choices.map((c) => <option key={c} value={c}>{c.length > 80 ? c.slice(0, 80) + "…" : c}</option>)}
          {!choices.includes(phrase) && <option value="">Frase própria (abaixo)</option>}
        </select>
      </label>
      <label>Ou escreva a sua<input style={input} value={phrase} maxLength={200} onChange={(e) => setPhrase(e.target.value)} /></label>
      <div style={{ maxWidth: 320, margin: "8px 0", borderRadius: 8, overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: svg.replace('width="1080" height="1350"', 'width="100%"') }} />
      <p style={{ color: "#aab2bd", fontSize: 13 }}>1080 x 1350, na cor do pilar.{sourceName ? " A fonte entra no rodapé." : ""}</p>
      <button type="button" style={btn} disabled={busy} onClick={usar}>{busy ? "Guardando..." : "Usar esta arte"}</button>
      {err && <p style={{ color: "#ff8a80" }}>{err}</p>}
      <button type="button" style={ghost} onClick={baixar}>Baixar PNG</button>
      <form action={escolherArte} style={{ display: "inline" }}>
        <input type="hidden" name="id" value={id} /><input type="hidden" name="phrase" value="" />
        <button style={ghost}>Pular arte</button>
      </form>
    </div>
  );
}
