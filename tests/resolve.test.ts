import { describe, expect, it } from "vitest";
import { pending, resolveQuestions } from "../src/lib/apply/resolve";

const qs = [
  { label: "First Name", required: true, fields: [{ name: "first_name", type: "input_text" }] },
  { label: "Pretensão salarial", required: true, fields: [{ name: "question_1", type: "input_text" }] },
  { label: "Anos de experiência com SQL", required: false, fields: [{ name: "question_2", type: "input_text" }] },
];

describe("resolveQuestions", () => {
  it("preenche o que sabe e pergunta o resto", () => {
    const r = resolveQuestions(qs, { first_name: "Tiago" }, {});
    expect(r[0].value).toBe("Tiago");
    expect(pending(r).map((f) => f.label)).toEqual(["Pretensão salarial", "Anos de experiência com SQL"]);
  });
  it("reaproveita resposta salva", () => {
    const r = resolveQuestions(qs, { first_name: "Tiago" }, { pretensao_salarial: "8000" });
    expect(pending(r)).toHaveLength(1);
  });
});
