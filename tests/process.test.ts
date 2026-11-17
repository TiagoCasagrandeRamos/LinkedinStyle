import { describe, expect, it, vi } from "vitest";
import { processJobs, titleMatch } from "../src/lib/pipeline/process";
import { parseFit, type FitScorer } from "../src/lib/llm/requirements";
import { DEFAULT_WEIGHTS, type JobPrefs, type NormalizedJob } from "../src/lib/types";

const prefs: JobPrefs = { titles: ["project manager", "gerente de projetos"], seniority: ["pleno"], workModes: ["remote"], cities: [], salaryFloor: 7000, preferredSectors: [], blockedCompanies: ["Cinemark"], freelanceOk: true };
const PT_DESC = "Buscamos uma pessoa para atuar na gestão de projetos com experiência em metodologias ágeis. Você será responsável por conduzir as atividades da equipe e acompanhar os requisitos do cliente.";
const EN_DESC = "We are looking for a project manager with experience in agile methodologies. You will be responsible for leading the team and tracking the requirements of our clients.";
const job = (o: Partial<NormalizedJob>): NormalizedJob => ({ source: "greenhouse", externalId: "1", company: "Beta", title: "Project Manager", url: "u", location: "Remote", workMode: "remote", description: EN_DESC, dedupeKey: "k1", ...o });
const resumes = [{ id: "pt", language: "pt" as const, text: "currículo pt" }, { id: "en", language: "en" as const, text: "english resume" }];
const base = { prefs, weights: DEFAULT_WEIGHTS, resumes, knownKeys: new Set<string>() };

describe("processJobs", () => {
  it("usa o currículo do idioma da vaga", async () => {
    const scorer = vi.fn<FitScorer>(async () => ({ fit: 0.8, reason: "ok" }));
    await processJobs({ ...base, scorer, jobs: [job({}), job({ title: "Gerente de Projetos", description: PT_DESC, dedupeKey: "k2", externalId: "2" })] });
    expect(scorer.mock.calls.map((c) => c[2]).sort()).toEqual(["currículo pt", "english resume"]);
  });
  it("pula bloqueada, fora do cargo e já conhecida sem gastar LLM", async () => {
    const scorer = vi.fn<FitScorer>(async () => ({ fit: 1, reason: "ok" }));
    const r = await processJobs({
      ...base, scorer, knownKeys: new Set(["k4"]),
      jobs: [job({ company: "Cinemark", dedupeKey: "k2" }), job({ title: "Engenheiro de Dados", dedupeKey: "k3" }), job({ dedupeKey: "k4" })],
    });
    expect(scorer).not.toHaveBeenCalled();
    expect(r.skipped).toMatchObject({ blocked: 1, offTitle: 1, known: 1 });
  });
  it("respeita o teto de chamadas e ordena por nota", async () => {
    const scorer = vi.fn<FitScorer>(async (t) => ({ fit: t.includes("Senior") ? 0.2 : 0.9, reason: "r" }));
    const r = await processJobs({ ...base, scorer, maxLlmCalls: 2, jobs: [
      job({ title: "Senior Project Manager", dedupeKey: "a" }), job({ dedupeKey: "b" }), job({ title: "Project Manager II", dedupeKey: "c" }),
    ] });
    expect(scorer).toHaveBeenCalledTimes(2);
    expect(r.skipped.overLimit).toBe(1);
    expect(r.rows[0].total).toBeGreaterThanOrEqual(r.rows[1].total);
  });
  it("guarda justificativa com idioma e currículo", async () => {
    const r = await processJobs({ ...base, scorer: async () => ({ fit: 0.7, reason: "bate com 3 de 4" }), jobs: [job({})] });
    expect(r.rows[0].justification.join(" ")).toContain("idioma da vaga: en");
    expect(r.rows[0].justification.join(" ")).toContain("bate com 3 de 4");
  });
});

describe("titleMatch / parseFit", () => {
  it("casa por palavras", () => expect(titleMatch("Senior Project Manager", ["project manager"])).toBe(1));
  it("lê JSON dentro de texto", () => expect(parseFit('claro: {"fit":0.5,"reason":"ok"}').fit).toBe(0.5));
  it("rejeita fit fora da faixa", () => expect(() => parseFit('{"fit":3,"reason":"x"}')).toThrow());
});
