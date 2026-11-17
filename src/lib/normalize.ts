import type { NormalizedJob, WorkMode } from "./types";

export function stripHtml(html: string): string {
  return html
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectWorkMode(location: string, description: string): WorkMode {
  const t = `${location} ${description}`.toLowerCase();
  if (/h[ií]brid|hybrid/.test(t)) return "hybrid";
  if (/remot[oe]|home office|anywhere|work from home/.test(t)) return "remote";
  if (/presencial|on-?site|in[- ]office/.test(t)) return "onsite";
  return "unknown";
}

function slug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function dedupeKey(company: string, title: string, location: string): string {
  return `${slug(company)}|${slug(title)}|${slug(location)}`;
}

export function dedupe(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Map<string, NormalizedJob>();
  for (const j of jobs) if (!seen.has(j.dedupeKey)) seen.set(j.dedupeKey, j);
  return [...seen.values()];
}
