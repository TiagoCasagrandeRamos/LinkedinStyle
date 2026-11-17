import { CONFLICTS, TRAIT_KEYS, TRAIT_LABEL, TRAIT_RULES, type TraitKey, type TraitWeights } from "./traits";

/** Traços ativos, do mais forte ao mais fraco. Empate segue a ordem fixa da lista. */
export function activeTraits(w: TraitWeights): TraitKey[] {
  return TRAIT_KEYS.filter((k) => w[k] > 0).sort((a, b) => w[b] - w[a] || TRAIT_KEYS.indexOf(a) - TRAIT_KEYS.indexOf(b));
}

/** Avisos de traços opostos, ambos altos (4 ou 5). Não bloqueia nada. */
export function conflictWarnings(w: TraitWeights): string[] {
  return CONFLICTS.filter(([a, b]) => w[a] >= 4 && w[b] >= 4).map(([a, b]) => {
    const win = w[a] === w[b] ? "o primeiro da lista" : w[a] > w[b] ? TRAIT_LABEL[a] : TRAIT_LABEL[b];
    return `${TRAIT_LABEL[a]} e ${TRAIT_LABEL[b]} puxam em direções opostas. Em conflito, vale ${w[a] === w[b] ? `${TRAIT_LABEL[a]}, por ser o primeiro` : win}. Baixe um dos dois se quiser outro resultado.`;
  });
}

/** Briefing de tom: regras concretas, em ordem de peso, nunca só adjetivos. */
export function composeBriefing(w: TraitWeights, avoid: string[]): string {
  const traits = activeTraits(w);
  const lines: string[] = [];
  if (traits.length === 0) lines.push("Escreva de forma clara e simples, sem estilo marcado.");
  else {
    lines.push("Siga estas regras de escrita, da mais importante para a menos. Se duas regras entrarem em conflito, vale a do traço de maior peso.");
    traits.forEach((k, i) => {
      const rules = w[k] >= 4 ? TRAIT_RULES[k].forte : TRAIT_RULES[k].leve;
      lines.push(`${i + 1}. ${TRAIT_LABEL[k]} (peso ${w[k]} de 5): ${rules.join(" ")}`);
    });
  }
  const av = avoid.map((a) => a.trim()).filter(Boolean);
  if (av.length) lines.push(`Evite sempre: ${av.join("; ")}.`);
  return lines.join("\n");
}
