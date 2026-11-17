"use client";
import { useMemo, useState, useTransition } from "react";
import { aprenderDoTexto, gerarExemplo } from "./ai-actions";
import { composeBriefing, conflictWarnings } from "@/lib/writing/briefing";
import { DEFAULT_AVOID, TRAIT_KEYS, TRAIT_LABEL, type TraitWeights } from "@/lib/writing/traits";
import { estimateLearn, estimatePreview, formatUsd, usageCost } from "@/lib/llm/cost";

const input = { width: "100%", padding: 8, margin: "4px 0 8px", borderRadius: 6, border: "1px solid #444", background: "#2b3138", color: "#fff", boxSizing: "border-box" } as const;
const btn = { padding: "8px 14px", borderRadius: 6, border: 0, background: "#2F6FB5", color: "#fff", cursor: "pointer", marginRight: 8 } as const;

export default function WritingEditor({ initial, initialAvoid, resumeChars, hasKey }: { initial: TraitWeights; initialAvoid: string[]; resumeChars: number; hasKey: boolean }) {
  const [w, setW] = useState<TraitWeights>(initial);
  const [avoid, setAvoid] = useState((initialAvoid.length ? initialAvoid : DEFAULT_AVOID).join("\n"));
  const [samples, setSamples] = useState("");
  const [example, setExample] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const avoidList = useMemo(() => avoid.split(/[\n,;]/).map((x) => x.trim()).filter(Boolean), [avoid]);
  const briefing = useMemo(() => composeBriefing(w, avoidList), [w, avoidList]);
  const warnings = useMemo(() => conflictWarnings(w), [w]);
  const exampleUsd = usageCost(estimatePreview(resumeChars, briefing.length));
  const learnUsd = usageCost(estimateLearn(samples.length));

  function exemplo() {
    setMsg("");
    start(async () => {
      const r = await gerarExemplo(w, avoidList, exampleUsd);
      if (!r.ok) return setMsg(r.error);
      setExample(r.text);
      setMsg(`Exemplo gerado. Custo real: ${formatUsd(r.usd)}.`);
    });
  }
  function aprender() {
    setMsg("");
    start(async () => {
      const r = await aprenderDoTexto(samples, learnUsd);
      if (!r.ok) return setMsg(r.error);
      setW(r.weights);
      setMsg(`Pesos propostos a partir dos seus textos (custo real ${formatUsd(r.usd)}). Ajuste como quiser.`);
    });
  }

  return (
    <div>
      <input type="hidden" name="weights" value={JSON.stringify(w)} />
      <p style={{ color: "#aab2bd", fontSize: 14 }}>Dê peso de 0 (não usar) a 5 (marcante). Cada traço com peso vira regras concretas de escrita, e os de maior peso vencem quando houver conflito.</p>
      {TRAIT_KEYS.map((k) => (
        <label key={k} style={{ display: "block", margin: "8px 0" }}>
          {TRAIT_LABEL[k]}: <strong>{w[k]}</strong>
          <input type="range" min={0} max={5} step={1} value={w[k]} style={{ width: "100%" }} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} />
        </label>
      ))}
      {warnings.map((t) => <p key={t} style={{ color: "#ffd180" }}>{t}</p>)}

      <section style={{ border: "1px solid #3a4048", borderRadius: 8, padding: 12, margin: "12px 0" }}>
        <strong>Briefing que o app vai usar</strong>
        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, color: "#cfd6df" }}>{briefing}</pre>
      </section>

      <section style={{ border: "1px solid #2F6FB5", borderRadius: 8, padding: 12, margin: "12px 0" }}>
        <strong>Pré-visualização com o seu currículo</strong>
        <p style={{ color: "#aab2bd", fontSize: 14 }}>O briefing acima atualiza na hora, de graça. O parágrafo de exemplo chama o Claude, então só sai quando você tocar no botão.</p>
        <button type="button" style={btn} disabled={pending || !hasKey} onClick={exemplo}>{pending ? "Gerando..." : `Gerar exemplo (custo estimado ${formatUsd(exampleUsd)})`}</button>
        {!hasKey && <p style={{ color: "#ffd180" }}>Cadastre a chave da API na etapa 3 para gerar o exemplo.</p>}
        {example && <p style={{ whiteSpace: "pre-wrap", background: "#2b3138", padding: 10, borderRadius: 6 }}>{example}</p>}
      </section>

      <section style={{ border: "1px solid #3a4048", borderRadius: 8, padding: 12, margin: "12px 0" }}>
        <strong>Aprender do meu texto (opcional)</strong>
        <p style={{ color: "#aab2bd", fontSize: 14 }}>Cole dois ou três textos que você já escreveu. O app propõe os pesos e você ajusta.</p>
        <textarea style={{ ...input, minHeight: 140 }} value={samples} onChange={(e) => setSamples(e.target.value)} placeholder="Cole aqui os seus textos" />
        <button type="button" style={btn} disabled={pending || !hasKey || samples.trim().length < 200} onClick={aprender}>{`Propor pesos (custo estimado ${formatUsd(learnUsd)})`}</button>
      </section>

      {msg && <p style={{ background: "#2b3138", padding: 10, borderRadius: 6 }}>{msg}</p>}

      <label>O que evitar (um por linha). Já vem com uma base: remova o que não quiser e acrescente os seus termos.
        <textarea name="avoid" style={{ ...input, minHeight: 160 }} value={avoid} onChange={(e) => setAvoid(e.target.value)} />
      </label>
    </div>
  );
}
