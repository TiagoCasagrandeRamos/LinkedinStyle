import { describe, expect, it } from "vitest";
import { buildTopics, matchKeyword, rankScore, reasonText, similarity } from "../src/lib/topics";
import { STEPS, buildArtSvg, canGenerateText, nextStep, prevStep, scanAvoid, sentences, splitAtCut, wrapLines } from "../src/lib/posts";
import { dayKey, nextSlots, zonedToUtc } from "../src/lib/schedule";

const now = new Date("2026-11-17T12:00:00Z");
const base = { title: "IA generativa muda o atendimento ao cliente", keyword: "ia", matched: true, source_name: "Valor", source_date: "2026-11-17T08:00:00Z" };

describe("agenda no fuso da pessoa", () => {
  it("09:00 em São Paulo é 12:00 UTC", () => expect(zonedToUtc(2026, 10, 18, 9, 0).toISOString()).toBe("2026-11-18T12:00:00.000Z"));
  it("pula dias que já têm post", () => {
    const from = new Date("2026-11-17T12:00:00Z");
    const free = nextSlots([1, 3, 5], "09:00", 2, from, "America/Sao_Paulo", new Set(["2026-11-18"]));
    expect(free.map((d) => dayKey(d))).toEqual(["2026-11-20", "2026-11-23"]);
  });
  it("não devolve horário que já passou", () => {
    const s = nextSlots([2], "09:00", 1, new Date("2026-11-17T13:00:00Z"));
    expect(dayKey(s[0])).toBe("2026-11-24");
  });
});

describe("radar", () => {
  it("acha a palavra-chave que bateu e explica", () => {
    expect(matchKeyword("Atendimento com IA cresce", ["crm", "ia"])).toBe("ia");
    expect(reasonText({ keyword: "ia", matched: true }, "IA")).toContain('"ia"');
  });
  it("descartar com motivo muda o ranking", () => {
    const sem = rankScore(base, [], [], now);
    expect(rankScore(base, [{ reason: "fonte_fraca", keyword: null, source_name: "Valor", title: "x" }], [], now)).toBeLessThan(sem);
    expect(rankScore(base, [{ reason: "fora_do_tema", keyword: "ia", source_name: null, title: "x" }], [], now)).toBeLessThan(sem);
    expect(rankScore(base, [{ reason: "ja_falei", keyword: null, source_name: null, title: "IA generativa muda atendimento cliente" }], [], now)).toBeLessThan(sem);
    expect(rankScore(base, [{ reason: "fonte_fraca", keyword: null, source_name: "Outra", title: "x" }], [], now)).toBe(sem);
  });
  it("não repete tema já publicado e junta títulos quase iguais", () => {
    expect(rankScore(base, [], ["IA generativa muda o atendimento ao cliente"], now)).toBeLessThan(rankScore(base, [], [], now));
    const t = buildTopics([{ name: "IA", color: "#6AA7E8", keywords: ["ia"] }], { IA: [
      { title: "IA muda o atendimento ao cliente", link: "https://a/1", source: "A", date: "2026-11-17T08:00:00Z" },
      { title: "IA muda o atendimento ao cliente hoje", link: "https://a/2", source: "B", date: "2026-11-17T09:00:00Z" },
    ] }, [], [], now);
    expect(t).toHaveLength(1);
    expect(similarity("a b c d", "x y z w")).toBe(0);
  });
});

describe("máquina de estados do post", () => {
  it("vai e volta um passo", () => {
    expect(STEPS).toEqual(["rascunho", "roteiro", "texto", "arte", "agendado", "publicado"]);
    expect(nextStep("roteiro")).toBe("texto");
    expect(prevStep("rascunho")).toBeNull();
    expect(prevStep("texto")).toBe("roteiro");
  });
  it("só libera o texto com roteiro válido e aprovado", () => {
    const s = { hook: "Gancho de teste", beats: ["um beat", "dois beats", "três beats"], closing: "E você, o que acha?", resume_data: [] };
    expect(canGenerateText(s, true)).toBe(true);
    expect(canGenerateText(s, false)).toBe(false);
    expect(canGenerateText({ ...s, beats: ["só um"] }, true)).toBe(false);
  });
});

describe("validação do texto", () => {
  it("marca travessão, emoji e clichê sem corrigir", () => {
    const text = "Hoje — tenho o prazer de contar 😀 uma ideia.";
    const r = scanAvoid(text, ["travessão", "emoji", "clichê de LinkedIn"]);
    expect(r.hits.map((h) => h.term)).toEqual(["travessão", "clichê de LinkedIn", "emoji"]);
    expect(r.hits[0].text).toBe("—");
  });
  it("termo do usuário vira busca literal e frase de efeito avisa que não dá para checar", () => {
    const r = scanAvoid("Vamos de Sinergia total", ["sinergia", "frase de efeito sem conteúdo"]);
    expect(r.hits).toHaveLength(1);
    expect(r.unverifiable).toEqual(["frase de efeito sem conteúdo"]);
  });
  it("marca onde o celular corta", () => {
    const { above, below } = splitAtCut("a".repeat(200));
    expect(above).toHaveLength(140);
    expect(below).toHaveLength(60);
  });
});

describe("arte", () => {
  it("usa a cor do pilar e a fonte no rodapé", () => {
    const svg = buildArtSvg({ phrase: "IA não substitui o atendimento, ela muda o ritmo", pillar: "IA", color: "#6AA7E8", sourceName: "Valor", sourceDate: "2026-11-16T10:00:00Z" });
    expect(svg).toContain("#6AA7E8");
    expect(svg).toContain("Fonte: Valor, 16/11/2026");
    expect(svg).toContain('width="1080" height="1350"');
  });
  it("sem fonte, sem rodapé", () => expect(buildArtSvg({ phrase: "Frase", pillar: "IA", color: "#6AA7E8" })).not.toContain("Fonte:"));
  it("quebra linhas e escolhe frases", () => {
    expect(wrapLines("uma duas três quatro cinco seis", 10, 2)).toHaveLength(2);
    expect(sentences("Curta. Esta é uma frase boa para a arte. Outra frase boa também!")).toHaveLength(2);
  });
});

import { clipScript, scriptSchema } from "../src/lib/posts";
describe("roteiro longo", () => {
  it("corta em vez de recusar", () => {
    const longo = "palavra ".repeat(80);
    const r = clipScript({ hook: longo, beats: [longo, "dois", longo, "quatro beat", "cinco beat", "seis beat"], closing: longo, resume_data: [] });
    expect(r.beats).toHaveLength(5);
    expect(scriptSchema.safeParse(r).success).toBe(true);
  });
});
