import { detectJobLanguage, type Lang, type LangResult } from "../language";
import { dedupe } from "../normalize";
import { pickResume } from "../resume/pick";
import { scoreJob, isBlocked } from "../scoring/score";
import { sumUsage, type Usage } from "../llm/cost";
import type { FitScorer } from "../llm/requirements";
import type { JobPrefs, NormalizedJob, Weights } from "../types";

export interface ResumeInput { id: string; language: Lang; text: string }

export interface Candidate { job: NormalizedJob; lang: LangResult; titleRatio: number }

export interface ScoredRow {
  job: NormalizedJob;
  language: Lang;
  languageConfidence: number;
  total: number;
  parts: Record<string, number>;
  justification: string[];
}

/** Teto de avaliações por rodada, para o custo ficar previsível. */
export const MAX_LLM_CALLS = 40;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Fração das palavras do cargo desejado que aparecem no título da vaga. */
export function titleMatch(jobTitle: string, wanted: string[]): number {
  const t = norm(jobTitle);
  let best = 0;
  for (const w of wanted) {
    const words = norm(w).split(/\s+/).filter((x) => x.length >= 3);
    if (words.length === 0) continue;
    const hit = words.filter((x) => t.includes(x)).length / words.length;
    best = Math.max(best, hit);
  }
  return best;
}

function seniorityFit(job: NormalizedJob, prefs: JobPrefs, ratio: number): number {
  const t = norm(job.title);
  const senHit = prefs.seniority.length === 0 || prefs.seniority.some((s) => t.includes(norm(s)));
  return Math.min(1, 0.6 * ratio + 0.4 * (senHit ? 1 : 0.3));
}

/** Fase gratuita: filtra e detecta o idioma. Não chama o LLM. */
export function selectCandidates(jobs: NormalizedJob[], prefs: JobPrefs, knownKeys: Set<string>) {
  const skipped = { known: 0, blocked: 0, offTitle: 0 };
  const candidates: Candidate[] = [];
  for (const job of dedupe(jobs)) {
    if (knownKeys.has(job.dedupeKey)) { skipped.known++; continue; }
    if (isBlocked(job.company, prefs.blockedCompanies)) { skipped.blocked++; continue; }
    const titleRatio = titleMatch(job.title, prefs.titles);
    if (titleRatio < 0.5) { skipped.offTitle++; continue; }
    candidates.push({ job, lang: detectJobLanguage(job.title, job.description), titleRatio });
  }
  return { candidates, skipped };
}

export interface ScoreInput {
  candidates: Candidate[];
  prefs: JobPrefs;
  weights: Weights;
  resumes: ResumeInput[];
  scorer: FitScorer;
  maxLlmCalls?: number;
}

/** Fase paga: uma chamada ao LLM por vaga, com teto. */
export async function scoreCandidates(inp: ScoreInput) {
  const rows: ScoredRow[] = [];
  const usages: Usage[] = [];
  let overLimit = 0;
  let calls = 0;
  const max = inp.maxLlmCalls ?? MAX_LLM_CALLS;

  for (const c of inp.candidates) {
    if (calls >= max) { overLimit++; continue; }
    const pick = pickResume(inp.resumes.map((r) => ({ id: r.id, language: r.language })), c.lang.lang);
    const resume = inp.resumes.find((r) => r.id === pick.resume?.id);
    if (!resume) { overLimit++; continue; }

    calls++;
    const fit = await inp.scorer(c.job.title, c.job.description, resume.text);
    if (fit.usage) usages.push(fit.usage);
    const s = scoreJob({
      job: c.job, prefs: inp.prefs, weights: inp.weights,
      requirementsFit: fit.fit, requirementsReason: fit.reason,
      seniorityAreaFit: seniorityFit(c.job, inp.prefs, c.titleRatio),
    });
    s.justification.push(`idioma da vaga: ${c.lang.lang} (confiança ${c.lang.confidence}). ${pick.note}`);
    rows.push({ job: c.job, language: c.lang.lang, languageConfidence: c.lang.confidence, total: s.total, parts: s.parts, justification: s.justification });
  }
  rows.sort((a, b) => b.total - a.total);
  return { rows, overLimit, usage: sumUsage(usages) };
}

export interface ProcessInput {
  jobs: NormalizedJob[];
  prefs: JobPrefs;
  weights: Weights;
  resumes: ResumeInput[];
  knownKeys: Set<string>;
  scorer: FitScorer;
  maxLlmCalls?: number;
}

/** As duas fases juntas. Usado em testes; o app separa as fases para pedir autorização. */
export async function processJobs(inp: ProcessInput) {
  const { candidates, skipped } = selectCandidates(inp.jobs, inp.prefs, inp.knownKeys);
  const r = await scoreCandidates({ ...inp, candidates });
  return { rows: r.rows, skipped: { ...skipped, overLimit: r.overLimit }, usage: r.usage };
}
