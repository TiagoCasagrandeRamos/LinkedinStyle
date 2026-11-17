"use client";
import { useState } from "react";
import { salvarRoteiro } from "../actions";
import type { Script } from "@/lib/posts";

const input = { width: "100%", padding: 8, margin: "4px 0", borderRadius: 6, border: "1px solid #444", background: "#2b3138", color: "#fff", boxSizing: "border-box" } as const;
const btn = { padding: "8px 14px", borderRadius: 6, border: 0, background: "#2F6FB5", color: "#fff", cursor: "pointer", marginRight: 8 } as const;
const small = { padding: "4px 9px", borderRadius: 6, border: "1px solid #555", background: "transparent", color: "#fff", cursor: "pointer", fontSize: 13, marginRight: 4 } as const;

export default function ScriptEditor({ id, initial, editable }: { id: string; initial: Script; editable: boolean }) {
  const [hook, setHook] = useState(initial.hook);
  const [beats, setBeats] = useState(initial.beats);
  const [closing, setClosing] = useState(initial.closing);
  const [data, setData] = useState(initial.resume_data.join("\n"));

  const move = (i: number, d: number) => setBeats((b) => { const j = i + d; if (j < 0 || j >= b.length) return b; const c = [...b]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const payload = JSON.stringify({ hook, beats: beats.filter((b) => b.trim()), closing, resume_data: data.split("\n").map((x) => x.trim()).filter(Boolean) });

  return (
    <form action={salvarRoteiro}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="script" value={payload} />
      <label>Gancho (a primeira linha, antes do ver mais)
        <textarea style={input} rows={2} value={hook} disabled={!editable} onChange={(e) => setHook(e.target.value)} />
      </label>
      <div>Beats ({beats.length} de 3 a 5)</div>
      {beats.map((b, i) => (
        <div key={i} style={{ margin: "6px 0" }}>
          <textarea style={input} rows={2} value={b} disabled={!editable} onChange={(e) => setBeats((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
          {editable && <div>
            <button type="button" style={small} onClick={() => move(i, -1)}>Subir</button>
            <button type="button" style={small} onClick={() => move(i, 1)}>Descer</button>
            <button type="button" style={small} onClick={() => setBeats((l) => l.filter((_, j) => j !== i))}>Remover</button>
          </div>}
        </div>
      ))}
      {editable && beats.length < 5 && <button type="button" style={small} onClick={() => setBeats((l) => [...l, ""])}>Adicionar beat</button>}
      <label style={{ display: "block", marginTop: 10 }}>Fechamento (pergunta ou posicionamento)
        <textarea style={input} rows={2} value={closing} disabled={!editable} onChange={(e) => setClosing(e.target.value)} />
      </label>
      <label>Dados do currículo que entram (um por linha, pode ficar vazio)
        <textarea style={input} rows={2} value={data} disabled={!editable} onChange={(e) => setData(e.target.value)} />
      </label>
      {editable && <button style={btn}>Salvar roteiro</button>}
    </form>
  );
}
