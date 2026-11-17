import { describe, expect, it } from "vitest";
import { contentSchema, jobPrefsSchema, parsePillars } from "../src/lib/onboarding-schemas";
import { decryptSecret, encryptSecret } from "../src/lib/crypto";

describe("onboarding", () => {
  it("exige confirmar a lista de bloqueio", () => {
    const r = jobPrefsSchema.safeParse({ titles: "PM", seniority: "", workModes: ["remote"], cities: "", salaryPeriod: "month", salaryFloor: "", salaryTarget: "", freelanceOk: false, preferredSectors: "", blockedCompanies: "", blockedConfirmed: false, dailyJobLimit: 5, minScoreOutreach: 80 });
    expect(r.success).toBe(false);
  });
  it("aceita lista de bloqueio vazia quando confirmada", () => {
    const r = jobPrefsSchema.safeParse({ titles: "PM, Gerente", seniority: "pleno", workModes: ["remote"], cities: "", salaryPeriod: "month", salaryFloor: "7000", salaryTarget: "", freelanceOk: true, preferredSectors: "tech", blockedCompanies: "", blockedConfirmed: true, dailyJobLimit: 5, minScoreOutreach: 80 });
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.titles).toEqual(["PM", "Gerente"]); expect(r.data.salaryFloor).toBe(7000); }
  });
  it("lê pilares com cor", () => {
    expect(parsePillars("IA | #2F6FB5\nCarreira")).toEqual([{ name: "IA", color: "#2F6FB5" }, { name: "Carreira", color: "#6B7280" }]);
  });
  it("valida conteúdo", () => {
    expect(contentSchema.safeParse({ pillars: JSON.stringify([{ name: "IA", color: "#6AA7E8" }]), postsPerWeek: 3, postDays: ["1", "3"], postTime: "09:00", timezone: "America/Sao_Paulo", languages: ["pt"] }).success).toBe(true);
    expect(contentSchema.safeParse({ pillars: "[]", postsPerWeek: 3, postDays: [], postTime: "09:00", timezone: "x", languages: ["pt"] }).success).toBe(true);
    expect(contentSchema.safeParse({ pillars: "{ruim", postsPerWeek: 3, postDays: [], postTime: "09:00", timezone: "x", languages: ["pt"] }).success).toBe(false);
  });
  it("criptografa e descriptografa", () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const enc = encryptSecret("sk-ant-segredo");
    expect(enc).not.toContain("segredo");
    expect(decryptSecret(enc)).toBe("sk-ant-segredo");
  });
});
