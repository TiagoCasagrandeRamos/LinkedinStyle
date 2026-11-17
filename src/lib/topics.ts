import type { NewsItem } from "./news";

export type DiscardReason = "fora_do_tema" | "ja_falei" | "fonte_fraca" | "nao_concordo";
export const REASON_LABEL: Record<DiscardReason, string> = {
  fora_do_tema: "Fora do meu tema", ja_falei: "Já falei disso", fonte_fraca: "Fonte fraca", nao_concordo: "Não concordo com a notícia",
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const tokens = (s: string) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 3));

/** Semelhança de títulos por palavras em comum, de 0 a 1. */
export function similarity(a: string, b: string): number {
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter);
}

/** Primeira palavra-chave do pilar que aparece no título, ou null. */
export function matchKeyword(title: string, keywords: string[]): string | null {
  const t = norm(title);
  return keywords.find((k) => k.trim() && t.includes(norm(k))) ?? null;
}

export interface TopicDraft {
  pillar: string; pillar_color: string; title: string;
  source_title: string; source_name: string; source_url: string; source_date: string;
  keyword: string | null; matched: boolean; rank_score: number;
}
export interface Feedback { reason: DiscardReason; keyword: string | null; source_name: string | null; title: string }

/** Sem motivo o radar não aprende: cada descarte pesa na próxima sugestão. */
export function rankScore(t: { title: string; keyword: string | null; matched: boolean; source_name: string; source_date: string }, feedback: Feedback[], postedTitles: string[], now = new Date()): number {
  let s = 10;
  const ageDays = Math.max(0, (now.getTime() - new Date(t.source_date).getTime()) / 86_400_000);
  s -= Math.min(3, ageDays * 0.5);
  if (t.matched) s += 3;
  let weak = 0, off = 0;
  for (const f of feedback) {
    if (f.reason === "fonte_fraca" && f.source_name && f.source_name === t.source_name) weak++;
    if (f.reason === "fora_do_tema" && f.keyword && f.keyword === t.keyword) off++;
    if (f.reason === "nao_concordo" && similarity(f.title, t.title) >= 0.5) s -= 6;
    if (f.reason === "ja_falei" && similarity(f.title, t.title) >= 0.4) s -= 6;
  }
  s -= Math.min(8, weak * 4) + Math.min(9, off * 3);
  if (postedTitles.some((p) => similarity(p, t.title) >= 0.4)) s -= 6;
  return Math.round(s * 100) / 100;
}

/** Por que a pauta foi sugerida, em uma frase. */
export function reasonText(t: { keyword: string | null; matched: boolean }, pillar: string): string {
  if (t.keyword && t.matched) return `A palavra-chave "${t.keyword}" do pilar ${pillar} bateu no título.`;
  if (t.keyword) return `Veio da busca por "${t.keyword}" do pilar ${pillar}, sem bater no título.`;
  return `Veio da busca do pilar ${pillar}.`;
}

export function buildTopics(
  pillars: { name: string; color: string; keywords: string[] }[], news: Record<string, NewsItem[]>,
  feedback: Feedback[], postedTitles: string[], now = new Date(),
): TopicDraft[] {
  const out: TopicDraft[] = [];
  for (const p of pillars) {
    for (const n of news[p.name] ?? []) {
      const hit = matchKeyword(n.title, p.keywords);
      const keyword = hit ?? p.keywords[0] ?? null;
      const base = { title: n.title, keyword, matched: Boolean(hit), source_name: n.source, source_date: n.date };
      out.push({
        pillar: p.name, pillar_color: p.color, title: n.title, source_title: n.title, source_name: n.source, source_url: n.link,
        source_date: n.date, keyword, matched: Boolean(hit), rank_score: rankScore(base, feedback, postedTitles, now),
      });
    }
  }
  out.sort((a, b) => b.rank_score - a.rank_score);
  const kept: TopicDraft[] = [];
  for (const t of out) if (!kept.some((k) => similarity(k.title, t.title) >= 0.7)) kept.push(t);
  return kept;
}
