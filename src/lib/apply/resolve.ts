import type { GhQuestion } from "../collectors/greenhouse";

/** Respostas salvas no perfil, por chave canônica (ex.: "pretensao_salarial"). */
export type SavedAnswers = Record<string, string>;

export type FieldKind = "text" | "textarea" | "select" | "multiselect" | "file";

export interface ResolvedField {
  label: string;
  required: boolean;
  fieldName: string;
  kind: FieldKind;
  options?: string[];
  value?: string;
  /** Quando true, o app NÃO chuta: vira pergunta ao usuário. */
  needsUser: boolean;
  answerKey: string;
  /** Para campos de arquivo: o app anexa o currículo; o resto fica com o usuário. */
  fileRole?: "resume" | "cover_letter" | "other";
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Campos padrão do Greenhouse, com chave fixa. */
const KNOWN: Record<string, string> = {
  first_name: "first_name",
  last_name: "last_name",
  email: "email",
  phone: "phone",
};

export function answerKeyFor(label: string): string {
  return norm(label).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80);
}

function kindOf(type: string): FieldKind | null {
  switch (type) {
    case "input_text": return "text";
    case "textarea": return "textarea";
    case "multi_value_single_select": return "select";
    case "multi_value_multi_select": return "multiselect";
    case "input_file": return "file";
    default: return null; // input_hidden e desconhecidos não viram campo
  }
}

/** Resposta salva só vale em campo de seleção se for uma das opções da vaga. */
export function validForOptions(kind: FieldKind, value: string, options: string[]): boolean {
  if (kind === "select") return options.some((o) => norm(o) === norm(value));
  if (kind === "multiselect") {
    const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
    return parts.length > 0 && parts.every((p) => options.some((o) => norm(o) === norm(p)));
  }
  return true;
}

/**
 * Monta a candidatura a partir do que o app SABE (fatos, como o e-mail da conta)
 * e das respostas salvas. Regra rígida: sem valor seguro, o campo vira pergunta
 * ao usuário. Nunca chuta.
 */
export function resolveQuestions(
  questions: GhQuestion[],
  facts: Record<string, string>,
  saved: SavedAnswers,
): ResolvedField[] {
  const out: ResolvedField[] = [];
  for (const q of questions) {
    for (const f of q.fields) {
      const kind = kindOf(f.type);
      if (!kind) continue;
      if (kind === "file") {
        const fileRole = f.name === "resume" ? "resume" : f.name === "cover_letter" ? "cover_letter" : "other";
        out.push({ label: q.label, required: q.required, fieldName: f.name, kind, needsUser: false, answerKey: f.name, fileRole });
        continue;
      }
      const base = KNOWN[f.name] ?? answerKeyFor(q.label);
      const answerKey = q.fields.length > 1 && !KNOWN[f.name] ? `${base}__${f.name}` : base;
      const options = f.values?.map((v) => v.label);
      const candidate = facts[answerKey] ?? saved[answerKey];
      const value = candidate && (!options || validForOptions(kind, candidate, options)) ? candidate : undefined;
      out.push({ label: q.label, required: q.required, fieldName: f.name, kind, options, value, needsUser: !value, answerKey });
    }
  }
  return out;
}

export const pending = (fields: ResolvedField[]) => fields.filter((f) => f.needsUser);
export const pendingRequired = (fields: ResolvedField[]) => fields.filter((f) => f.needsUser && f.required);
