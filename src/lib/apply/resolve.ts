import type { GhQuestion } from "../collectors/greenhouse";

/** Respostas salvas no perfil, por chave canônica (ex.: "salary_expectation"). */
export type SavedAnswers = Record<string, string>;

export interface ResolvedField {
  label: string;
  required: boolean;
  fieldName: string;
  value?: string;
  /** Quando true, o app NÃO chuta: vira pergunta ao usuário. */
  needsUser: boolean;
  answerKey: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Campos padrão do Greenhouse que vêm direto do cadastro. */
const KNOWN: Record<string, string> = {
  first_name: "first_name",
  last_name: "last_name",
  email: "email",
  phone: "phone",
  resume: "resume",
};

export function answerKeyFor(label: string): string {
  return norm(label).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80);
}

/**
 * Monta a candidatura a partir do perfil. Regra rígida: sem resposta salva
 * e sem campo conhecido, o campo vira pergunta ao usuário. Nunca chuta.
 */
export function resolveQuestions(
  questions: GhQuestion[],
  profile: Record<string, string>,
  saved: SavedAnswers,
): ResolvedField[] {
  const out: ResolvedField[] = [];
  for (const q of questions) {
    for (const f of q.fields) {
      const answerKey = KNOWN[f.name] ?? answerKeyFor(q.label);
      const value = profile[answerKey] ?? saved[answerKey];
      out.push({
        label: q.label,
        required: q.required,
        fieldName: f.name,
        value: value || undefined,
        needsUser: !value,
        answerKey,
      });
    }
  }
  return out;
}

export const pending = (fields: ResolvedField[]) => fields.filter((f) => f.needsUser);
