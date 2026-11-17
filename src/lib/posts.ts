import { z } from "zod";
import { sanitizeText } from "./network";

export const STEPS = ["rascunho", "roteiro", "texto", "arte", "agendado", "publicado"] as const;
export type Step = (typeof STEPS)[number];
export const STEP_LABEL: Record<Step, string> = { rascunho: "Rascunho", roteiro: "Roteiro", texto: "Texto", arte: "Arte", agendado: "Agendado", publicado: "Publicado" };

export const prevStep = (s: Step): Step | null => STEPS[STEPS.indexOf(s) - 1] ?? null;
export const nextStep = (s: Step): Step | null => STEPS[STEPS.indexOf(s) + 1] ?? null;

export const scriptSchema = z.object({
  hook: z.string().trim().min(5).max(220),
  beats: z.array(z.string().trim().min(3).max(220)).min(3).max(5),
  closing: z.string().trim().min(5).max(220),
  resume_data: z.array(z.string().trim().min(2).max(200)).max(6).default([]),
});
export type Script = z.infer<typeof scriptSchema>;

/** O texto só é liberado depois que a pessoa aprova o roteiro. */
export const canGenerateText = (script: unknown, approved: boolean): boolean => approved && scriptSchema.safeParse(script).success;

/** Limite aproximado do que o LinkedIn mostra no celular antes do "ver mais". */
export const MOBILE_CUT = 140;
export const POST_MAX = 3000;
export const splitAtCut = (text: string, cut = MOBILE_CUT) => ({ above: text.slice(0, cut), below: text.slice(cut) });

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;
const RULES: { match: RegExp; test: RegExp }[] = [
  { match: /travess/i, test: /[—–]/g },
  { match: /emoji/i, test: EMOJI },
  { match: /palavr[aã]o/i, test: /\b(porra|caralho|merda|bosta|foda|fodas?|puta|cacete|buceta)\b/gi },
  { match: /clich[eê]/i, test: /(é com (muito )?orgulho|tenho o prazer de|feliz em compartilhar|jornada|networking|game ?changer|pensar fora da caixa|zona de conforto|vestir a camisa|mindset|aprendizado constante)/gi },
  { match: /jarg[aã]o/i, test: /\b(alavancar|sinergia|proativ[oa]|disruptiv[oa]|stakeholders?|empoderar|ecossistema|robust[oa]|hol[ií]stic[oa]|escal[aá]vel|de forma estrat[eé]gica)\b/gi },
  { match: /autoelogio/i, test: /(sou apaixonad[oa]|especialista em|refer[eê]ncia em|melhor do mercado|expert em|sou um dos melhores)/gi },
  { match: /promessa sem dado/i, test: /(garanto|resultado garantido|vai dobrar|vai triplicar|sem esfor[cç]o|f[oó]rmula (m[aá]gica|secreta))/gi },
];

export interface Hit { term: string; start: number; end: number; text: string }

/** Varre o texto contra a lista do que evitar. Só marca, nunca corrige. */
export function scanAvoid(text: string, avoid: string[]): { hits: Hit[]; unverifiable: string[] } {
  const hits: Hit[] = [];
  const unverifiable: string[] = [];
  for (const term of avoid.map((a) => a.trim()).filter(Boolean)) {
    const rule = RULES.find((r) => r.match.test(term));
    if (rule) {
      for (const m of text.matchAll(new RegExp(rule.test.source, rule.test.flags.includes("g") ? rule.test.flags : rule.test.flags + "g"))) {
        hits.push({ term, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, text: m[0] });
      }
    } else if (/frase de efeito/i.test(term)) {
      unverifiable.push(term);
    } else {
      const lower = text.toLowerCase(), t = term.toLowerCase();
      for (let i = lower.indexOf(t); i !== -1; i = lower.indexOf(t, i + t.length)) hits.push({ term, start: i, end: i + t.length, text: text.slice(i, i + t.length) });
    }
  }
  return { hits: hits.sort((a, b) => a.start - b.start), unverifiable };
}

/** Frases do texto, para a pessoa escolher a da arte. */
export function sentences(text: string): string[] {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 12 && s.length <= 140);
}

/** Quebra de linha por largura, para o texto caber na arte. */
export function wrapLines(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > perLine) { if (cur) lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const cut = lines.slice(0, maxLines); cut[maxLines - 1] = cut[maxLines - 1].replace(/[,;:\s]+$/, "") + "…"; return cut; }
  return lines;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Arte 1080x1350: fundo grafite, texto branco, destaque na cor do pilar, fonte no rodapé. */
export function buildArtSvg(o: { phrase: string; pillar: string; color: string; sourceName?: string | null; sourceDate?: string | null }): string {
  const lines = wrapLines(sanitizeText(o.phrase), 22, 9);
  const text = lines.map((l, i) => `<tspan x="90" dy="${i === 0 ? 0 : 96}">${esc(l)}</tspan>`).join("");
  const date = o.sourceDate ? new Date(o.sourceDate).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
  const footer = o.sourceName ? `Fonte: ${o.sourceName}${date ? `, ${date}` : ""}` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#1F2328"/><rect x="90" y="110" width="140" height="12" fill="${esc(o.color)}"/><text x="90" y="190" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="500" fill="${esc(o.color)}">${esc(o.pillar.toUpperCase())}</text><text x="90" y="400" font-family="Inter, Arial, sans-serif" font-size="78" font-weight="700" fill="#FFFFFF">${text}</text>${footer ? `<text x="90" y="1250" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="400" fill="#AAB2BD">${esc(footer.slice(0, 70))}</text>` : ""}</svg>`;
}
