"use client";
import { useState, useTransition } from "react";
import { sugerirPilares } from "./ai-actions";
import { PALETTE, type Pillar } from "@/lib/pillars";
import { formatUsd } from "@/lib/llm/cost";

const input = { width: "100%", padding: 8, margin: "4px 0 8px", borderRadius: 6, border: "1px solid #444", background: "#2b3138", color: "#fff", boxSizing: "border-box" } as const;
const btn = { padding: "8px 14px", borderRadius: 6, border: 0, background: "#2F6FB5", color: "#fff", cursor: "pointer", marginRight: 8 } as const;
const ghost = { padding: "6px 10px", borderRadius: 6, border: "1px solid #555", background: "transparent", color: "#fff", cursor: "pointer" } as const;

export default function PillarsEditor({ initial, estimateUsd, hasKey }: { initial: Pillar[]; estimateUsd: number; hasKey: boolean }) {
  const [items, setItems] = useState<Pillar[]>(initial);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const nextColor = (list: Pillar[]) => PALETTE.find((c) => !list.some((p) => p.color.toLowerCase() === c.toLowerCase())) ?? PALETTE[0];
  const set = (i: number, patch: Partial<Pillar>) => setItems((l) => l.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  function sugerir() {
    setMsg("");
    start(async () => {
      const r = await sugerirPilares(estimateUsd);
      if (!r.ok) return setMsg(r.error);
      setItems(r.pillars);
      setMsg(`Sugestões prontas. Custo real: ${formatUsd(r.usd)}. Edite, descarte ou acrescente o que quiser.`);
    });
  }

  return (
    <div>
      <input type="hidden" name="pillars" value={JSON.stringify(items)} />
      <p style={{ color: "#aab2bd", fontSize: 14 }}>O app cruza seu currículo, os cargos e os setores que você escolheu e propõe de 4 a 6 pilares. Nenhum é obrigatório.</p>
      <button type="button" style={btn} disabled={pending || !hasKey} onClick={sugerir}>
        {pending ? "Gerando..." : `Sugerir pilares (custo estimado ${formatUsd(estimateUsd)})`}
      </button>
      {!hasKey && <p style={{ color: "#ffd180" }}>Sem chave da API não há sugestão automática. Volte à etapa anterior ou adicione pilares à mão.</p>}
      {hasKey && <p style={{ color: "#aab2bd", fontSize: 14 }}>Nada é cobrado até você tocar no botão. É estimativa, o custo real aparece depois.</p>}
      {msg && <p style={{ background: "#2b3138", padding: 10, borderRadius: 6 }}>{msg}</p>}

      {items.map((p, i) => (
        <section key={i} style={{ border: `2px solid ${p.color}`, borderRadius: 8, padding: 12, margin: "12px 0" }}>
          <label>Nome<input style={input} value={p.name} maxLength={40} onChange={(e) => set(i, { name: e.target.value })} /></label>
          <label>O que entra<input style={input} value={p.description} maxLength={200} onChange={(e) => set(i, { description: e.target.value })} /></label>
          <label>Palavras-chave para o radar de notícias (separadas por vírgula)
            <input style={input} value={p.keywords.join(", ")} onChange={(e) => set(i, { keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 10) })} />
          </label>
          <label>Cor
            <select style={input} value={p.color} onChange={(e) => set(i, { color: e.target.value })}>
              {[...new Set([p.color, ...PALETTE])].map((c) => <option key={c} value={c} style={{ color: c }}>{c}</option>)}
            </select>
          </label>
          {p.origin && <p style={{ color: "#aab2bd", fontSize: 14 }}>Por que apareceu: {p.origin}</p>}
          <button type="button" style={ghost} onClick={() => setItems((l) => l.filter((_, j) => j !== i))}>Descartar</button>
        </section>
      ))}
      <button type="button" style={ghost} onClick={() => setItems((l) => [...l, { name: "", description: "", keywords: [], color: nextColor(l), origin: "" }])}>Adicionar pilar manual</button>
    </div>
  );
}
