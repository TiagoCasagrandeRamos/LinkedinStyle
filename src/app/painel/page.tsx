import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { estimatePending, type Estimate } from "@/lib/pipeline/db";
import { estimateAngles, estimateDraft, formatUsd, usageCost } from "@/lib/llm/cost";
import { composeBriefing } from "@/lib/writing/briefing";
import { normalizeWeights } from "@/lib/writing/traits";
import { autorizarAvaliacao, buscarVagas, descartarPendentes } from "./actions";
import { prepararCandidatura } from "../candidaturas/actions";
import { nextSlots } from "@/lib/schedule";
import { ConexoesTab, PostsTab, type OutreachJob, type TopicRow } from "./social";
import { connectionsCost, estimateConnections } from "@/lib/llm/cost";
import type { Pillar } from "@/lib/pillars";

const btn = { padding: "10px 16px", borderRadius: 6, border: 0, background: "#2F6FB5", color: "#fff", cursor: "pointer", marginRight: 8 };
const ghost = { ...btn, background: "#444" };

export default async function Painel({ searchParams }: { searchParams: Promise<{ msg?: string; erro?: string; aba?: string; pauta?: string }> }) {
  const { msg, erro, aba: abaRaw, pauta: pautaRaw } = await searchParams;
  const aba = abaRaw === "posts" || abaRaw === "conexoes" ? abaRaw : "vagas";
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const { data: prof } = await sb.from("ls_profiles").select("onboarding_completed_at, llm_key_encrypted").eq("user_id", user.id).single();
  if (!prof?.onboarding_completed_at) redirect("/onboarding");
  const { data: pref } = await sb.from("ls_job_preferences").select("daily_job_limit").eq("user_id", user.id).single();
  const limit = pref?.daily_job_limit ?? 5;

  let est: Estimate | null = null;
  try { est = await estimatePending(sb, user.id); } catch { est = null; }

  const { data: jobs } = await sb.from("ls_jobs").select("id, source, company, title, url, location, language, score, score_justification")
    .eq("user_id", user.id).not("score", "is", null).order("score", { ascending: false }).limit(limit);
  const { data: apps } = await sb.from("ls_applications").select("id, job_id, status").eq("user_id", user.id);
  const appByJob = new Map((apps ?? []).map((a) => [a.job_id, a]));

  const { data: cs } = await sb.from("ls_content_settings").select("pillars, post_days, post_time, languages, writing_profile, avoid, timezone").eq("user_id", user.id).single();
  const pillarList = ((cs?.pillars ?? []) as Pillar[]).filter((p) => p?.name);
  const pillars = pillarList.map((p) => p.name);
  let draftUsd = 0;
  if (aba === "posts") {
    const { data: rs } = await sb.from("ls_resumes").select("text_content").eq("user_id", user.id).not("confirmed_at", "is", null).limit(1);
    const briefing = composeBriefing(normalizeWeights((cs?.writing_profile as { weights?: unknown } | null)?.weights), (cs?.avoid ?? []) as string[]);
    draftUsd = usageCost(estimateDraft(((rs?.[0]?.text_content as string | undefined) ?? "").length, briefing.length, 300));
  }
  let outreachJobs: OutreachJob[] = [];
  let connUsd = 0;
  let minScore = 80;
  const usedToday = { vaga: 0, rede: 0 };
  if (aba === "conexoes") {
    const { data: pr } = await sb.from("ls_job_preferences").select("min_score_outreach").eq("user_id", user.id).single();
    minScore = pr?.min_score_outreach ?? 80;
    const { data: oj } = await sb.from("ls_jobs").select("id, title, company, score").eq("user_id", user.id).gte("score", minScore).order("score", { ascending: false }).limit(20);
    outreachJobs = (oj ?? []) as OutreachJob[];
    const { data: rs } = await sb.from("ls_resumes").select("text_content").eq("user_id", user.id).not("confirmed_at", "is", null).limit(1);
    const briefing = composeBriefing(normalizeWeights((cs?.writing_profile as { weights?: unknown } | null)?.weights), (cs?.avoid ?? []) as string[]);
    connUsd = connectionsCost(estimateConnections(((rs?.[0]?.text_content as string | undefined) ?? "").length, briefing.length, 3000));
    const brt = new Date(Date.now() - 3 * 3600 * 1000); brt.setUTCHours(0, 0, 0, 0);
    const since = new Date(brt.getTime() + 3 * 3600 * 1000).toISOString();
    const { data: today } = await sb.from("ls_connections").select("kind").eq("user_id", user.id).gte("created_at", since);
    for (const t of today ?? []) usedToday[t.kind === "vaga" ? "vaga" : "rede"]++;
  }
  let topics: TopicRow[] = [];
  let angleUsd = 0;
  if (aba === "posts") {
    const { data: tp } = await sb.from("ls_topics").select("id, pillar, pillar_color, title, angle, source_name, source_url, source_date, keyword, rank_score").eq("user_id", user.id).eq("status", "sugerida").order("rank_score", { ascending: false }).limit(12);
    topics = (tp ?? []) as TopicRow[];
    const noAngle = topics.filter((t) => !t.angle).slice(0, 10);
    angleUsd = usageCost(estimateAngles(noAngle.length, noAngle.reduce((n, t) => n + t.title.length, 0)));
  }
  const slots = nextSlots(cs?.post_days ?? [1, 3, 5], String(cs?.post_time ?? "09:00").slice(0, 5), 3, new Date(), (cs as { timezone?: string } | null)?.timezone ?? "America/Sao_Paulo");
  const { data: posts } = aba === "posts" ? await sb.from("ls_posts").select("id, title, body, pillar, language, status, scheduled_for, failed").eq("user_id", user.id).order("created_at", { ascending: false }) : { data: [] };
  const { data: conns } = aba === "conexoes" ? await sb.from("ls_connections").select("id, name, company, role, profile_url, note, status, follow_up_at, invite_note, followup_message, reason, kind").eq("user_id", user.id).order("created_at", { ascending: false }) : { data: [] };

  return (
    <>
      <h1>Painel</h1>
      {erro && <p style={{ color: "#ff8a80" }}>{erro}</p>}
      {msg && <p style={{ background: "#2b3138", padding: 12, borderRadius: 6 }}>{msg}</p>}

      <nav style={{ display: "flex", gap: 8, margin: "8px 0 16px" }}>
        {([["vagas", "Vagas"], ["posts", "Posts"], ["conexoes", "Conexões"]] as const).map(([k, l]) => (
          <Link key={k} href={`/painel?aba=${k}`} style={{ padding: "8px 14px", borderRadius: 6, textDecoration: "none", color: "#fff", background: aba === k ? "#2F6FB5" : "#2b3138" }}>{l}</Link>
        ))}
      </nav>
      {aba === "posts" && <PostsTab posts={posts ?? []} slots={slots.map((d) => d.toISOString())} pillars={pillars} topics={topics} angleUsd={angleUsd} draftUsd={draftUsd} hasKey={Boolean(prof.llm_key_encrypted)} />}
      {aba === "conexoes" && <ConexoesTab conns={(conns ?? []) as never} jobs={outreachJobs} connUsd={connUsd} hasKey={Boolean(prof.llm_key_encrypted)} minScore={minScore} usedToday={usedToday} />}
      {aba === "vagas" && <>
      <form action={buscarVagas}><button style={btn}>Buscar vagas (grátis)</button></form>
      <p style={{ color: "#aab2bd", fontSize: 14 }}>A busca não custa nada. A avaliação com o Claude é paga e só roda depois que você autorizar o valor.</p>

      {est && est.pendingTotal > 0 && (
        <section style={{ border: "1px solid #2F6FB5", borderRadius: 8, padding: 14, margin: "16px 0" }}>
          <strong>{est.pendingTotal} vagas aguardam avaliação com o Claude.</strong>
          <p>
            Avaliar {est.willScore} agora{est.pendingTotal > est.willScore ? ` (teto por rodada, as outras ${est.pendingTotal - est.willScore} ficam para depois)` : ""}:<br />
            custo estimado <strong>{formatUsd(est.usd)}</strong> com o modelo {est.model}, cerca de {est.usage.input.toLocaleString("pt-BR")} tokens de entrada e {est.usage.output.toLocaleString("pt-BR")} de saída.
          </p>
          <p style={{ color: "#aab2bd", fontSize: 14 }}>Nada é cobrado até você tocar em autorizar. É estimativa: o custo real aparece depois da avaliação.</p>
          {!prof.llm_key_encrypted && <p style={{ color: "#ffd180" }}>Cadastre a sua chave da API na etapa 3 do <Link href="/onboarding?etapa=3" style={{ color: "#6aa7e8" }}>onboarding</Link> antes de autorizar.</p>}
          <form action={autorizarAvaliacao} style={{ display: "inline" }}>
            <input type="hidden" name="calls" value={est.willScore} />
            <input type="hidden" name="usd" value={est.usd.toFixed(6)} />
            <button style={btn}>Autorizar e avaliar ({formatUsd(est.usd)})</button>
          </form>
          <form action={descartarPendentes} style={{ display: "inline" }}><button style={ghost}>Descartar</button></form>
        </section>
      )}

      <p><Link href="/fontes" style={{ color: "#6aa7e8" }}>Fontes de vagas</Link> · <Link href="/linkedin" style={{ color: "#6aa7e8" }}>LinkedIn</Link> · <Link href="/onboarding?etapa=1" style={{ color: "#6aa7e8" }}>Revisar onboarding</Link></p>
      <h2>Melhores vagas (até {limit})</h2>
      {(jobs ?? []).length === 0 && <p>Nenhuma vaga avaliada ainda. Cadastre uma fonte, busque e autorize a avaliação.</p>}
      {(jobs ?? []).map((j) => (
        <article key={j.id} style={{ border: "1px solid #3a4048", borderRadius: 8, padding: 14, margin: "12px 0" }}>
          <strong>{j.score}</strong> · <a href={j.url} style={{ color: "#6aa7e8" }}>{j.title}</a> · {j.company}
          <div style={{ color: "#aab2bd", fontSize: 14 }}>{j.location} · vaga em {j.language === "pt" ? "português" : "inglês"}</div>
          {j.source === "greenhouse" && (appByJob.get(j.id)
            ? <p><Link href={`/candidaturas/${appByJob.get(j.id)!.id}`} style={{ color: "#6aa7e8" }}>Abrir candidatura</Link></p>
            : <form action={prepararCandidatura}><input type="hidden" name="jobId" value={j.id} /><button style={btn}>Preparar candidatura</button></form>)}
          <ul style={{ fontSize: 14, color: "#cfd6df" }}>{((j.score_justification ?? []) as string[]).map((t, i) => <li key={i}>{t}</li>)}</ul>
        </article>
      ))}
      </>}
    </>
  );
}
