"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { estimateDraft, formatUsd, usageCost } from "@/lib/llm/cost";
import { draftPost } from "@/lib/llm/generate";
import { composeBriefing } from "@/lib/writing/briefing";
import { normalizeWeights } from "@/lib/writing/traits";
import type { Pillar } from "@/lib/pillars";

const volta = (msg: string): never => redirect(`/painel?aba=posts&msg=${encodeURIComponent(msg)}`);

/** Gera um rascunho com o Claude. Só roda com o valor que o usuário viu e autorizou no botão. */
export async function gerarRascunho(fd: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const approved = Number(fd.get("usd"));
  const topic = String(fd.get("topic") ?? "").trim().slice(0, 1000);
  const pillarName = String(fd.get("pillar") ?? "");
  const language = fd.get("language") === "en" ? "en" : "pt";
  if (!Number.isFinite(approved) || topic.length < 5) volta("Escreva o tema do post (pelo menos uma frase curta).");

  const [{ data: prof }, { data: cs }, { data: resumes }] = await Promise.all([
    sb.from("ls_profiles").select("llm_key_encrypted").eq("user_id", user.id).single(),
    sb.from("ls_content_settings").select("pillars, writing_profile, avoid").eq("user_id", user.id).maybeSingle(),
    sb.from("ls_resumes").select("text_content").eq("user_id", user.id).eq("language", language).not("confirmed_at", "is", null).limit(1),
  ]);
  if (!prof?.llm_key_encrypted) volta("Cadastre a chave da API na etapa 3 do onboarding.");
  let resume = (resumes ?? [])[0]?.text_content as string | undefined;
  if (!resume) {
    const { data: any1 } = await sb.from("ls_resumes").select("text_content").eq("user_id", user.id).not("confirmed_at", "is", null).limit(1);
    resume = any1?.[0]?.text_content as string | undefined;
  }
  if (!resume) volta("Nenhum currículo validado.");

  const pillar = ((cs?.pillars ?? []) as Pillar[]).find((p) => p.name === pillarName);
  const briefing = composeBriefing(normalizeWeights((cs?.writing_profile as { weights?: unknown } | null)?.weights), (cs?.avoid ?? []) as string[]);
  const est = usageCost(estimateDraft(resume!.length, briefing.length, topic.length));
  if (est > approved * 1.2 + 0.0001) volta("A estimativa mudou desde que você viu o valor. Confira o novo valor e autorize de novo.");

  try {
    const r = await draftPost(decryptSecret(prof!.llm_key_encrypted as string), {
      resume: resume!, briefing, pillar: pillar?.name ?? "sem pilar", pillarDescription: pillar?.description ?? "", topic, language,
    });
    await sb.from("ls_posts").insert({ user_id: user.id, title: topic.slice(0, 80), body: r.text, pillar: pillar?.name ?? null, language, status: "rascunho" });
    volta(`Rascunho criado. Custo real: ${formatUsd(usageCost(r.usage))}. Revise e edite antes de publicar.`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    volta(`Não gerei: ${(e as Error).message}`);
  }
}
