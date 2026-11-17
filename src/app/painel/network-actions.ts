"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { connectionsCost, estimateConnections, formatUsd } from "@/lib/llm/cost";
import { findConnections } from "@/lib/llm/generate";
import { composeBriefing } from "@/lib/writing/briefing";
import { normalizeWeights } from "@/lib/writing/traits";
import { DAILY_LIMIT } from "@/lib/network";
import { isBlocked } from "@/lib/scoring/score";


const volta = (msg: string): never => redirect(`/painel?aba=conexoes&msg=${encodeURIComponent(msg)}`);

function startOfTodayBrt(): string {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 3600 * 1000);
  brt.setUTCHours(0, 0, 0, 0);
  return new Date(brt.getTime() + 3 * 3600 * 1000).toISOString();
}

/** Busca pessoas e escreve os textos. Paga (busca na web mais tokens), então só roda com o valor autorizado. */
export async function sugerirConexoes(fd: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const approved = Number(fd.get("usd"));
  const kind = fd.get("kind") === "rede" ? "rede" : "vaga";
  const jobId = String(fd.get("jobId") ?? "");
  let company = String(fd.get("company") ?? "").trim().slice(0, 120);
  const area = String(fd.get("area") ?? "").trim().slice(0, 120) || "recrutador ou gestor da área";
  if (!Number.isFinite(approved)) volta("Autorização inválida. Tente de novo.");

  const [{ data: prof }, { data: cs }, { data: prefs }, { data: resumes }] = await Promise.all([
    sb.from("ls_profiles").select("llm_key_encrypted").eq("user_id", user.id).single(),
    sb.from("ls_content_settings").select("writing_profile, avoid, languages").eq("user_id", user.id).maybeSingle(),
    sb.from("ls_job_preferences").select("blocked_companies, min_score_outreach").eq("user_id", user.id).single(),
    sb.from("ls_resumes").select("language, text_content").eq("user_id", user.id).not("confirmed_at", "is", null),
  ]);
  if (!prof?.llm_key_encrypted) volta("Cadastre a chave da API na etapa 3 do onboarding.");

  let jobTitle: string | undefined, jobDescription: string | undefined, language: "pt" | "en" = "pt";
  let linkedJob: string | null = null;
  if (kind === "vaga") {
    const { data: job } = await sb.from("ls_jobs").select("id, company, title, description, language, score").eq("id", jobId).eq("user_id", user.id).maybeSingle();
    if (!job) volta("Escolha uma vaga da lista.");
    if ((job!.score ?? 0) < (prefs?.min_score_outreach ?? 80)) volta(`A abordagem só vale para vagas com nota ${prefs?.min_score_outreach ?? 80} ou mais.`);
    company = job!.company; jobTitle = job!.title; jobDescription = job!.description ?? ""; linkedJob = job!.id;
    language = job!.language === "en" ? "en" : "pt";
  } else if (company.length < 2) volta("Informe a empresa.");

  if (isBlocked(company, (prefs?.blocked_companies ?? []) as string[])) volta(`${company} está na sua lista de empresas bloqueadas. Não abordo ninguém de lá.`);

  const { count } = await sb.from("ls_connections").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).eq("kind", kind).gte("created_at", startOfTodayBrt());
  if ((count ?? 0) >= DAILY_LIMIT[kind]) volta(`Limite de hoje atingido: ${DAILY_LIMIT[kind]} abordagens ${kind === "vaga" ? "ligadas a vaga" : "de construção de rede"} por dia. Volte amanhã, o ritmo baixo protege a sua conta.`);

  const rs = resumes ?? [];
  const resume = (rs.find((r) => r.language === language) ?? rs[0])?.text_content as string | undefined;
  if (!resume) volta("Nenhum currículo validado.");
  const briefing = composeBriefing(normalizeWeights((cs?.writing_profile as { weights?: unknown } | null)?.weights), (cs?.avoid ?? []) as string[]);
  const est = connectionsCost(estimateConnections(resume!.length, briefing.length, (jobDescription ?? "").length));
  if (est > approved * 1.2 + 0.0001) volta("A estimativa mudou desde que você viu o valor. Confira o novo valor e autorize de novo.");

  try {
    const r = await findConnections(decryptSecret(prof!.llm_key_encrypted as string), { resume: resume!, briefing, company, area, jobTitle, jobDescription, kind, language });
    const rows = r.people.slice(0, DAILY_LIMIT[kind] - (count ?? 0)).map((p) => ({
      user_id: user.id, name: p.name, company: p.company || company, role: p.role || null, profile_url: p.profile_url,
      reason: p.why || null, invite_note: p.invite_note, followup_message: p.followup_message, kind, job_id: linkedJob, status: "para_abordar",
    }));
    if (rows.length) await sb.from("ls_connections").upsert(rows, { onConflict: "user_id,profile_url", ignoreDuplicates: true });
    const cost = `Custo real: ${formatUsd(connectionsCost(r.usage))} (${r.usage.searches} buscas na web).`;
    if (rows.length === 0) volta(`Não achei ninguém com link de perfil confirmado na busca. ${cost} Use o atalho de busca no LinkedIn abaixo.${r.dropped.length ? ` Descartados: ${r.dropped.join("; ")}.` : ""}`);
    volta(`${rows.length} pessoa(s) sugerida(s). ${cost} Confira cada perfil antes de enviar.${r.dropped.length ? ` Descartados: ${r.dropped.join("; ")}.` : ""}`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    volta(`Não busquei: ${(e as Error).message}`);
  }
}
