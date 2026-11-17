import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { estimatePending, type Estimate } from "@/lib/pipeline/db";
import { formatUsd } from "@/lib/llm/cost";
import { autorizarAvaliacao, buscarVagas, descartarPendentes } from "./actions";
import { prepararCandidatura } from "../candidaturas/actions";
import { nextSlots } from "@/lib/schedule";
import { ConexoesTab, PostsTab, type PautaPillar } from "./social";
import { fetchPillarNews } from "@/lib/news";
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

  const { data: cs } = await sb.from("ls_content_settings").select("pillars, post_days, post_time, languages").eq("user_id", user.id).single();
  const pillarList = ((cs?.pillars ?? []) as Pillar[]).filter((p) => p?.name);
  const pillars = pillarList.map((p) => p.name);
  let pauta: PautaPillar[] | null = null;
  if (aba === "posts" && pautaRaw === "1") {
    const lang = (cs?.languages ?? ["pt"])[0] === "en" ? "en" : "pt";
    pauta = await Promise.all(pillarList.filter((p) => (p.keywords ?? []).length).map(async (p) => {
      try { return { name: p.name, color: p.color, items: await fetchPillarNews(p.keywords, lang) }; }
      catch (e) { return { name: p.name, color: p.color, items: [], error: (e as Error).message }; }
    }));
  }
  const slots = nextSlots(cs?.post_days ?? [1, 3, 5], String(cs?.post_time ?? "09:00").slice(0, 5), 3);
  const { data: posts } = aba === "posts" ? await sb.from("ls_posts").select("id, title, body, pillar, language, status, scheduled_for").eq("user_id", user.id).order("created_at", { ascending: false }) : { data: [] };
  const { data: conns } = aba === "conexoes" ? await sb.from("ls_connections").select("id, name, company, role, profile_url, note, status, follow_up_at").eq("user_id", user.id).order("created_at", { ascending: false }) : { data: [] };

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
      {aba === "posts" && <PostsTab posts={posts ?? []} slots={slots.map((d) => d.toISOString())} pillars={pillars} pauta={pauta} />}
      {aba === "conexoes" && <ConexoesTab conns={conns ?? []} />}
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
          {!prof.llm_key_encrypted && <p style={{ color: "#ffd180" }}>Cadastre a sua chave da API na etapa 4 do <Link href="/onboarding?etapa=3" style={{ color: "#6aa7e8" }}>onboarding</Link> antes de autorizar.</p>}
          <form action={autorizarAvaliacao} style={{ display: "inline" }}>
            <input type="hidden" name="calls" value={est.willScore} />
            <input type="hidden" name="usd" value={est.usd.toFixed(6)} />
            <button style={btn}>Autorizar e avaliar ({formatUsd(est.usd)})</button>
          </form>
          <form action={descartarPendentes} style={{ display: "inline" }}><button style={ghost}>Descartar</button></form>
        </section>
      )}

      <p><Link href="/fontes" style={{ color: "#6aa7e8" }}>Fontes de vagas</Link> · <Link href="/onboarding?etapa=1" style={{ color: "#6aa7e8" }}>Revisar onboarding</Link></p>
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
