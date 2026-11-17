import { z } from "zod";

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;

/** Regras do usuário: sem travessão e sem emoji, em qualquer texto gerado. */
export function sanitizeText(s: string): string {
  return s.replace(EMOJI, "").replace(/\s*[—–]\s*/g, ", ").replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").trim();
}

export const NOTE_MAX = 200;

/** Nota de convite cabe em 200 caracteres. Corta na última frase inteira, sem inventar texto. */
export function fitNote(note: string): string | null {
  const s = sanitizeText(note).replace(/\s+/g, " ");
  if (s.length <= NOTE_MAX) return s;
  const cut = s.slice(0, NOTE_MAX);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return end > 60 ? cut.slice(0, end + 1) : null;
}

/** Caminho canônico /in/slug de um perfil público, ou null se não for perfil. */
export function profileKey(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/in\/([^/]+)/i);
    return m ? `/in/${decodeURIComponent(m[1]).toLowerCase()}` : null;
  } catch { return null; }
}

export const personSchema = z.object({
  name: z.string().trim().min(3).max(120),
  role: z.string().trim().max(160).default(""),
  company: z.string().trim().max(120).default(""),
  profile_url: z.string().trim().url(),
  why: z.string().trim().max(300).default(""),
  invite_note: z.string().trim().min(10),
  followup_message: z.string().trim().min(20).max(900),
});
export type Person = z.infer<typeof personSchema>;

export function parsePeople(raw: string): Person[] {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return [];
  const arr = z.array(z.unknown()).parse(JSON.parse(m[0]));
  return arr.flatMap((x) => { const p = personSchema.safeParse(x); return p.success ? [p.data] : []; }).slice(0, 3);
}

/** Só passa quem tem link de perfil que de fato apareceu nos resultados da busca e nota válida. */
export function verifyPeople(people: Person[], seenUrls: string[]) {
  const seen = new Set(seenUrls.map(profileKey).filter((k): k is string => Boolean(k)));
  const out: (Person & { profile_url: string })[] = [];
  const dropped: string[] = [];
  for (const p of people) {
    const key = profileKey(p.profile_url);
    const note = fitNote(p.invite_note);
    if (!key || !seen.has(key)) { dropped.push(`${p.name}: link não veio da busca`); continue; }
    if (!note) { dropped.push(`${p.name}: nota passou de ${NOTE_MAX} caracteres`); continue; }
    out.push({ ...p, profile_url: `https://www.linkedin.com${key}`, invite_note: note, followup_message: sanitizeText(p.followup_message), why: sanitizeText(p.why) });
  }
  return { people: out, dropped };
}

/** Busca de pessoas no próprio LinkedIn, aberta pelo usuário. Grátis e sem automação. */
export function linkedinPeopleSearch(company: string, area: string): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${area} ${company}`.trim())}`;
}

/** Limites diários da diretriz: até 2 abordagens ligadas a vaga e até 5 de construção de rede. */
export const DAILY_LIMIT = { vaga: 2, rede: 5 } as const;
