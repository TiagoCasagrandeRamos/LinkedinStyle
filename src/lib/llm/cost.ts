/** Modelo padrão da nota de requisitos. */
export const DEFAULT_MODEL = "claude-haiku-5-5";

/**
 * Preço em USD por milhão de tokens, para prompts de até 100 mil tokens
 * (tabela oficial da Anthropic, outubro de 2026). O prompt do app fica bem abaixo disso.
 */
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

export const MAX_JOB_CHARS = 8000;
export const MAX_RESUME_CHARS = 12000;
/** Instruções fixas do prompt, em tokens. */
const OVERHEAD_TOKENS = 300;
/** Resposta curta em JSON. */
const OUTPUT_TOKENS = 160;
const CHARS_PER_TOKEN = 3.5;

export interface Usage { input: number; output: number }

export function usageCost(usage: Usage, model = DEFAULT_MODEL): number {
  const p = PRICES[model];
  if (!p) throw new Error(`Sem preço cadastrado para o modelo ${model}`);
  return (usage.input * p.input + usage.output * p.output) / 1_000_000;
}

/** Estimativa de uma avaliação, a partir do tamanho dos textos. */
export function estimateCall(jobChars: number, resumeChars: number): Usage {
  const chars = Math.min(jobChars, MAX_JOB_CHARS) + Math.min(resumeChars, MAX_RESUME_CHARS);
  return { input: Math.ceil(chars / CHARS_PER_TOKEN) + OVERHEAD_TOKENS, output: OUTPUT_TOKENS };
}

export function sumUsage(list: Usage[]): Usage {
  return list.reduce((a, b) => ({ input: a.input + b.input, output: a.output + b.output }), { input: 0, output: 0 });
}

export function formatUsd(usd: number): string {
  if (usd > 0 && usd < 0.0001) return "menos de US$ 0,0001";
  return `US$ ${usd.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

/** Estimativa de uma chamada de texto livre (exemplo de post, pilares, calibragem). */
export function estimateText(inputChars: number, outputTokens: number): Usage {
  return { input: Math.ceil(inputChars / CHARS_PER_TOKEN) + OVERHEAD_TOKENS, output: outputTokens };
}

export const MAX_RESUME_FOR_CONTENT = 12000;
export const OUT_PILLARS = 700;
export const OUT_PREVIEW = 260;
export const OUT_LEARN = 120;
export const MAX_SAMPLE_CHARS = 6000;

export const estimatePillars = (resumeChars: number, extraChars: number): Usage =>
  estimateText(Math.min(resumeChars, MAX_RESUME_FOR_CONTENT) + extraChars, OUT_PILLARS);
export const estimatePreview = (resumeChars: number, briefingChars: number): Usage =>
  estimateText(Math.min(resumeChars, MAX_RESUME_FOR_CONTENT) + briefingChars, OUT_PREVIEW);
export const estimateLearn = (sampleChars: number): Usage => estimateText(Math.min(sampleChars, MAX_SAMPLE_CHARS) + 600, OUT_LEARN);

export const OUT_DRAFT = 450;
export const estimateDraft = (resumeChars: number, briefingChars: number, topicChars: number): Usage =>
  estimateText(Math.min(resumeChars, MAX_RESUME_FOR_CONTENT) + briefingChars + Math.min(topicChars, 1000) + 400, OUT_DRAFT);
