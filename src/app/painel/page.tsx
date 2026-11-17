import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { rodarAgora } from "./actions";

const btn = { padding: "10px 16px", borderRadius: 6, border: 0, background: "#2F6FB5", color: "#fff", cursor: "pointer" };

export default async function Painel({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const { data: prof } = await sb.from("ls_profiles").select("onboarding_completed_at").eq("user_id", user.id).single();
  if (!prof?.onboarding_completed_at) redirect("/onboarding");
  const { data: pref } = await sb.from("ls_job_preferences").select("daily_job_limit").eq("user_id", user.id).single();
  const limit = pref?.daily_job_limit ?? 5;
  const { data: jobs } = await sb.from("ls_jobs").select("id, company, title, url, location, language, score, score_justification")
    .eq("user_id", user.id).order("score", { ascending: false }).limit(limit);
  return (
    <>
      <h1>Painel</h1>
      {msg && <p style={{ background: "#2b3138", padding: 12, borderRadius: 6 }}>{msg}</p>}
      <form action={rodarAgora}><button style={btn}>Buscar vagas agora</button></form>
      <p><Link href="/fontes" style={{ color: "#6aa7e8" }}>Fontes de vagas</Link> · <Link href="/onboarding?etapa=1" style={{ color: "#6aa7e8" }}>Revisar onboarding</Link></p>
      <h2>Melhores vagas (até {limit})</h2>
      {(jobs ?? []).length === 0 && <p>Nenhuma vaga ainda. Cadastre uma fonte e clique em buscar.</p>}
      {(jobs ?? []).map((j) => (
        <article key={j.id} style={{ border: "1px solid #3a4048", borderRadius: 8, padding: 14, margin: "12px 0" }}>
          <strong>{j.score}</strong> · <a href={j.url} style={{ color: "#6aa7e8" }}>{j.title}</a> · {j.company}
          <div style={{ color: "#aab2bd", fontSize: 14 }}>{j.location} · vaga em {j.language === "pt" ? "português" : "inglês"}</div>
          <ul style={{ fontSize: 14, color: "#cfd6df" }}>{((j.score_justification ?? []) as string[]).map((t, i) => <li key={i}>{t}</li>)}</ul>
        </article>
      ))}
    </>
  );
}
