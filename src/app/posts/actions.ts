"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { estimateScript, estimateTextGen, formatUsd, usageCost, type Usage } from "@/lib/llm/cost";
import { generatePostText, generateScript, type PostContext } from "@/lib/llm/generate";
import { composeBriefing } from "@/lib/writing/briefing";
import { normalizeWeights } from "@/lib/writing/traits";
import { canGenerateText, POST_MAX, prevStep, scriptProblem, scriptSchema, type Step } from "@/lib/posts";
import { zonedToUtc } from "@/lib/schedule";

const back = (id: string, msg: string): never => redirect(`/posts/${id}?msg=${encodeURIComponent(msg)}`);
const isRedirect = (e: unknown) => (e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT");

async function load(fd: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const id = String(fd.get("id"));
  const { data: post } = await sb.from("ls_posts").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!post) redirect("/painel?aba=posts");
  return { sb, user, id, post: post! };
}

/** Contexto de geração: chave, currículo no idioma, briefing de tom e a lista do que evitar. */
async function genContext(sb: Awaited<ReturnType<typeof load>>["sb"], uid: string, post: Record<string, unknown>) {
  const [{ data: prof }, { data: cs }, { data: rs }] = await Promise.all([
    sb.from("ls_profiles").select("llm_key_encrypted").eq("user_id", uid).single(),
    sb.from("ls_content_settings").select("writing_profile, avoid, languages, timezone").eq("user_id", uid).maybeSingle(),
    sb.from("ls_resumes").select("language, text_content").eq("user_id", uid).not("confirmed_at", "is", null),
  ]);
  const language = post.language === "en" ? "en" : "pt";
  const resume = ((rs ?? []).find((r) => r.language === language) ?? (rs ?? [])[0])?.text_content as string | undefined;
  const langs = ((cs?.languages ?? ["pt"]) as string[]);
  const secondary = langs.find((l) => l !== language) as "pt" | "en" | undefined;
  const briefing = composeBriefing(normalizeWeights((cs?.writing_profile as { weights?: unknown } | null)?.weights), (cs?.avoid ?? []) as string[]);
  const ctx: PostContext = {
    resume: resume ?? "", briefing, pillar: String(post.pillar ?? "sem pilar"), title: String(post.title ?? ""), angle: String(post.angle ?? ""), language,
    source: post.source_url ? { title: String(post.source_title ?? ""), name: String(post.source_name ?? ""), date: String(post.source_date ?? "") } : null,
  };
  return { key: prof?.llm_key_encrypted as string | null | undefined, ctx, secondary: secondary ?? null, tz: cs?.timezone ?? "America/Sao_Paulo" };
}

const overApproved = (est: Usage, approved: number) => !Number.isFinite(approved) || usageCost(est) > approved * 1.2 + 0.0001;
const STALE = "A estimativa mudou desde que você viu o valor. Confira o novo valor e autorize de novo.";

async function fail(sb: Awaited<ReturnType<typeof load>>["sb"], uid: string, id: string, e: unknown): Promise<never> {
  const msg = (e as Error).message;
  await sb.from("ls_posts").update({ failed: true, error: msg.slice(0, 500) }).eq("id", id).eq("user_id", uid);
  return back(id, `Falhou: ${msg}`);
}

export async function gerarRoteiro(fd: FormData) {
  const { sb, user, id, post } = await load(fd);
  if (!["rascunho", "roteiro"].includes(post.status)) back(id, "Volte ao passo do roteiro para gerar de novo.");
  const g = await genContext(sb, user.id, post);
  if (!g.key) back(id, "Cadastre a chave da API na etapa 3 do onboarding.");
  if (!g.ctx.resume) back(id, "Nenhum currículo validado.");
  if (overApproved(estimateScript(g.ctx.resume.length, g.ctx.briefing.length, (post.title + post.angle).length), Number(fd.get("usd")))) back(id, STALE);
  try {
    const r = await generateScript(decryptSecret(g.key!), g.ctx);
    const ok = scriptSchema.safeParse(r.script);
    if (!ok.success) throw new Error(`o roteiro veio incompleto: ${scriptProblem(r.script)}. Tente de novo.`);
    await sb.from("ls_posts").update({ script: ok.data, script_approved: false, status: "roteiro", failed: false, error: null }).eq("id", id).eq("user_id", user.id);
    back(id, `Roteiro pronto. Custo real: ${formatUsd(usageCost(r.usage))}. Edite e aprove para liberar o texto.`);
  } catch (e) { if (isRedirect(e)) throw e; await fail(sb, user.id, id, e); }
}

export async function salvarRoteiro(fd: FormData) {
  const { sb, user, id, post } = await load(fd);
  if (!["rascunho", "roteiro"].includes(post.status)) back(id, "Volte ao passo do roteiro para editar.");
  let raw: unknown;
  try { raw = JSON.parse(String(fd.get("script") ?? "{}")); } catch { back(id, "Roteiro inválido."); }
  const s = scriptSchema.safeParse(raw);
  if (!s.success) back(id, "O roteiro precisa de gancho, de 3 a 5 beats e de fechamento.");
  await sb.from("ls_posts").update({ script: s.data, script_approved: false, status: "roteiro" }).eq("id", id).eq("user_id", user.id);
  back(id, "Roteiro salvo. Aprove para liberar o texto.");
}

export async function aprovarRoteiro(fd: FormData) {
  const { sb, user, id, post } = await load(fd);
  if (!scriptSchema.safeParse(post.script).success) back(id, "Gere ou escreva o roteiro primeiro.");
  await sb.from("ls_posts").update({ script_approved: true }).eq("id", id).eq("user_id", user.id);
  back(id, "Roteiro aprovado. O texto está liberado.");
}

export async function gerarTexto(fd: FormData) {
  const { sb, user, id, post } = await load(fd);
  if (!["roteiro", "texto"].includes(post.status)) back(id, "Volte ao passo do texto para gerar de novo.");
  if (!canGenerateText(post.script, post.script_approved)) back(id, "Aprove o roteiro antes de gerar o texto.");
  const g = await genContext(sb, user.id, post);
  if (!g.key) back(id, "Cadastre a chave da API na etapa 3 do onboarding.");
  if (!g.ctx.resume) back(id, "Nenhum currículo validado.");
  if (overApproved(estimateTextGen(g.ctx.resume.length, g.ctx.briefing.length, JSON.stringify(post.script).length), Number(fd.get("usd")))) back(id, STALE);
  try {
    const r = await generatePostText(decryptSecret(g.key!), { ...g.ctx, script: post.script, secondary: g.secondary });
    await sb.from("ls_posts").update({ body: r.primary.slice(0, POST_MAX), body_secondary: r.secondary?.slice(0, POST_MAX) ?? null, secondary_language: r.secondary ? g.secondary : null, status: "texto", failed: false, error: null }).eq("id", id).eq("user_id", user.id);
    back(id, `Texto pronto. Custo real: ${formatUsd(usageCost(r.usage))}. Confira as marcas do que você pediu para evitar.`);
  } catch (e) { if (isRedirect(e)) throw e; await fail(sb, user.id, id, e); }
}

export async function salvarTexto(fd: FormData) {
  const { sb, user, id } = await load(fd);
  const body = String(fd.get("body") ?? "").slice(0, POST_MAX);
  const second = String(fd.get("body_secondary") ?? "").slice(0, POST_MAX);
  await sb.from("ls_posts").update({ body, body_secondary: second || null }).eq("id", id).eq("user_id", user.id);
  back(id, "Texto salvo.");
}

export async function escolherArte(fd: FormData) {
  const { sb, user, id, post } = await load(fd);
  if (!post.body) back(id, "Gere o texto antes da arte.");
  const phrase = String(fd.get("phrase") ?? "").trim().slice(0, 200);
  await sb.from("ls_posts").update({ art_phrase: phrase || null, status: "arte" }).eq("id", id).eq("user_id", user.id);
  back(id, phrase ? "Arte definida. Baixe a imagem e siga para o agendamento." : "Arte pulada. Siga para o agendamento.");
}

export async function agendar(fd: FormData) {
  const { sb, user, id, post } = await load(fd);
  if (!post.body) back(id, "Gere o texto antes de agendar.");
  const m = String(fd.get("when") ?? "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) back(id, "Escolha data e hora.");
  const g = await genContext(sb, user.id, post);
  const when = zonedToUtc(+m![1], +m![2] - 1, +m![3], +m![4], +m![5], g.tz);
  if (when.getTime() < Date.now()) back(id, "Essa data já passou.");
  await sb.from("ls_posts").update({ scheduled_for: when.toISOString(), status: "agendado", approval: "manual" }).eq("id", id).eq("user_id", user.id);
  back(id, "Agendado. O app não publica sozinho: na hora, copie o texto e publique no LinkedIn, depois marque como publicado.");
}

export async function marcarPublicadoPost(fd: FormData) {
  const { sb, user, id, post } = await load(fd);
  if (post.status !== "agendado") back(id, "Agende antes de marcar como publicado.");
  await sb.from("ls_posts").update({ status: "publicado", published_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  back(id, "Marcado como publicado.");
}

/** Volta um passo sem apagar o que já foi aprovado atrás nem o que já foi gerado à frente. */
export async function voltarPasso(fd: FormData) {
  const { sb, user, id, post } = await load(fd);
  const p = prevStep(post.status as Step);
  if (!p) back(id, "Já está no primeiro passo.");
  await sb.from("ls_posts").update({ status: p, failed: false, error: null }).eq("id", id).eq("user_id", user.id);
  back(id, "Voltou um passo. O que você já aprovou continua guardado.");
}
