import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { estimateScript, estimateTextGen, formatUsd, usageCost } from "@/lib/llm/cost";
import { composeBriefing } from "@/lib/writing/briefing";
import { normalizeWeights } from "@/lib/writing/traits";
import { STEPS, STEP_LABEL, canGenerateText, scriptSchema, sentences, type Script, type Step } from "@/lib/posts";
import { dayKey, nextSlots } from "@/lib/schedule";
import { agendar, aprovarRoteiro, gerarRoteiro, gerarTexto, marcarPublicadoPost, voltarPasso } from "../actions";
import ScriptEditor from "./script-editor";
import TextEditor from "./text-editor";
import ArtPanel from "./art-panel";

const btn = { padding: "10px 16px", borderRadius: 6, border: 0, background: "#2F6FB5", color: "#fff", cursor: "pointer", marginRight: 8 } as const;
const ghost = { ...btn, background: "#444" } as const;
const card = { border: "1px solid #3a4048", borderRadius: 8, padding: 14, margin: "14px 0" } as const;
const input = { width: "100%", padding: 8, margin: "4px 0 8px", borderRadius: 6, border: "1px solid #444", background: "#2b3138", color: "#fff", boxSizing: "border-box" } as const;
const hint = { color: "#aab2bd", fontSize: 14 } as const;

export default async function PostPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params;
  const { msg } = await searchParams;
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const { data: post } = await sb.from("ls_posts").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!post) redirect("/painel?aba=posts");

  const [{ data: cs }, { data: rs }, { data: prof }, { data: sched }, { data: li }] = await Promise.all([
    sb.from("ls_content_settings").select("writing_profile, avoid, post_days, post_time, timezone").eq("user_id", user.id).maybeSingle(),
    sb.from("ls_resumes").select("text_content").eq("user_id", user.id).not("confirmed_at", "is", null).limit(1),
    sb.from("ls_profiles").select("llm_key_encrypted, auto_publish_enabled").eq("user_id", user.id).single(),
    sb.from("ls_posts").select("id, title, scheduled_for").eq("user_id", user.id).not("scheduled_for", "is", null).neq("id", id).gte("scheduled_for", new Date().toISOString()).order("scheduled_for"),
    sb.from("ls_linkedin_auth").select("expires_at").eq("user_id", user.id).maybeSingle(),
  ]);
  const liOk = !!li && new Date(li.expires_at) > new Date();
  const autoOn = !!prof?.auto_publish_enabled;
  const tz = cs?.timezone ?? "America/Sao_Paulo";
  const avoid = (cs?.avoid ?? []) as string[];
  const briefing = composeBriefing(normalizeWeights((cs?.writing_profile as { weights?: unknown } | null)?.weights), avoid);
  const resumeLen = ((rs?.[0]?.text_content as string | undefined) ?? "").length;
  const hasKey = Boolean(prof?.llm_key_encrypted);
  const step = post.status as Step;
  const stepIdx = STEPS.indexOf(step);
  const script = scriptSchema.safeParse(post.script);
  const scriptOk = script.success ? (script.data as Script) : null;
  const scriptUsd = usageCost(estimateScript(resumeLen, briefing.length, ((post.title ?? "") + (post.angle ?? "")).length));
  const textUsd = usageCost(estimateTextGen(resumeLen, briefing.length, JSON.stringify(post.script ?? {}).length));
  const takenDays = new Set((sched ?? []).map((p) => dayKey(new Date(p.scheduled_for as string), tz)));
  const free = nextSlots(cs?.post_days ?? [1, 3, 5], String(cs?.post_time ?? "09:00").slice(0, 5), 3, new Date(), tz, takenDays);
  const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: tz });
  const local = (iso: string | null) => (iso ? new Intl.DateTimeFormat("sv-SE", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(" ", "T") : "");
  const sameDay = post.scheduled_for ? (sched ?? []).filter((p) => dayKey(new Date(p.scheduled_for as string), tz) === dayKey(new Date(post.scheduled_for), tz)) : [];
  const color = post.pillar_color ?? "#2F6FB5";
  const canText = canGenerateText(post.script, post.script_approved);
  const needKey = !hasKey && <p style={{ color: "#ffd180" }}>Cadastre a chave da API na etapa 3 do onboarding para gerar.</p>;

  return (
    <>
      <p><Link href="/painel?aba=posts" style={{ color: "#6aa7e8" }}>Voltar ao painel</Link></p>
      <h1 style={{ marginBottom: 4 }}>{post.title ?? "Post sem título"}</h1>
      <div style={{ borderLeft: `4px solid ${color}`, paddingLeft: 10 }}>
        <strong style={{ color }}>{post.pillar ?? "sem pilar"}</strong>
        {post.angle && <div>Ângulo: {post.angle}</div>}
        {post.source_url && <div style={hint}>Fonte (travada): <a href={post.source_url} style={{ color: "#6aa7e8" }}>{post.source_name}</a>{post.source_date ? `, ${new Date(post.source_date).toLocaleDateString("pt-BR", { timeZone: tz })}` : ""}</div>}
        {post.scheduled_for && <div style={hint}>{step === "agendado" ? "Agendado para" : "Slot sugerido"}: {fmt(post.scheduled_for)}</div>}
      </div>

      <nav style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "16px 0" }}>
        {STEPS.map((s, i) => (
          <span key={s} style={{ padding: "6px 12px", borderRadius: 999, fontSize: 14, background: s === step ? color : "#2b3138", color: s === step ? "#1f2328" : i < stepIdx ? "#fff" : "#8b94a0", fontWeight: s === step ? 700 : 400 }}>{STEP_LABEL[s]}</span>
        ))}
      </nav>
      {msg && <p style={{ background: "#2b3138", padding: 12, borderRadius: 6 }}>{msg}</p>}
      {post.failed && <p style={{ color: "#ff8a80", border: "1px solid #ff8a80", padding: 10, borderRadius: 6 }}>A última geração falhou: {post.error}. Nada foi perdido, tente de novo.</p>}
      {stepIdx > 0 && step !== "publicado" && (
        <form action={voltarPasso}><input type="hidden" name="id" value={id} /><button style={ghost}>Voltar um passo (para {STEP_LABEL[STEPS[stepIdx - 1]]})</button></form>
      )}

      {(step === "rascunho" || step === "roteiro") && (
        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Roteiro</h2>
          <p style={hint}>O roteiro é a estrutura, não o texto. Corrigir o gancho aqui custa muito menos do que corrigir um texto pronto.</p>
          {scriptOk && <ScriptEditor id={id} initial={scriptOk} editable />}
          {scriptOk && !post.script_approved && (
            <form action={aprovarRoteiro} style={{ marginTop: 10 }}><input type="hidden" name="id" value={id} /><button style={btn}>Aprovar roteiro e liberar o texto</button><span style={hint}> Salve as edições antes de aprovar.</span></form>
          )}
          {scriptOk && post.script_approved && <p style={{ color: "#7BD389" }}>Roteiro aprovado.</p>}
          <form action={gerarRoteiro} style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={id} /><input type="hidden" name="usd" value={scriptUsd.toFixed(6)} />
            <button style={scriptOk ? ghost : btn} disabled={!hasKey}>{scriptOk ? "Gerar outro roteiro" : "Gerar roteiro"} (custo estimado {formatUsd(scriptUsd)})</button>
            <p style={hint}>Nada é cobrado até você tocar no botão. Gerar outro roteiro desfaz a aprovação.</p>{needKey}
          </form>
          {scriptOk && (
            <form action={gerarTexto} style={{ marginTop: 14 }}>
              <input type="hidden" name="id" value={id} /><input type="hidden" name="usd" value={textUsd.toFixed(6)} />
              <button style={btn} disabled={!hasKey || !canText}>Gerar texto (custo estimado {formatUsd(textUsd)})</button>
              {!canText && <p style={hint}>Liberado depois que você aprovar o roteiro.</p>}
            </form>
          )}
        </section>
      )}

      {stepIdx >= 2 && post.body && (
        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Texto</h2>
          <p style={hint}>Gerado com o seu perfil de escrita e a lista do que evitar. O app marca as ocorrências e não corrige sozinho.</p>
          <TextEditor id={id} body={post.body} bodySecondary={post.body_secondary ?? ""} secondaryLang={post.secondary_language} language={post.language} avoid={avoid} />
          {step === "texto" && canText && (
            <form action={gerarTexto} style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={id} /><input type="hidden" name="usd" value={textUsd.toFixed(6)} />
              <button style={ghost} disabled={!hasKey}>Gerar o texto de novo (custo estimado {formatUsd(textUsd)})</button>
            </form>
          )}
        </section>
      )}

      {step === "texto" && post.body && (
        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Arte</h2>
          <ArtPanel id={id} hook={scriptOk?.hook ?? post.title ?? ""} options={sentences(post.body)} initial={post.art_phrase ?? ""} pillar={post.pillar ?? ""} color={color} sourceName={post.source_name} sourceDate={post.source_date} />
        </section>
      )}
      {(step === "arte" || step === "agendado" || step === "publicado") && post.body && (
        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Arte</h2>
          <ArtPanel id={id} hook={scriptOk?.hook ?? post.title ?? ""} options={sentences(post.body)} initial={post.art_phrase ?? ""} pillar={post.pillar ?? ""} color={color} sourceName={post.source_name} sourceDate={post.source_date} />
        </section>
      )}

      {(step === "arte" || step === "agendado") && (
        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Agendamento</h2>
          <form action={agendar}>
            <input type="hidden" name="id" value={id} />
            <label>Data e hora ({tz})<input style={input} type="datetime-local" name="when" defaultValue={local(post.scheduled_for ?? free[0]?.toISOString() ?? null)} required /></label>
            {sameDay.length > 0 && <p style={{ color: "#ffd180" }}>Já existe post nesse dia: {sameDay.map((p) => p.title).join(", ")}. Dois no mesmo dia dividem o alcance.</p>}
            <fieldset style={{ border: "1px solid #3a4048", borderRadius: 8, margin: "8px 0" }}>
              <legend>Publicação</legend>
              <label><input type="radio" name="mode" value="manual" defaultChecked={!post.auto_publish} /> Esperar a minha aprovação final (eu publico e marco)</label><br />
              {liOk ? (
                <>
                  <label><input type="radio" name="mode" value="auto" defaultChecked={!!post.auto_publish} /> Publicar sozinho no LinkedIn na hora marcada{post.art_path ? ", com a imagem da arte" : ", só texto"}</label>
                  <div style={{ marginLeft: 22 }}>
                    <label style={hint}><input type="checkbox" name="consent" defaultChecked={!!post.auto_publish} /> Li o texto abaixo e autorizo o app a publicar exatamente este conteúdo no meu perfil.</label>
                    {!autoOn && <p style={{ color: "#ffd180", margin: "4px 0" }}>A publicação automática está desligada na página do LinkedIn. Ligue lá antes de agendar.</p>}
                  </div>
                </>
              ) : (
                <p style={hint}><a href="/linkedin" style={{ color: "#8ab4f8" }}>Conecte o LinkedIn</a> para liberar a opção de publicar sozinho.</p>
              )}
            </fieldset>
            <button style={btn}>{step === "agendado" ? "Reagendar" : "Confirmar agendamento"}</button>
          </form>
          {post.auto_publish && post.scheduled_for && <p style={{ color: "#7BD389" }}>Publicação automática marcada para {fmt(post.scheduled_for)}. Para cancelar, reagende em "Esperar a minha aprovação final" ou volte um passo.</p>}
          <details style={{ margin: "8px 0" }}><summary style={hint}>Texto que será publicado</summary><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{post.body}</pre></details>
          <h3>Agenda ocupada</h3>
          {(sched ?? []).length === 0 ? <p style={hint}>Nenhum outro post agendado.</p> : <ul>{(sched ?? []).map((p) => <li key={p.id}>{fmt(p.scheduled_for as string)}: {p.title}</li>)}</ul>}
          <p style={hint}>Próximos horários livres pela sua cadência: {free.length ? free.map((d) => fmt(d.toISOString())).join(" · ") : "defina dias e horário no onboarding"}.</p>
          {step === "agendado" && (
            <form action={marcarPublicadoPost}><input type="hidden" name="id" value={id} /><button style={ghost}>Já publiquei no LinkedIn</button></form>
          )}
        </section>
      )}
      {step === "publicado" && <p style={{ color: "#7BD389" }}>Publicado{post.published_at ? ` em ${fmt(post.published_at)}` : ""}.{post.published_url && <> <a href={post.published_url} style={{ color: "#8ab4f8" }}>Ver no LinkedIn</a></>}</p>}
    </>
  );
}
