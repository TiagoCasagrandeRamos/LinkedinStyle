import { describe, expect, it } from "vitest";
import { detectJobLanguage, detectLanguage } from "../src/lib/language";
import { pickResume } from "../src/lib/resume/pick";

const PT = "Buscamos uma pessoa para atuar na gestão de projetos com experiência em metodologias ágeis. Você será responsável por conduzir as atividades da equipe e acompanhar os requisitos do cliente. Conhecimento em CRM é desejável.";
const EN = "We are looking for a project manager with experience in agile methodologies. You will be responsible for leading the team and tracking the requirements of our clients. Strong knowledge of CRM is a plus.";

describe("detectLanguage", () => {
  it("reconhece português", () => expect(detectLanguage(PT).lang).toBe("pt"));
  it("reconhece inglês", () => expect(detectLanguage(EN).lang).toBe("en"));
  it("confiança zero em texto curto", () => expect(detectLanguage("PM").confidence).toBe(0));
  it("usa título e descrição juntos", () => expect(detectJobLanguage("Gerente de Projetos", PT).lang).toBe("pt"));
});

describe("pickResume", () => {
  const both = [{ id: "a", language: "pt" as const }, { id: "b", language: "en" as const }];
  it("escolhe o idioma da vaga", () => {
    expect(pickResume(both, "en").resume?.id).toBe("b");
    expect(pickResume(both, "pt").resume?.id).toBe("a");
  });
  it("com um idioma só, usa e avisa", () => {
    const r = pickResume([{ id: "a", language: "pt" }], "en");
    expect(r.resume?.id).toBe("a");
    expect(r.languageMismatch).toBe(true);
  });
  it("sem currículo, devolve null", () => expect(pickResume([], "pt").resume).toBeNull());
});
