import { z } from "zod";
import { pillarSchema } from "./pillars";
import { normalizeWeights } from "./writing/traits";

const list = (s: string) => s.split(/[\n,;]/).map((x) => x.trim()).filter(Boolean);

export const jobPrefsSchema = z.object({
  titles: z.string().transform(list).pipe(z.array(z.string()).min(1, "Informe ao menos um cargo")),
  seniority: z.string().transform(list),
  workModes: z.array(z.enum(["remote", "hybrid", "onsite"])).min(1, "Escolha ao menos uma modalidade"),
  cities: z.string().transform(list),
  currency: z.string().length(3).default("BRL"),
  salaryPeriod: z.enum(["month", "year", "hour"]),
  salaryFloor: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)),
  salaryTarget: z.coerce.number().positive().optional().or(z.literal("").transform(() => undefined)),
  contractTypes: z.array(z.string()).default([]),
  freelanceOk: z.boolean(),
  preferredSectors: z.string().transform(list),
  blockedCompanies: z.string().transform(list),
  blockedConfirmed: z.literal(true, { message: "Confirme a lista de empresas bloqueadas (pode ser vazia)" }),
  dailyJobLimit: z.coerce.number().int().min(1).max(50),
  minScoreOutreach: z.coerce.number().int().min(0).max(100),
});

const hex = /^#[0-9a-fA-F]{6}$/;

/** Uma linha por pilar: "Nome | #2F6FB5". A cor é opcional. */
export function parsePillars(text: string): { name: string; color: string }[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const [name, color] = line.split("|").map((x) => x.trim());
    return { name, color: color && hex.test(color) ? color : "#6B7280" };
  });
}

export const contentSchema = z.object({
  /** JSON da lista de pilares montada na tela. Nenhum pilar é obrigatório. */
  pillars: z.string().transform((s, ctx) => {
    try { return JSON.parse(s || "[]"); } catch { ctx.addIssue({ code: "custom", message: "Pilares inválidos" }); return z.NEVER; }
  }).pipe(z.array(pillarSchema).max(8)),
  postsPerWeek: z.coerce.number().int().min(0).max(14),
  postDays: z.array(z.coerce.number().int().min(0).max(6)).default([]),
  postTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().min(1),
  languages: z.array(z.enum(["pt", "en"])).min(1, "Escolha ao menos um idioma"),
});

export const writingSchema = z.object({
  weights: z.string().transform((s) => { try { return normalizeWeights(JSON.parse(s)); } catch { return normalizeWeights({}); } }),
  avoid: z.string().transform(list),
});
