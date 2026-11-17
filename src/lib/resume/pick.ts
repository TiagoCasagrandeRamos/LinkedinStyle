import type { Lang } from "../language";

export interface ResumeRef {
  id: string;
  language: Lang | "es";
}

export interface PickResult {
  resume: ResumeRef | null;
  /** true quando o idioma do currículo difere do da vaga: o app avisa o usuário. */
  languageMismatch: boolean;
  note: string;
}

/**
 * Escolhe o currículo no idioma da vaga. Só considera currículos já validados
 * pelo usuário (quem chama filtra por confirmed_at). Com um idioma só, usa o
 * que existe e avisa, sem bloquear.
 */
export function pickResume(resumes: ResumeRef[], jobLang: Lang): PickResult {
  if (resumes.length === 0) {
    return { resume: null, languageMismatch: false, note: "nenhum currículo validado" };
  }
  const exact = resumes.find((r) => r.language === jobLang);
  if (exact) return { resume: exact, languageMismatch: false, note: `currículo em ${jobLang}` };
  const fallback = resumes.find((r) => r.language === "en") ?? resumes[0];
  return {
    resume: fallback,
    languageMismatch: true,
    note: `vaga em ${jobLang}, mas só há currículo em ${fallback.language}. Suba uma versão em ${jobLang} para melhorar a candidatura.`,
  };
}
