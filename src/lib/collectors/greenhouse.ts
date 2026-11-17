import { dedupeKey, detectWorkMode, stripHtml } from "../normalize";
import type { NormalizedJob } from "../types";

const BASE = "https://boards-api.greenhouse.io/v1/boards";

interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  location?: { name?: string };
  content?: string;
}

export function mapGreenhouseJob(board: string, company: string, j: GhJob): NormalizedJob {
  const location = j.location?.name ?? "";
  const description = stripHtml(j.content ?? "");
  return {
    source: "greenhouse",
    externalId: `${board}:${j.id}`,
    company,
    title: j.title,
    url: j.absolute_url,
    location,
    workMode: detectWorkMode(location, description),
    description,
    postedAt: j.updated_at,
    dedupeKey: dedupeKey(company, j.title, location),
  };
}

export async function collectGreenhouse(
  board: string,
  company = board,
  fetchFn: typeof fetch = fetch,
): Promise<NormalizedJob[]> {
  const res = await fetchFn(`${BASE}/${encodeURIComponent(board)}/jobs?content=true`);
  if (!res.ok) throw new Error(`Greenhouse ${board}: HTTP ${res.status}`);
  const data = (await res.json()) as { jobs: GhJob[] };
  return data.jobs.map((j) => mapGreenhouseJob(board, company, j));
}

export interface GhQuestionField {
  name: string;
  type: string;
  values?: { label: string; value: number | string }[];
}
export interface GhQuestion {
  label: string;
  required: boolean;
  description?: string | null;
  fields: GhQuestionField[];
}

/** Puxa o formulário da vaga: o array "questions" da Job Board API. */
export async function fetchGreenhouseQuestions(
  board: string,
  jobId: string,
  fetchFn: typeof fetch = fetch,
): Promise<GhQuestion[]> {
  const res = await fetchFn(`${BASE}/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}?questions=true`);
  if (!res.ok) throw new Error(`Greenhouse ${board}/${jobId}: HTTP ${res.status}`);
  const data = (await res.json()) as { questions?: GhQuestion[] };
  return data.questions ?? [];
}
