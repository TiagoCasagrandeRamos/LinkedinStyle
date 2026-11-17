export type Lang = "pt" | "en";

export interface LangResult {
  lang: Lang;
  /** 0 a 1. Abaixo de 0.6, vale confirmar com o LLM ou perguntar ao usuário. */
  confidence: number;
}

const PT = new Set(["de","da","do","das","dos","para","com","uma","um","em","os","as","que","não","nao","você","voce","vaga","experiência","experiencia","requisitos","conhecimento","atividades","equipe","empresa","trabalho","será","sera","ter","ou","ao","na","no","nas","nos","por","mais","como","são","sao","anos","desejável","desejavel","benefícios","beneficios","responsabilidades","área","area","nível","nivel","formação","formacao","cargo","atuação","atuacao","gestão","gestao"]);
const EN = new Set(["the","and","of","to","in","for","with","you","your","we","our","will","are","is","be","a","an","on","as","or","experience","requirements","team","role","work","skills","ability","strong","years","responsibilities","benefits","about","who","what","have","has","this","that","from","by","at","including","management","education","summary"]);

/** Heurística por stopwords. Sem dependências, roda em qualquer runtime. */
export function detectLanguage(text: string): LangResult {
  const lower = text.toLowerCase().normalize("NFC");
  const words = lower.match(/[a-zà-ú]+/g) ?? [];
  if (words.length < 8) return { lang: "en", confidence: 0 };
  let pt = 0, en = 0;
  for (const w of words) {
    if (PT.has(w)) pt++;
    if (EN.has(w)) en++;
  }
  const accents = (lower.match(/[ãõç]/g) ?? []).length;
  pt += Math.min(5, accents / 3);
  const total = pt + en;
  if (total === 0) return { lang: "en", confidence: 0 };
  const lang: Lang = pt > en ? "pt" : "en";
  const share = Math.max(pt, en) / total;
  const coverage = Math.min(1, total / (words.length * 0.15));
  return { lang, confidence: Math.round(share * coverage * 100) / 100 };
}

export function detectJobLanguage(title: string, description: string): LangResult {
  return detectLanguage(`${title}. ${description}`);
}
