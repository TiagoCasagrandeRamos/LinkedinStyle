"use client";
import { useState } from "react";

export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); }
    catch { window.prompt("Copie o texto:", text); }
  }
  return <button type="button" onClick={copy} style={{ padding: "4px 10px", borderRadius: 6, border: 0, background: "#444", color: "#fff", cursor: "pointer", fontSize: 13 }}>{done ? "Copiado" : label}</button>;
}
