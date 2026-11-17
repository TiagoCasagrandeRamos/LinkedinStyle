export type WorkMode = "remote" | "hybrid" | "onsite" | "unknown";

export interface NormalizedJob {
  source: "greenhouse" | "lever" | "ashby" | "workable" | "gupy" | "feed" | "linkedin_link";
  externalId: string;
  company: string;
  title: string;
  url: string;
  location: string;
  workMode: WorkMode;
  description: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  postedAt?: string;
  dedupeKey: string;
}

export interface JobPrefs {
  titles: string[];
  seniority: string[];
  workModes: WorkMode[];
  cities: string[];
  salaryFloor?: number;
  preferredSectors: string[];
  blockedCompanies: string[];
  freelanceOk: boolean;
}

export interface Weights {
  requirements: number;
  modeLocation: number;
  salary: number;
  company: number;
  seniorityArea: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  requirements: 30,
  modeLocation: 20,
  salary: 20,
  company: 15,
  seniorityArea: 15,
};
