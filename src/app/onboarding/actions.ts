"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { detectLanguage } from "@/lib/language";
import { extractResumeText, kindFromName, MAX_RESUME_BYTES } from "@/lib/resume/extract";
import { contentSchema, jobPrefsSchema } from "@/lib/onboarding-schemas";
import { encryptSecret } from "@/lib/crypto";

const back = (step: number, msg: string): never => redirect(`/onboarding?etapa=${step}&erro=${encodeURIComponent(msg)}`);

async function ctx() {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  await sb.from("ls_profiles").upsert({ user_id: user.id, email: user.email }, { onConflict: "user_id", ignoreDuplicates: true });
  return { sb, user: user! };
}

async function setStep(sb: Awaited<ReturnType<typeof ctx>>["sb"], uid: string, step: number) {
  await sb.from("ls_profiles").update({ onboarding_step: step }).eq("user_id", uid).lt("onboarding_step", step);
}

export async function enviarCurriculos(formData: FormData) {
  const { sb, user } = await ctx();
  let enviados = 0;
  for (const lang of ["pt", "en"] as const) {
    const file = formData.get(`file_${lang}`);
    if (!(file instanceof File) || file.size === 0) continue;
    if (file.size > MAX_RESUME_BYTES) back(1, `${file.name}: máximo de 5 MB`);
    const kind = kindFromName(file.name, file.type);
    if (!kind) back(1, `${file.name}: use PDF ou DOCX`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text = "";
    try { text = await extractResumeText(bytes, kind!); } catch { back(1, `${file.name}: não consegui ler o arquivo`); }
    if (text.length < 80) back(1, `${file.name}: quase sem texto. PDF escaneado não funciona por enquanto`);
    const path = `${user.id}/${randomUUID()}.${kind}`;
    const up = await sb.storage.from("resumes").upload(path, bytes, { contentType: file.type || undefined });
    if (up.error) back(1, up.error.message);
    const ins = await sb.from("ls_resumes").insert({ user_id: user.id, language: lang, file_path: path, original_name: file.name, text_content: text });
    if (ins.error) back(1, ins.error.message);
    enviados++;
  }
  if (enviados === 0) back(1, "Escolha ao menos um arquivo");
  redirect("/onboarding?etapa=1");
}

export async function confirmarCurriculo(formData: FormData) {
  const { sb, user } = await ctx();
  const id = String(formData.get("id"));
  const language = String(formData.get("language"));
  const text = String(formData.get("text") ?? "").trim();
  if (!["pt", "en"].includes(language) || text.length < 80) back(1, "Texto muito curto para validar");
  await sb.from("ls_resumes").update({ language, text_content: text, confirmed_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  redirect("/onboarding?etapa=1");
}

export async function removerCurriculo(formData: FormData) {
  const { sb, user } = await ctx();
  const id = String(formData.get("id"));
  const { data } = await sb.from("ls_resumes").select("file_path").eq("id", id).eq("user_id", user.id).single();
  if (data) await sb.storage.from("resumes").remove([data.file_path]);
  await sb.from("ls_resumes").delete().eq("id", id).eq("user_id", user.id);
  redirect("/onboarding?etapa=1");
}

export async function avancarDeCurriculos() {
  const { sb, user } = await ctx();
  const { count } = await sb.from("ls_resumes").select("id", { count: "exact", head: true }).eq("user_id", user.id).not("confirmed_at", "is", null);
  if (!count) back(1, "Valide ao menos um currículo antes de continuar");
  await setStep(sb, user.id, 2);
  redirect("/onboarding?etapa=2");
}

export async function salvarVagas(formData: FormData) {
  const { sb, user } = await ctx();
  const raw = {
    titles: String(formData.get("titles") ?? ""), seniority: String(formData.get("seniority") ?? ""),
    workModes: formData.getAll("workModes"), cities: String(formData.get("cities") ?? ""),
    currency: String(formData.get("currency") ?? "BRL").toUpperCase(), salaryPeriod: String(formData.get("salaryPeriod") ?? "month"),
    salaryFloor: String(formData.get("salaryFloor") ?? ""), salaryTarget: String(formData.get("salaryTarget") ?? ""),
    contractTypes: formData.getAll("contractTypes"), freelanceOk: formData.get("freelanceOk") === "on",
    preferredSectors: String(formData.get("preferredSectors") ?? ""), blockedCompanies: String(formData.get("blockedCompanies") ?? ""),
    blockedConfirmed: formData.get("blockedConfirmed") === "on",
    dailyJobLimit: String(formData.get("dailyJobLimit") ?? "5"), minScoreOutreach: String(formData.get("minScoreOutreach") ?? "80"),
  };
  const p = jobPrefsSchema.safeParse(raw);
  if (!p.success) back(2, p.error.issues[0].message);
  const d = p.data!;
  const { error } = await sb.from("ls_job_preferences").upsert({
    user_id: user.id, titles: d.titles, seniority: d.seniority, work_modes: d.workModes, cities: d.cities,
    currency: d.currency, salary_period: d.salaryPeriod, salary_floor: d.salaryFloor ?? null, salary_target: d.salaryTarget ?? null,
    contract_types: d.contractTypes, freelance_ok: d.freelanceOk, preferred_sectors: d.preferredSectors,
    blocked_companies: d.blockedCompanies, daily_job_limit: d.dailyJobLimit, min_score_outreach: d.minScoreOutreach,
    updated_at: new Date().toISOString(),
  });
  if (error) back(2, error.message);
  await setStep(sb, user.id, 3);
  redirect("/onboarding?etapa=3");
}

export async function salvarConteudo(formData: FormData) {
  const { sb, user } = await ctx();
  const p = contentSchema.safeParse({
    pillars: String(formData.get("pillars") ?? ""), postsPerWeek: String(formData.get("postsPerWeek") ?? "0"),
    postDays: formData.getAll("postDays"), postTime: String(formData.get("postTime") ?? "09:00"),
    timezone: String(formData.get("timezone") ?? "America/Sao_Paulo"), languages: formData.getAll("languages"),
    tone: String(formData.get("tone") ?? ""), avoid: String(formData.get("avoid") ?? ""),
  });
  if (!p.success) back(3, p.error.issues[0].message);
  const d = p.data!;
  const { error } = await sb.from("ls_content_settings").upsert({
    user_id: user.id, pillars: d.pillars, posts_per_week: d.postsPerWeek, post_days: d.postDays,
    post_time: d.postTime, timezone: d.timezone, languages: d.languages, tone: d.tone ?? null, avoid: d.avoid,
  });
  if (error) back(3, error.message);
  await setStep(sb, user.id, 4);
  redirect("/onboarding?etapa=4");
}

export async function concluir(formData: FormData) {
  const { sb, user } = await ctx();
  const key = String(formData.get("llmKey") ?? "").trim();
  if (key) {
    let enc: string;
    try { enc = encryptSecret(key); } catch { return back(4, "Servidor sem TOKEN_ENCRYPTION_KEY configurada. Veja o README."); }
    await sb.from("ls_profiles").update({ llm_key_encrypted: enc }).eq("user_id", user.id);
  }
  await sb.from("ls_profiles").update({ onboarding_step: 5, onboarding_completed_at: new Date().toISOString() }).eq("user_id", user.id);
  redirect("/painel");
}
