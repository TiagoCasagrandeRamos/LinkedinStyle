"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { fetchGreenhouseQuestions } from "@/lib/collectors/greenhouse";
import { pendingRequired, resolveQuestions, validForOptions, type ResolvedField } from "@/lib/apply/resolve";
import { pickResume } from "@/lib/resume/pick";
import type { Lang } from "@/lib/language";

const fail = (path: string, msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}erro=${encodeURIComponent(msg)}`);

export async function prepararCandidatura(formData: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const jobId = String(formData.get("jobId"));

  const { data: job } = await sb.from("ls_jobs").select("id, source, external_id, language").eq("id", jobId).eq("user_id", user.id).single();
  if (!job) return fail("/painel", "Vaga não encontrada");
  if (job.source !== "greenhouse") return fail("/painel", "Por enquanto só preparo candidaturas de vagas do Greenhouse");

  const [board, ghId] = String(job.external_id).split(":");
  let questions;
  try { questions = await fetchGreenhouseQuestions(board, ghId); }
  catch (e) { return fail("/painel", `Não consegui ler o formulário da vaga: ${(e as Error).message}`); }

  const [{ data: prof }, { data: resumes }, { data: existing }] = await Promise.all([
    sb.from("ls_profiles").select("answers").eq("user_id", user.id).single(),
    sb.from("ls_resumes").select("id, language").eq("user_id", user.id).not("confirmed_at", "is", null),
    sb.from("ls_applications").select("id").eq("user_id", user.id).eq("job_id", jobId).maybeSingle(),
  ]);
  const pick = pickResume((resumes ?? []).map((r) => ({ id: r.id, language: r.language })), (job.language ?? "en") as Lang);
  if (!pick.resume) return fail("/painel", "Valide ao menos um currículo antes de preparar candidaturas");

  const fields = resolveQuestions(questions, { email: user.email ?? "" }, (prof?.answers ?? {}) as Record<string, string>);
  const status = pendingRequired(fields).length ? "needs_input" : "ready";
  const row = { user_id: user.id, job_id: jobId, resume_id: pick.resume.id, fields, status, note: pick.note };
  const { data: app, error } = existing
    ? await sb.from("ls_applications").update(row).eq("id", existing.id).select("id").single()
    : await sb.from("ls_applications").insert(row).select("id").single();
  if (error || !app) return fail("/painel", error?.message ?? "Falha ao salvar a candidatura");
  redirect(`/candidaturas/${app.id}`);
}

export async function salvarRespostas(formData: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id"));
  const path = `/candidaturas/${id}`;
  const { data: app } = await sb.from("ls_applications").select("fields").eq("id", id).eq("user_id", user.id).single();
  if (!app) return fail("/painel", "Candidatura não encontrada");

  const { data: prof } = await sb.from("ls_profiles").select("answers").eq("user_id", user.id).single();
  const answers = { ...((prof?.answers ?? {}) as Record<string, string>) };
  const fields = (app.fields as ResolvedField[]).map((f, i) => {
    if (f.kind === "file") return f;
    const raw = f.kind === "multiselect" ? formData.getAll(`f_${i}`).map(String).join(", ") : String(formData.get(`f_${i}`) ?? "").trim();
    if (raw && f.options && !validForOptions(f.kind, raw, f.options)) return fail(path, `"${f.label}": escolha uma das opções`);
    if (raw) answers[f.answerKey] = raw; // toda resposta do usuário fica salva no perfil
    return { ...f, value: raw || undefined, needsUser: !raw };
  });
  await sb.from("ls_profiles").update({ answers }).eq("user_id", user.id);
  await sb.from("ls_applications").update({ fields, status: pendingRequired(fields).length ? "needs_input" : "ready" }).eq("id", id).eq("user_id", user.id);
  redirect(path);
}

export async function marcarEnviada(formData: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id"));
  await sb.from("ls_applications").update({ status: "sent_by_user" }).eq("id", id).eq("user_id", user.id);
  redirect(`/candidaturas/${id}`);
}
