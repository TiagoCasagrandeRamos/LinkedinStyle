"use client";
import { useMemo, useState } from "react";
import { salvarTexto } from "../actions";
import { MOBILE_CUT, POST_MAX, scanAvoid } from "@/lib/posts";

const input = { width: "100%", padding: 8, margin: "4px 0", borderRadius: 6, border: "1px solid #444", background: "#2b3138", color: "#fff", boxSizing: "border-box" } as const;
const btn = { padding: "8px 14px", borderRadius: 6, border: 0, background: "#2F6FB5", color: "#fff", cursor: "pointer", marginRight: 8 } as const;

function Preview({ text, avoid, label }: { text: string; avoid: string[]; label: string }) {
  const { hits, unverifiable } = useMemo(() => scanAvoid(text, avoid), [text, avoid]);
  const points = new Set<number>([0, text.length, Math.min(MOBILE_CUT, text.length)]);
  hits.forEach((h) => { points.add(h.start); points.add(h.end); });
  const sorted = [...points].sort((a, b) => a - b);
  const parts = sorted.slice(0, -1).map((s, i) => {
    const e = sorted[i + 1];
    const hit = hits.find((h) => h.start <= s && h.end >= e);
    return { s, e, text: text.slice(s, e), hit };
  });
  const over = text.length > POST_MAX;
  return (
    <div style={{ margin: "8px 0" }}>
      <div style={{ fontSize: 13, color: over ? "#ff8a80" : "#aab2bd" }}>{label}: {text.length} de {POST_MAX} caracteres. A linha tracejada marca onde o celular costuma cortar para o ver mais (cerca de {MOBILE_CUT}).</div>
      <p style={{ whiteSpace: "pre-wrap", background: "#2b3138", padding: 10, borderRadius: 6, lineHeight: 1.6 }}>
        {parts.map((p) => (
          <span key={p.s}>
            {p.s === Math.min(MOBILE_CUT, text.length) && text.length > MOBILE_CUT && <span style={{ display: "block", borderTop: "2px dashed #ffd180", color: "#ffd180", fontSize: 12, margin: "6px 0" }}>celular corta aqui</span>}
            {p.hit ? <mark style={{ background: "#ffd180", color: "#1f2328" }} title={`Você pediu para evitar: ${p.hit.term}`}>{p.text}</mark> : p.text}
          </span>
        ))}
      </p>
      {hits.length > 0 && <p style={{ color: "#ffd180", fontSize: 14 }}>{hits.length} ocorrência(s) do que você pediu para evitar, marcadas acima: {[...new Set(hits.map((h) => h.term))].join(", ")}. O app não corrige sozinho, edite abaixo.</p>}
      {unverifiable.length > 0 && <p style={{ color: "#aab2bd", fontSize: 13 }}>Sem checagem automática: {unverifiable.join(", ")}. Leia com atenção.</p>}
    </div>
  );
}

export default function TextEditor({ id, body, bodySecondary, secondaryLang, language, avoid }: { id: string; body: string; bodySecondary: string; secondaryLang: string | null; language: string; avoid: string[] }) {
  const [a, setA] = useState(body);
  const [b, setB] = useState(bodySecondary);
  const name = (l: string) => (l === "pt" ? "português" : "inglês");
  return (
    <form action={salvarTexto}>
      <input type="hidden" name="id" value={id} />
      <Preview text={a} avoid={avoid} label={`Versão em ${name(language)}`} />
      <textarea name="body" style={{ ...input, minHeight: 200 }} value={a} onChange={(e) => setA(e.target.value)} />
      {secondaryLang && (<>
        <Preview text={b} avoid={avoid} label={`Versão em ${name(secondaryLang)} (adaptada)`} />
        <textarea name="body_secondary" style={{ ...input, minHeight: 200 }} value={b} onChange={(e) => setB(e.target.value)} />
      </>)}
      <button style={btn}>Salvar edição do texto</button>
    </form>
  );
}
