import { describe, expect, it, vi } from "vitest";
import { estimateCall, formatUsd, sumUsage, usageCost } from "../src/lib/llm/cost";
import { scoreCandidates, selectCandidates } from "../src/lib/pipeline/process";
import type { FitScorer } from "../src/lib/llm/requirements";
import { DEFAULT_WEIGHTS, type JobPrefs, type NormalizedJob } from "../src/lib/types";

const prefs: JobPrefs = { titles: ["project manager"], seniority: [], workModes: [], cities: [], preferredSectors: [], blockedCompanies: ["Cinemark"], freelanceOk: true };
const EN = "We are looking for a project manager with experience in agile methodologies. You will be responsible for leading the team and tracking the requirements of our clients.";
const job = (o: Partial<NormalizedJob>): NormalizedJob => ({ source: "greenhouse", externalId: "1", company: "Beta", title: "Project Manager", url: "u", location: "Remote", workMode: "remote", description: EN, dedupeKey: "k1", ...o });

describe("custo", () => {
  it("calcula pelo preço do Haiku 5.5 (US$ 0,10 e 0,50 por milhão)", () => {
    expect(usageCost({ input: 1_000_000, output: 1_000_000 })).toBeCloseTo(0.6, 6);
    expect(usageCost({ input: 6000, output: 160 })).toBeCloseTo(0.00068, 6);
  });
  it("limita o texto da vaga e do currículo na estimativa", () => {
    expect(estimateCall(100000, 100000)).toEqual(estimateCall(8000, 12000));
  });
  it("soma uso e formata valores minúsculos", () => {
    expect(sumUsage([{ input: 1, output: 2 }, { input: 3, output: 4 }])).toEqual({ input: 4, output: 6 });
    expect(formatUsd(0.00068)).toBe("US$ 0,0007");
    expect(formatUsd(0.00001)).toBe("menos de US$ 0,0001");
  });
});

describe("fases", () => {
  it("a seleção não chama o LLM e filtra bloqueadas, conhecidas e fora do cargo", () => {
    const r = selectCandidates(
      [job({}), job({ company: "Cinemark", dedupeKey: "k2" }), job({ title: "Dentista", dedupeKey: "k3" }), job({ dedupeKey: "k4" })],
      prefs, new Set(["k4"]),
    );
    expect(r.candidates).toHaveLength(1);
    expect(r.skipped).toEqual({ known: 1, blocked: 1, offTitle: 1 });
  });
  it("soma o uso real informado pelo modelo", async () => {
    const scorer: FitScorer = vi.fn(async () => ({ fit: 0.5, reason: "r", usage: { input: 1000, output: 100 } }));
    const { candidates } = selectCandidates([job({}), job({ dedupeKey: "k2" , title: "Project Manager II" })], prefs, new Set());
    const r = await scoreCandidates({ candidates, prefs, weights: DEFAULT_WEIGHTS, resumes: [{ id: "en", language: "en", text: "resume" }], scorer });
    expect(r.usage).toEqual({ input: 2000, output: 200 });
    expect(scorer).toHaveBeenCalledTimes(2);
  });
  it("respeita o número de avaliações autorizado", async () => {
    const scorer: FitScorer = vi.fn(async () => ({ fit: 0.5, reason: "r" }));
    const { candidates } = selectCandidates([job({}), job({ dedupeKey: "k2", title: "Project Manager II" }), job({ dedupeKey: "k3", title: "Project Manager III" })], prefs, new Set());
    const r = await scoreCandidates({ candidates, prefs, weights: DEFAULT_WEIGHTS, resumes: [{ id: "en", language: "en", text: "resume" }], scorer, maxLlmCalls: 2 });
    expect(scorer).toHaveBeenCalledTimes(2);
    expect(r.overLimit).toBe(1);
  });
});
