import type { SupabaseClient } from "@supabase/supabase-js";
import { collectGreenhouse } from "../collectors/greenhouse";
import { decryptSecret } from "../crypto";
import { makeClaudeScorer, type FitScorer } from "../llm/requirements";
import { DEFAULT_WEIGHTS, type JobPrefs, type NormalizedJob, type Weights } from "../types";
import { processJobs, type ProcessReport } from "./process";

export interface RunDeps {
  collectGreenhouse: typeof collectGreenhouse;
  scorer?: FitScorer;
}

export interface RunResult extends ProcessReport {
  sourceErrors: string[];
  stored: number;
}

/** Roda a coleta e a nota de um usuário. Funciona com o client do usuário (RLS) ou com service role. */
export async function runUserPipeline(sb: SupabaseClient, userId: string, deps: RunDeps = { collectGreenhouse }): Promise<RunResult> {
  const [{ data: prof }, { data: prefRow }, { data: resumeRows }, { data: sources }, { data: known }] = await Promise.all([
    sb.from("ls_profiles").select("weights, llm_key_encrypted").eq("user_id", userId).single(),
    sb.from("ls_job_preferences").select("*").eq("user_id", userId).single(),
    sb.from("ls_resumes").select("id, language, text_content").eq("user_id", userId).not("confirmed_at", "is", null),
    sb.from("ls_job_sources").select("kind, slug_or_url, company").eq("user_id", userId).eq("active", true),
    sb.from("ls_jobs").select("dedupe_key").eq("user_id", userId),
  ]);
  if (!prefRow) throw new Error("preferências de vaga não cadastradas");
  const resumes = (resumeRows ?? []).filter((r) => r.language === "pt" || r.language === "en")
    .map((r) => ({ id: r.id as string, language: r.language as "pt" | "en", text: (r.text_content ?? "") as string }));
  if (resumes.length === 0) throw new Error("nenhum currículo validado");

  let scorer = deps.scorer;
  if (!scorer) {
    if (!prof?.llm_key_encrypted) throw new Error("chave da API não cadastrada");
    scorer = makeClaudeScorer(decryptSecret(prof.llm_key_encrypted));
  }

  const prefs: JobPrefs = {
    titles: prefRow.titles, seniority: prefRow.seniority, workModes: prefRow.work_modes, cities: prefRow.cities,
    salaryFloor: prefRow.salary_floor ?? undefined, preferredSectors: prefRow.preferred_sectors,
    blockedCompanies: prefRow.blocked_companies, freelanceOk: prefRow.freelance_ok,
  };
  const weights: Weights = { ...DEFAULT_WEIGHTS, ...(prof?.weights ?? {}) };

  const jobs: NormalizedJob[] = [];
  const sourceErrors: string[] = [];
  for (const s of sources ?? []) {
    if (s.kind !== "greenhouse") continue; // demais coletores entram nas próximas versões
    try { jobs.push(...(await deps.collectGreenhouse(s.slug_or_url, s.company ?? s.slug_or_url))); }
    catch (e) { sourceErrors.push(`${s.slug_or_url}: ${(e as Error).message}`); }
  }

  const report = await processJobs({ jobs, prefs, weights, resumes, scorer, knownKeys: new Set((known ?? []).map((k) => k.dedupe_key)) });

  const rows = report.rows.map((r) => ({
    user_id: userId, source: r.job.source, external_id: r.job.externalId, dedupe_key: r.job.dedupeKey,
    company: r.job.company, title: r.job.title, url: r.job.url, location: r.job.location, work_mode: r.job.workMode,
    description: r.job.description, posted_at: r.job.postedAt ?? null, language: r.language, language_confidence: r.languageConfidence,
    score: r.total, score_parts: r.parts, score_justification: r.justification,
  }));
  if (rows.length) {
    const { error } = await sb.from("ls_jobs").upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return { ...report, sourceErrors, stored: rows.length };
}
