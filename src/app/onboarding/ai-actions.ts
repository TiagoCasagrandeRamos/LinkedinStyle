"use server";
import { requireUser } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { estimateLearn, estimatePillars, estimatePreview, usageCost, type Usage } from "@/lib/llm/cost";
import { learnWeights, previewPost, suggestPillars } from "@/lib/llm/generate";
import { assignColors, type Pillar } from "@/lib/pillars";
import { composeBriefing } from "@/lib/writing/briefing";
import { normalizeWeights, type TraitWeights } from "@/lib/writing/traits";

type Fail = { ok: false; error: string };

/** Chave do usuário e currículo validado (prefere o português). */
type Ctx = { error: string } | { error?: undefined; key: string; resume: string; titles: string[]; sectors: string[] };
async function context(): Promise<Ctx> {
  const { sb, user } = await requireUser();
  if (!user) return { error: "Faça login de novo." };
  const [{ data: prof }, { data: resumes }, { data: prefs }] = await Promise.all([
    sb.from("ls_profiles").select("llm_key_encrypted").eq("user_id", user.id).single(),
    sb.from("ls_resumes").select("language, text_content").eq("user_id", user.id).not("confirmed_at", "is", null).order("language", { ascending: false }),
    sb.from("ls_job_preferences").select("titles, preferred_sectors").eq("user_id", user.id).single(),
  ]);
  if (!prof?.llm_key_encrypted) return { error: "Cadastre a chave da API da Anthropic na etapa anterior para usar a sugestão." };
  const resume = (resumes ?? [])[0]?.text_content as string | undefined;
  if (!resume) return { error: "Nenhum currículo validado." };
  let key: string;
  try { key = decryptSecret(prof.llm_key_encrypted); } catch { return { error: "Não consegui ler a chave salva. Cadastre de novo." }; }
  return { key, resume, titles: (prefs?.titles ?? []) as string[], sectors: (prefs?.preferred_sectors ?? []) as string[] };
}

/** A estimativa que o usuário viu autoriza o gasto. Se a atual passar muito dela, cancela. */
const overApproved = (est: Usage, approvedUsd: number) => usageCost(est) > approvedUsd * 1.2 + 0.0001;
const STALE = "A estimativa mudou desde que você viu o valor. Confira o novo valor e autorize de novo.";

export async function sugerirPilares(approvedUsd: number): Promise<{ ok: true; pillars: Pillar[]; usd: number } | Fail> {
  const c = await context();
  if (c.error !== undefined) return { ok: false, error: c.error };
  const est = estimatePillars(c.resume.length, c.titles.join().length + c.sectors.join().length);
  if (overApproved(est, approvedUsd)) return { ok: false, error: STALE };
  try {
    const r = await suggestPillars(c.key, { resume: c.resume, titles: c.titles, sectors: c.sectors });
    return { ok: true, pillars: assignColors(r.suggestions.map((s) => ({ ...s, color: "" }))) as Pillar[], usd: usageCost(r.usage) };
  } catch (e) {
    return { ok: false, error: `Não consegui gerar: ${(e as Error).message}` };
  }
}

export async function gerarExemplo(rawWeights: unknown, avoid: string[], approvedUsd: number): Promise<{ ok: true; text: string; usd: number } | Fail> {
  const c = await context();
  if (c.error !== undefined) return { ok: false, error: c.error };
  const weights = normalizeWeights(rawWeights);
  const briefing = composeBriefing(weights, avoid.slice(0, 30).map((a) => String(a).slice(0, 80)));
  if (overApproved(estimatePreview(c.resume.length, briefing.length), approvedUsd)) return { ok: false, error: STALE };
  try {
    const r = await previewPost(c.key, c.resume, briefing);
    return { ok: true, text: r.text, usd: usageCost(r.usage) };
  } catch (e) {
    return { ok: false, error: `Não consegui gerar: ${(e as Error).message}` };
  }
}

export async function aprenderDoTexto(samples: string, approvedUsd: number): Promise<{ ok: true; weights: TraitWeights; usd: number } | Fail> {
  const c = await context();
  if (c.error !== undefined) return { ok: false, error: c.error };
  const text = String(samples ?? "").trim();
  if (text.length < 200) return { ok: false, error: "Cole pelo menos dois ou três textos seus, com algumas linhas cada." };
  if (overApproved(estimateLearn(text.length), approvedUsd)) return { ok: false, error: STALE };
  try {
    const r = await learnWeights(c.key, text);
    return { ok: true, weights: r.weights, usd: usageCost(r.usage) };
  } catch (e) {
    return { ok: false, error: `Não consegui analisar: ${(e as Error).message}` };
  }
}
