import { describe, expect, it } from "vitest";
import { scoreJob } from "../src/lib/scoring/score";
import type { JobPrefs, NormalizedJob } from "../src/lib/types";

const prefs: JobPrefs = {
  titles: ["project manager"], seniority: ["pleno"], workModes: ["remote", "hybrid"],
  cities: ["São Paulo"], salaryFloor: 7000, preferredSectors: ["tech"],
  blockedCompanies: ["Acme Corp"], freelanceOk: true,
};
const job = (o: Partial<NormalizedJob> = {}): NormalizedJob => ({
  source: "greenhouse", externalId: "x:1", company: "Beta", title: "PM", url: "u",
  location: "Remote", workMode: "remote", description: "", dedupeKey: "k", ...o,
});

describe("scoreJob", () => {
  it("zera empresa bloqueada", () => {
    const r = scoreJob({ job: job({ company: "ACME corp inc" }), prefs, requirementsFit: 1, requirementsReason: "ok" });
    expect(r.blocked).toBe(true);
    expect(r.total).toBe(0);
  });
  it("limita a 60 quando salário abaixo do piso", () => {
    const r = scoreJob({ job: job({ salaryMax: 5000 }), prefs, requirementsFit: 1, requirementsReason: "ok", seniorityAreaFit: 1, companySectors: ["tech"] });
    expect(r.capped).toBe(true);
    expect(r.total).toBe(60);
  });
  it("guarda justificativa", () => {
    const r = scoreJob({ job: job({ salaryMax: 9000 }), prefs, requirementsFit: 0.8, requirementsReason: "bate com 4 de 5 requisitos" });
    expect(r.justification.join(" ")).toContain("bate com 4 de 5");
  });
  it("aplica bônus de setor", () => {
    const base = scoreJob({ job: job({ salaryMax: 9000 }), prefs, requirementsFit: 0.5, requirementsReason: "x" });
    const bonus = scoreJob({ job: job({ salaryMax: 9000 }), prefs, requirementsFit: 0.5, requirementsReason: "x", companySectors: ["tech"] });
    expect(bonus.total).toBeGreaterThan(base.total);
  });
});
