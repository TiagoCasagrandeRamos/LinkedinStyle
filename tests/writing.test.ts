import { describe, expect, it } from "vitest";
import { activeTraits, composeBriefing, conflictWarnings } from "../src/lib/writing/briefing";
import { emptyWeights, normalizeWeights } from "../src/lib/writing/traits";
import { PALETTE, TEMPLATE_BG, assignColors, contrast, parseSuggestions } from "../src/lib/pillars";
import { parseNewsRss } from "../src/lib/news";
import { estimateText } from "../src/lib/llm/cost";

const w = (o: object) => ({ ...emptyWeights(), ...o });

describe("briefing de tom", () => {
  it("vira regra concreta, não adjetivo", () => {
    const b = composeBriefing(w({ direto: 5 }), []);
    expect(b).toContain("Frases curtas.");
    expect(b).toContain("Corta advérbio e qualificador.");
  });
  it("ignora peso zero e ordena do maior para o menor", () => {
    expect(activeTraits(w({ analitico: 2, direto: 5, didatico: 3 }))).toEqual(["direto", "didatico", "analitico"]);
    const b = composeBriefing(w({ analitico: 2, direto: 5 }), []);
    expect(b.indexOf("Direto")).toBeLessThan(b.indexOf("Analítico"));
    expect(b).not.toContain("Sarcástico");
  });
  it("peso baixo usa a versão leve", () => {
    expect(composeBriefing(w({ vulneravel: 2 }), [])).not.toContain("Não transforma o erro em vitória disfarçada");
  });
  it("sarcasmo nunca mira pessoa nem post sensível", () => {
    const b = composeBriefing(w({ sarcastico: 5 }), []);
    expect(b).toContain("nunca sobre pessoa ou empresa identificável");
    expect(b).toContain("Nunca em post sensível");
  });
  it("inclui a lista do que evitar", () => {
    expect(composeBriefing(w({}), ["emoji", "travessão"])).toContain("Evite sempre: emoji; travessão.");
  });
  it("avisa conflito só quando os dois estão altos e nunca bloqueia", () => {
    expect(conflictWarnings(w({ sarcastico: 5, amigavel: 5 }))).toHaveLength(1);
    expect(conflictWarnings(w({ sarcastico: 5, amigavel: 2 }))).toHaveLength(0);
  });
  it("normaliza pesos inválidos", () => {
    expect(normalizeWeights({ direto: 9, amigavel: -2, analitico: "x" })).toMatchObject({ direto: 5, amigavel: 0, analitico: 0 });
  });
});

describe("pilares", () => {
  it("toda cor da paleta passa de 4,5:1 sobre o fundo do template", () => {
    for (const c of PALETTE) expect(contrast(c, TEMPLATE_BG)).toBeGreaterThanOrEqual(4.5);
  });
  it("atribui uma cor diferente por pilar", () => {
    const r = assignColors([{}, {}, {}, {}]);
    expect(new Set(r.map((x) => x.color)).size).toBe(4);
  });
  it("lê sugestões e limita a 6", () => {
    const item = { name: "IA", description: "d", keywords: ["ia"], origin: "MBA" };
    expect(parseSuggestions("texto\n" + JSON.stringify(Array(8).fill(item)))).toHaveLength(6);
    expect(() => parseSuggestions("sem lista")).toThrow();
  });
});

describe("radar", () => {
  it("lê o RSS e descarta itens inválidos", () => {
    const xml = `<rss><channel><item><title>IA no varejo &amp; cinema</title><link>https://x.com/a</link><pubDate>Mon, 16 Nov 2026 10:00:00 GMT</pubDate><source url="https://x.com">Valor</source></item><item><title>sem link</title><link>nada</link><pubDate>Mon, 16 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseNewsRss(xml)).toEqual([{ title: "IA no varejo & cinema", link: "https://x.com/a", source: "Valor", date: "2026-11-16T10:00:00.000Z" }]);
  });
});

describe("custo de texto", () => {
  it("soma sobrecarga fixa", () => expect(estimateText(0, 100)).toEqual({ input: 300, output: 100 }));
});
