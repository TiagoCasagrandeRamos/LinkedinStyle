import type { JobPrefs, NormalizedJob, Weights } from "../types";
import { DEFAULT_WEIGHTS } from "../types";

export interface ScoreInput {
  job: NormalizedJob;
  prefs: JobPrefs;
  /** 0 a 1, vindo do LLM comparando vaga e currículo */
  requirementsFit: number;
  requirementsReason: string;
  /** 0 a 1, por padrão derivado do título; pode ser sobrescrito */
  seniorityAreaFit?: number;
  companySectors?: string[];
  weights?: Weights;
}

export interface ScoreResult {
  total: number;
  blocked: boolean;
  capped: boolean;
  parts: Record<string, number>;
  justification: string[];
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function isBlocked(company: string, blocked: string[]): boolean {
  const c = norm(company);
  return blocked.some((b) => b.trim() && c.includes(norm(b.trim())));
}

function modeLocationFit(job: NormalizedJob, prefs: JobPrefs): number {
  if (prefs.workModes.length === 0) return 1;
  if (job.workMode === "unknown") return 0.5;
  if (!prefs.workModes.includes(job.workMode)) return 0;
  if (job.workMode === "remote") return 1;
  if (prefs.cities.length === 0) return 1;
  const loc = norm(job.location);
  return prefs.cities.some((c) => loc.includes(norm(c))) ? 1 : 0.2;
}

function salaryFit(job: NormalizedJob, floor?: number): { fit: number; below: boolean; note: string } {
  const top = job.salaryMax ?? job.salaryMin;
  if (top == null) return { fit: 0.5, below: false, note: "salário não informado, nota neutra" };
  if (floor == null) return { fit: 1, below: false, note: "sem piso definido" };
  if (top < floor) return { fit: 0, below: true, note: `salário ${top} abaixo do piso ${floor}` };
  const over = Math.min((top - floor) / floor, 0.5) / 0.5;
  return { fit: 0.7 + 0.3 * over, below: false, note: "salário atende o piso" };
}

export function scoreJob(input: ScoreInput): ScoreResult {
  const w = input.weights ?? DEFAULT_WEIGHTS;
  const { job, prefs } = input;
  const justification: string[] = [];

  if (isBlocked(job.company, prefs.blockedCompanies)) {
    return { total: 0, blocked: true, capped: false, parts: {}, justification: ["empresa na lista de bloqueio"] };
  }

  const sal = salaryFit(job, prefs.salaryFloor);
  const sectorHit = (input.companySectors ?? []).some((s) =>
    prefs.preferredSectors.some((p) => norm(p) === norm(s)),
  );

  const parts = {
    requirements: input.requirementsFit * w.requirements,
    modeLocation: modeLocationFit(job, prefs) * w.modeLocation,
    salary: sal.fit * w.salary,
    company: (sectorHit ? 1 : 0.6) * w.company,
    seniorityArea: (input.seniorityAreaFit ?? 0.5) * w.seniorityArea,
  };

  const sum = Object.values(parts).reduce((a, b) => a + b, 0);
  const weightSum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  let total = (sum / weightSum) * 100;

  if (sectorHit) {
    total = Math.min(100, total + 5);
    justification.push("bônus de setor preferido (+5)");
  }

  let capped = false;
  if (sal.below && total > 60) {
    total = 60;
    capped = true;
  }

  justification.unshift(`requisitos: ${input.requirementsReason}`, sal.note);
  return { total: Math.round(total), blocked: false, capped, parts, justification };
}
