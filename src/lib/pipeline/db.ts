import type { SupabaseClient } from "@supabase/supabase-js";
import { collectGreenhouse } from "../collectors/greenhouse";
import { decryptSecret } from "../crypto";
import { DEFAULT_MODEL, estimateCall, sumUsage, usageCost, type Usage } from "../llm/cost";
import { makeClaudeScorer, type FitScorer } from "../llm/requirements";
import { pickResume } from "../resume/pick";
import { DEFAULT_WEIGHTS, type JobPrefs, type NormalizedJob, type Weights, type WorkMode } from "../types";
import { MAX_LLM_CALLS, scoreCandidates, selectCandidates, titleMatch, type Candidate, type ResumeInput } from "./process";
import type { Lang } from "../language";

export interface CollectDeps { collectGreenhouse: typeof collectGreenhouse }

async function loadContext(sb: SupabaseClient, userId: string) {
  const [{ data: prof }, { data: prefRow }, { data: resumeRows }] = await Promise.all([
    sb.from("ls_profiles").select("weights, llm_key_encrypted").eq("user_id", userId).single(),
    sb.from("ls_job_preferences").select("*").eq("user_id", userId).single(),
    sb.from("ls_resumes").select("id, language, text_content").eq("user_id", userId).not("confirmed_at", "is", null),
  ]);
  if (!prefRow) throw new Error("Preferências de vaga não cadastradas");
  const resumes: ResumeInput[] = (resumeRows ?? []).filter((r) => r.language === "pt" || r.language === "en")
    .map((r) => ({ id: r.id as string, language: r.language as Lang, text: (r.text_content ?? "") as string }));
  if (resumes.length === 0) throw new Error("Nenhum currículo validado");
  const prefs: JobPrefs = {
    titles: prefRow.titles, seniority: prefRow.seniority, workModes: prefRow.work_modes, cities: prefRow.cities,
    salaryFloor: prefRow.salary_floor ?? undefined, preferredSectors: prefRow.preferred_sectors,
    blockedCompanies: prefRow.blocked_companies, freelanceOk: prefRow.freelance_ok,
  };
  const weights: Weights = { ...DEFAULT_WEIGHTS, ...(prof?.weights ?? {}) };
  return { prefs, weights, resumes, encryptedKey: prof?.llm_key_encrypted as string | null | undefined };
}

export interface CollectResult {
  stored: number;
  skipped: { known: number; blocked: number; offTitle: number };
  sourceErrors: string[];
}

/**
 * Fase gratuita: coleta, filtra, detecta idioma e guarda as vagas SEM nota
 * (score nulo). Nenhuma chamada ao LLM, nenhum custo.
 */
export async function collectPending(sb: SupabaseClient, userId: string, deps: CollectDeps = { collectGreenhouse }): Promise<CollectResult> {
  const { prefs } = await loadContext(sb, userId);
  const [{ data: sources }, { data: known }] = await Promise.all([
    sb.from("ls_job_sources").select("kind, slug_or_url, company").eq("user_id", userId).eq("active", true),
    sb.from("ls_jobs").select("dedupe_key").eq("user_id", userId),
  ]);
  const gh = (sources ?? []).filter((s) => s.kind === "greenhouse");
  if (gh.length === 0) throw new Error("Nenhuma fonte cadastrada. Adicione um board em Fontes de vagas.");

  const jobs: NormalizedJob[] = [];
  const sourceErrors: string[] = [];
  for (const s of gh) {
    try { jobs.push(...(await deps.collectGreenhouse(s.slug_or_url, s.company ?? s.slug_or_url))); }
    catch (e) { sourceErrors.push(`${s.slug_or_url}: ${(e as Error).message}`); }
  }

  const { candidates, skipped } = selectCandidates(jobs, prefs, new Set((known ?? []).map((k) => k.dedupe_key)));
  const rows = candidates.map((c) => ({
    user_id: userId, source: c.job.source, external_id: c.job.externalId, dedupe_key: c.job.dedupeKey,
    company: c.job.company, title: c.job.title, url: c.job.url, location: c.job.location, work_mode: c.job.workMode,
    description: c.job.description, posted_at: c.job.postedAt ?? null, language: c.lang.lang, language_confidence: c.lang.confidence,
  }));
  if (rows.length) {
    const { error } = await sb.from("ls_jobs").upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return { stored: rows.length, skipped, sourceErrors };
}

interface PendingRow {
  id: string; source: string; external_id: string; dedupe_key: string; company: string; title: string; url: string;
  location: string | null; work_mode: string | null; description: string | null; language: Lang | null;
  language_confidence: number | null; posted_at: string | null;
}

const PENDING_COLS = "id, source, external_id, dedupe_key, company, title, url, location, work_mode, description, language, language_confidence, posted_at";

async function loadPending(sb: SupabaseClient, userId: string): Promise<PendingRow[]> {
  const { data } = await sb.from("ls_jobs").select(PENDING_COLS).eq("user_id", userId).is("score", null).eq("blocked", false).order("collected_at");
  return (data ?? []) as PendingRow[];
}

export interface Estimate {
  pendingTotal: number;
  /** Quantas vagas seriam avaliadas agora (há um teto por rodada). */
  willScore: number;
  usage: Usage;
  usd: number;
  model: string;
}

/** Quanto custaria avaliar as vagas pendentes. Só leitura, sem custo. */
export async function estimatePending(sb: SupabaseClient, userId: string): Promise<Estimate> {
  const { resumes } = await loadContext(sb, userId);
  const pending = await loadPending(sb, userId);
  const batch = pending.slice(0, MAX_LLM_CALLS);
  const usages = batch.map((p) => {
    const pick = pickResume(resumes.map((r) => ({ id: r.id, language: r.language })), (p.language ?? "en") as Lang);
    const resume = resumes.find((r) => r.id === pick.resume?.id);
    return estimateCall((p.description ?? "").length + p.title.length, (resume?.text ?? "").length);
  });
  const usage = sumUsage(usages);
  return { pendingTotal: pending.length, willScore: batch.length, usage, usd: usageCost(usage), model: DEFAULT_MODEL };
}

export interface ScoreResult { scored: number; usage: Usage; usd: number; left: number }

/**
 * Fase paga. Só roda com a autorização do usuário: ele aprova uma contagem e um
 * valor, e se a estimativa atual passar disso a rodada é cancelada.
 */
export async function scorePending(
  sb: SupabaseClient, userId: string, approved: { calls: number; usd: number }, scorerOverride?: FitScorer,
): Promise<ScoreResult> {
  const ctx = await loadContext(sb, userId);
  const est = await estimatePending(sb, userId);
  if (est.willScore === 0) return { scored: 0, usage: { input: 0, output: 0 }, usd: 0, left: 0 };
  if (est.willScore > approved.calls || est.usd > approved.usd * 1.2 + 0.0001) {
    throw new Error("A estimativa mudou desde que você viu o valor. Confira o novo valor e autorize de novo.");
  }
  let scorer = scorerOverride;
  if (!scorer) {
    if (!ctx.encryptedKey) throw new Error("Chave da API da Anthropic não cadastrada");
    scorer = makeClaudeScorer(decryptSecret(ctx.encryptedKey));
  }

  const pending = (await loadPending(sb, userId)).slice(0, MAX_LLM_CALLS);
  const byKey = new Map(pending.map((p) => [p.dedupe_key, p]));
  const candidates: Candidate[] = pending.map((p) => {
    const job: NormalizedJob = {
      source: p.source as NormalizedJob["source"], externalId: p.external_id, company: p.company, title: p.title, url: p.url,
      location: p.location ?? "", workMode: (p.work_mode ?? "unknown") as WorkMode, description: p.description ?? "",
      postedAt: p.posted_at ?? undefined, dedupeKey: p.dedupe_key,
    };
    return { job, lang: { lang: p.language ?? "en", confidence: p.language_confidence ?? 0 }, titleRatio: titleMatch(p.title, ctx.prefs.titles) };
  });

  const r = await scoreCandidates({ candidates, prefs: ctx.prefs, weights: ctx.weights, resumes: ctx.resumes, scorer, maxLlmCalls: approved.calls });
  for (const row of r.rows) {
    const p = byKey.get(row.job.dedupeKey);
    if (!p) continue;
    await sb.from("ls_jobs").update({ score: row.total, score_parts: row.parts, score_justification: row.justification }).eq("id", p.id).eq("user_id", userId);
  }
  return { scored: r.rows.length, usage: r.usage, usd: usageCost(r.usage), left: Math.max(0, est.pendingTotal - r.rows.length) };
}

export async function discardPending(sb: SupabaseClient, userId: string): Promise<void> {
  await sb.from("ls_jobs").delete().eq("user_id", userId).is("score", null);
}
