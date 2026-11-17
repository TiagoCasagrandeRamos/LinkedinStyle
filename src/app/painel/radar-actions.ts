"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { estimateAngles, formatUsd, usageCost } from "@/lib/llm/cost";
import { suggestAngles } from "@/lib/llm/generate";
import { fetchPillarNews, type NewsItem } from "@/lib/news";
import { buildTopics, type DiscardReason, type Feedback } from "@/lib/topics";
import { dayKey, nextSlots } from "@/lib/schedule";
import type { Pillar } from "@/lib/pillars";

const volta = (msg: string): never => redirect(`/painel?aba=posts&msg=${encodeURIComponent(msg)}`);
const isRedirect = (e: unknown) => (e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT");
const REASONS: DiscardReason[] = ["fora_do_tema", "ja_falei", "fonte_fraca", "nao_concordo"];

/** Busca notícias por pilar e guarda como pautas, já ranqueadas pelo que a pessoa descartou antes. Grátis. */
export async function buscarPauta() {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const [{ data: cs }, { data: old }, { data: posts }] = await Promise.all([
    sb.from("ls_content_settings").select("pillars, languages").eq("user_id", user.id).maybeSingle(),
    sb.from("ls_topics").select("title, keyword, source_name, source_url, status, discard_reason").eq("user_id", user.id),
    sb.from("ls_posts").select("title").eq("user_id", user.id).in("status", ["agendado", "publicado"]),
  ]);
  const pillars = ((cs?.pillars ?? []) as Pillar[]).filter((p) => p?.name && (p.keywords ?? []).length);
  if (pillars.length === 0) volta("Nenhum pilar com palavras-chave. Edite os pilares no onboarding (etapa 4).");
  const lang = (cs?.languages ?? ["pt"])[0] === "en" ? "en" : "pt";

  const news: Record<string, NewsItem[]> = {};
  const errors: string[] = [];
  await Promise.all(pillars.map(async (p) => {
    try { news[p.name] = await fetchPillarNews(p.keywords, lang); } catch (e) { errors.push(`${p.name}: ${(e as Error).message}`); }
  }));

  const feedback: Feedback[] = (old ?? []).filter((t) => t.status === "descartada" && t.discard_reason)
    .map((t) => ({ reason: t.discard_reason as DiscardReason, keyword: t.keyword, source_name: t.source_name, title: t.title }));
  const posted = [...(posts ?? []).map((p) => p.title as string | null), ...(old ?? []).filter((t) => t.status === "aprovada").map((t) => t.title as string)].filter((x): x is string => Boolean(x));
  const known = new Set((old ?? []).map((t) => t.source_url));

  const fresh = buildTopics(pillars.map((p) => ({ name: p.name, color: p.color, keywords: p.keywords })), news, feedback, posted).filter((t) => !known.has(t.source_url)).slice(0, 12);
  if (fresh.length) {
    const { error } = await sb.from("ls_topics").insert(fresh.map((t) => ({
      user_id: user.id, pillar: t.pillar, pillar_color: t.pillar_color, title: t.title, source_title: t.source_title, source_name: t.source_name,
      source_url: t.source_url, source_date: t.source_date, keyword: t.keyword, rank_score: t.rank_score,
    })));
    if (error) volta(`Não salvei as pautas: ${error.message}`);
  }
  volta(`${fresh.length} pauta(s) nova(s), ordenadas pelo que você já descartou.${errors.length ? ` Falhas: ${errors.join("; ")}` : ""}`);
}

export async function editarTitulo(fd: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const title = String(fd.get("title") ?? "").trim().slice(0, 200);
  if (title.length < 5) volta("O título precisa de pelo menos 5 caracteres.");
  await sb.from("ls_topics").update({ title }).eq("id", String(fd.get("id"))).eq("user_id", user.id).eq("status", "sugerida");
  volta("Título atualizado. Aprove quando estiver bom.");
}

/** Descartar exige um motivo: é com ele que o radar aprende. */
export async function descartarPauta(fd: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const reason = String(fd.get("reason")) as DiscardReason;
  if (!REASONS.includes(reason)) volta("Escolha um motivo para descartar.");
  await sb.from("ls_topics").update({ status: "descartada", discard_reason: reason }).eq("id", String(fd.get("id"))).eq("user_id", user.id);
  volta("Pauta descartada. As próximas sugestões levam esse motivo em conta.");
}

/** Aprovar cria o post com tudo herdado e leva para a área de post. */
export async function aprovarPauta(fd: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const { data: t } = await sb.from("ls_topics").select("*").eq("id", String(fd.get("id"))).eq("user_id", user.id).maybeSingle();
  if (!t || t.status !== "sugerida") volta("Pauta não encontrada ou já decidida.");
  const edited = String(fd.get("title") ?? "").trim().slice(0, 200);

  const [{ data: cs }, { data: sched }] = await Promise.all([
    sb.from("ls_content_settings").select("post_days, post_time, timezone, languages").eq("user_id", user.id).maybeSingle(),
    sb.from("ls_posts").select("scheduled_for").eq("user_id", user.id).not("scheduled_for", "is", null),
  ]);
  const tz = cs?.timezone ?? "America/Sao_Paulo";
  const taken = new Set((sched ?? []).map((p) => dayKey(new Date(p.scheduled_for as string), tz)));
  const slot = nextSlots(cs?.post_days ?? [1, 3, 5], String(cs?.post_time ?? "09:00").slice(0, 5), 1, new Date(), tz, taken)[0];

  const { data: post, error } = await sb.from("ls_posts").insert({
    user_id: user.id, title: edited.length >= 5 ? edited : t!.title, angle: t!.angle, pillar: t!.pillar, pillar_color: t!.pillar_color,
    language: (cs?.languages ?? ["pt"])[0] === "en" ? "en" : "pt", status: "rascunho", scheduled_for: slot?.toISOString() ?? null,
    source_title: t!.source_title, source_name: t!.source_name, source_url: t!.source_url, source_date: t!.source_date, topic_id: t!.id,
  }).select("id").single();
  if (error || !post) volta(`Não criei o post: ${error?.message ?? "erro"}`);
  await sb.from("ls_topics").update({ status: "aprovada", post_id: post!.id, title: edited.length >= 5 ? edited : t!.title }).eq("id", t!.id).eq("user_id", user.id);
  redirect(`/posts/${post!.id}`);
}

/** Ângulo de cada pauta com o Claude. Paga, então só com o valor autorizado. */
export async function sugerirAngulos(fd: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const approved = Number(fd.get("usd"));
  const [{ data: prof }, { data: topics }] = await Promise.all([
    sb.from("ls_profiles").select("llm_key_encrypted").eq("user_id", user.id).single(),
    sb.from("ls_topics").select("id, title, pillar").eq("user_id", user.id).eq("status", "sugerida").is("angle", null).order("rank_score", { ascending: false }).limit(10),
  ]);
  if (!prof?.llm_key_encrypted) volta("Cadastre a chave da API na etapa 3 do onboarding.");
  const list = topics ?? [];
  if (list.length === 0) volta("Nenhuma pauta sem ângulo.");
  const est = usageCost(estimateAngles(list.length, list.reduce((n, t) => n + t.title.length, 0)));
  if (!Number.isFinite(approved) || est > approved * 1.2 + 0.0001) volta("A estimativa mudou desde que você viu o valor. Confira o novo valor e autorize de novo.");
  try {
    const r = await suggestAngles(decryptSecret(prof!.llm_key_encrypted as string), list);
    for (const a of r.angles) await sb.from("ls_topics").update({ angle: a.angle }).eq("id", a.id).eq("user_id", user.id);
    volta(`${r.angles.length} ângulo(s) criado(s). Custo real: ${formatUsd(usageCost(r.usage))}.`);
  } catch (e) {
    if (isRedirect(e)) throw e;
    volta(`Não gerei os ângulos: ${(e as Error).message}`);
  }
}
