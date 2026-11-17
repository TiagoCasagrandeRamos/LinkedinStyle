import { describe, expect, it } from "vitest";
import { pending, pendingRequired, resolveQuestions } from "../src/lib/apply/resolve";
import type { GhQuestion } from "../src/lib/collectors/greenhouse";

const qs: GhQuestion[] = [
  { label: "First Name", required: true, fields: [{ name: "first_name", type: "input_text" }] },
  { label: "Email", required: true, fields: [{ name: "email", type: "input_text" }] },
  { label: "Resume/CV", required: true, fields: [{ name: "resume", type: "input_file" }] },
  { label: "Pretensão salarial", required: true, fields: [{ name: "question_1", type: "input_text" }] },
  { label: "Anos de experiência com SQL", required: false, fields: [{ name: "question_2", type: "input_text" }] },
  { label: "Regime", required: true, fields: [{ name: "question_3", type: "multi_value_single_select", values: [{ label: "CLT", value: 1 }, { label: "PJ", value: 2 }] }] },
  { label: "Token", required: false, fields: [{ name: "x", type: "input_hidden" }] },
];

describe("resolveQuestions", () => {
  it("usa fatos conhecidos e pergunta o resto", () => {
    const r = resolveQuestions(qs, { email: "a@b.com" }, {});
    expect(r.find((f) => f.fieldName === "email")?.value).toBe("a@b.com");
    expect(pending(r).map((f) => f.label)).toEqual(["First Name", "Pretensão salarial", "Anos de experiência com SQL", "Regime"]);
  });
  it("nunca chuta: nome desconhecido vira pergunta", () => {
    const r = resolveQuestions(qs, { email: "a@b.com" }, {});
    expect(r.find((f) => f.fieldName === "first_name")?.needsUser).toBe(true);
  });
  it("reaproveita resposta salva", () => {
    const r = resolveQuestions(qs, { email: "a@b.com" }, { first_name: "Tiago", pretensao_salarial: "8000" });
    expect(pendingRequired(r).map((f) => f.label)).toEqual(["Regime"]);
  });
  it("resposta salva fora das opções da vaga não é usada", () => {
    const r = resolveQuestions(qs, {}, { regime: "Estatutário" });
    expect(r.find((f) => f.fieldName === "question_3")?.needsUser).toBe(true);
    const ok = resolveQuestions(qs, {}, { regime: "pj" });
    expect(ok.find((f) => f.fieldName === "question_3")?.value).toBe("pj");
  });
  it("arquivo não vira pergunta e campo oculto some", () => {
    const r = resolveQuestions(qs, {}, {});
    expect(r.find((f) => f.fieldName === "resume")).toMatchObject({ kind: "file", fileRole: "resume", needsUser: false });
    expect(r.find((f) => f.fieldName === "x")).toBeUndefined();
  });
});
