import { describe, expect, it } from "vitest";
import { collectGreenhouse, fetchGreenhouseQuestions } from "../src/lib/collectors/greenhouse";
import { dedupe } from "../src/lib/normalize";

const fakeFetch = (body: unknown, ok = true) =>
  (async () => ({ ok, status: ok ? 200 : 404, json: async () => body })) as unknown as typeof fetch;

describe("greenhouse", () => {
  it("normaliza vagas e detecta modalidade", async () => {
    const jobs = await collectGreenhouse("acme", "Acme", fakeFetch({
      jobs: [{ id: 1, title: "PM", absolute_url: "https://x/1", location: { name: "São Paulo (Híbrido)" }, content: "&lt;p&gt;Ótima vaga&lt;/p&gt;" }],
    }));
    expect(jobs[0].workMode).toBe("hybrid");
    expect(jobs[0].description).toBe("Ótima vaga");
  });
  it("deduplica", async () => {
    const one = { id: 1, title: "PM", absolute_url: "u", location: { name: "SP" } };
    const jobs = await collectGreenhouse("a", "A", fakeFetch({ jobs: [one, { ...one, id: 2 }] }));
    expect(dedupe(jobs)).toHaveLength(1);
  });
  it("lê o array questions", async () => {
    const q = await fetchGreenhouseQuestions("a", "1", fakeFetch({ questions: [{ label: "Pretensão", required: true, fields: [{ name: "q_1", type: "input_text" }] }] }));
    expect(q[0].label).toBe("Pretensão");
  });
  it("erro de HTTP vira exceção", async () => {
    await expect(collectGreenhouse("a", "A", fakeFetch({}, false))).rejects.toThrow("HTTP 404");
  });
});
