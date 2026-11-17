import { z } from "zod";

/** Paleta fixa, uma cor por pilar. Todas passam de 4,5:1 sobre o fundo do template (#1F2328). */
export const PALETTE = ["#6AA7E8", "#F2A65A", "#7BD389", "#E58FB0", "#B8A1F0", "#E8D44D", "#5ED1C8", "#F08A7E"];
export const TEMPLATE_BG = "#1F2328";

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export const pillarSchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200).default(""),
  keywords: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** De qual parte do currículo ou das preferências a sugestão saiu. "" quando é manual. */
  origin: z.string().trim().max(200).default(""),
});
export type Pillar = z.infer<typeof pillarSchema>;

/** Dá a cada pilar a primeira cor da paleta que ainda não foi usada. */
export function assignColors<T extends { color?: string }>(items: T[]): (T & { color: string })[] {
  const used = new Set<string>();
  return items.map((it) => {
    const free = PALETTE.find((c) => !used.has(c)) ?? PALETTE[used.size % PALETTE.length];
    used.add(free);
    return { ...it, color: free };
  });
}

export const suggestionSchema = z.array(z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200),
  keywords: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
  origin: z.string().trim().max(200),
})).min(1).max(8);

export function parseSuggestions(raw: string) {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) throw new Error("resposta sem lista");
  return suggestionSchema.parse(JSON.parse(m[0])).slice(0, 6);
}

/** Valida a lista que veio de uma chamada estruturada (tool use), sem depender de texto livre. */
export function validateSuggestions(raw: unknown) {
  return suggestionSchema.parse(raw).slice(0, 6);
}
