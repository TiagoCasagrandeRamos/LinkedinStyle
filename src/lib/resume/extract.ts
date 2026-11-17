import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export type ResumeKind = "pdf" | "docx";
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export function kindFromName(name: string, mime: string): ResumeKind | null {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (n.endsWith(".docx") || mime.includes("wordprocessingml")) return "docx";
  return null;
}

export async function extractResumeText(buf: Uint8Array, kind: ResumeKind): Promise<string> {
  if (kind === "pdf") {
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    return text.trim();
  }
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
  return value.trim();
}
