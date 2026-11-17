export const TRAIT_KEYS = ["direto", "amigavel", "extrovertido", "sarcastico", "analitico", "provocativo", "didatico", "vulneravel"] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];
export type TraitWeights = Record<TraitKey, number>;

export const TRAIT_LABEL: Record<TraitKey, string> = {
  direto: "Direto", amigavel: "Amigável", extrovertido: "Extrovertido", sarcastico: "Sarcástico",
  analitico: "Analítico", provocativo: "Provocativo", didatico: "Didático", vulneravel: "Vulnerável",
};

/** Regras concretas de escrita. "forte" vale para peso 4 e 5, "leve" para 1 a 3. */
export const TRAIT_RULES: Record<TraitKey, { forte: string[]; leve: string[] }> = {
  direto: {
    forte: ["Frases curtas.", "Uma ideia por parágrafo.", "Sem rodeio antes do ponto.", "Corta advérbio e qualificador."],
    leve: ["Prefere frases curtas e vai ao ponto logo no começo."],
  },
  amigavel: {
    forte: ["Fala com o leitor, não para ele.", "Admite dificuldade.", "Evita tom de autoridade."],
    leve: ["Trata o leitor por você e evita tom de autoridade."],
  },
  extrovertido: {
    forte: ["Energia alta.", "Exclamação ocasional, no máximo uma por post.", "Ritmo variado entre frase curta e longa.", "Abertura que chama atenção."],
    leve: ["Ritmo variado e uma abertura que chama atenção."],
  },
  sarcastico: {
    forte: ["Ironia só sobre situação e sobre si mesmo, nunca sobre pessoa ou empresa identificável.", "Nunca em post sensível.", "No máximo uma tirada irônica por post."],
    leve: ["Pode usar uma ironia leve sobre a situação ou sobre si mesmo, nunca sobre pessoa ou empresa identificável, e nunca em post sensível."],
  },
  analitico: {
    forte: ["Puxa número.", "Compara antes e depois.", "Cita a fonte do dado.", "Só afirma o que o dado sustenta."],
    leve: ["Usa um número ou uma comparação quando houver, com a fonte."],
  },
  provocativo: {
    forte: ["Toma posição explícita logo no começo.", "Nomeia a opinião contrária e responde a ela."],
    leve: ["Toma posição clara e reconhece a opinião contrária."],
  },
  didatico: {
    forte: ["Explica o termo técnico na primeira vez que usa.", "Dá um exemplo concreto para cada conceito.", "Organiza em passos quando for processo."],
    leve: ["Explica o termo técnico na primeira vez e dá um exemplo."],
  },
  vulneravel: {
    forte: ["Conta o que deu errado e o que aprendeu, com caso real.", "Não transforma o erro em vitória disfarçada."],
    leve: ["Quando fizer sentido, admite um erro real e o que aprendeu."],
  },
};

/** Pares que puxam em direções opostas. Só avisa, nunca bloqueia. */
export const CONFLICTS: [TraitKey, TraitKey][] = [
  ["sarcastico", "amigavel"], ["provocativo", "amigavel"], ["direto", "didatico"], ["extrovertido", "vulneravel"], ["sarcastico", "vulneravel"],
];

export const DEFAULT_AVOID = [
  "palavrão", "emoji", "travessão", "clichê de LinkedIn", "jargão corporativo", "autoelogio", "promessa sem dado", "frase de efeito sem conteúdo",
];

export const emptyWeights = (): TraitWeights => Object.fromEntries(TRAIT_KEYS.map((k) => [k, 0])) as TraitWeights;

export function normalizeWeights(raw: unknown): TraitWeights {
  const out = emptyWeights();
  if (raw && typeof raw === "object") {
    for (const k of TRAIT_KEYS) {
      const v = Number((raw as Record<string, unknown>)[k]);
      out[k] = Number.isFinite(v) ? Math.min(5, Math.max(0, Math.round(v))) : 0;
    }
  }
  return out;
}
