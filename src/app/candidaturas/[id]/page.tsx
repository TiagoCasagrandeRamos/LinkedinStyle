import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import type { ResolvedField } from "@/lib/apply/resolve";
import { marcarEnviada, salvarRespostas } from "../actions";

const input = { display: "block", width: "100%", padding: 10, margin: "6px 0 14px", borderRadius: 6, border: "1px solid #444", background: "#2b3138", color: "#fff", boxSizing: "border-box" as const };
const btn = { padding: "10px 16px", borderRadius: 6, border: 0, background: "#2F6FB5", color: "#fff", cursor: "pointer", marginRight: 8 };
const STATUS: Record<string, string> = { draft: "rascunho", needs_input: "falta responder", ready: "pronta para você enviar", sent_by_user: "enviada por você" };

export default async function Candidatura({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { id } = await params;
  const { erro } = await searchParams;
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const { data: app } = await sb.from("ls_applications").select("id, status, note, fields, resume_id, job_id").eq("id", id).eq("user_id", user.id).single();
  if (!app) notFound();
  const [{ data: job }, { data: resume }] = await Promise.all([
    sb.from("ls_jobs").select("title, company, url").eq("id", app.job_id).single(),
    sb.from("ls_resumes").select("language, original_name, file_path").eq("id", app.resume_id).maybeSingle(),
  ]);
  const signed = resume ? await sb.storage.from("resumes").createSignedUrl(resume.file_path, 600) : null;
  const fields = app.fields as ResolvedField[];
  const ready = app.status === "ready";

  return (
    <>
      <p><Link href="/painel" style={{ color: "#6aa7e8" }}>Painel</Link></p>
      <h1>{job?.title}</h1>
      <p>{job?.company} · {STATUS[app.status] ?? app.status}</p>
      {erro && <p style={{ color: "#ff8a80" }}>{erro}</p>}
      <section style={{ border: "1px solid #3a4048", borderRadius: 8, padding: 14, margin: "12px 0" }}>
        <strong>Currículo escolhido:</strong> {resume?.original_name} ({resume?.language === "pt" ? "português" : "inglês"})
        <div style={{ color: "#aab2bd", fontSize: 14 }}>{app.note}</div>
        {signed?.data && <p><a href={signed.data.signedUrl} style={{ color: "#6aa7e8" }}>Baixar o arquivo para anexar</a></p>}
      </section>

      <form action={salvarRespostas}>
        <input type="hidden" name="id" value={app.id} />
        {fields.map((f, i) => {
          if (f.kind === "file") {
            return <p key={i} style={{ color: "#aab2bd" }}>{f.label}: {f.fileRole === "resume" ? "anexe o currículo acima." : "anexe manualmente, se quiser."}</p>;
          }
          const mark = f.needsUser && f.required ? "#ffd180" : "#444";
          return (
            <label key={i} style={{ display: "block" }}>
              {f.label}{f.required ? " *" : ""}{f.needsUser && f.required ? " (preciso da sua resposta)" : ""}
              {f.kind === "textarea" ? <textarea name={`f_${i}`} defaultValue={f.value ?? ""} style={{ ...input, borderColor: mark, minHeight: 100 }} />
                : f.kind === "select" ? <select name={`f_${i}`} defaultValue={f.value ?? ""} style={{ ...input, borderColor: mark }}><option value="">Escolha</option>{f.options?.map((o) => <option key={o}>{o}</option>)}</select>
                : f.kind === "multiselect" ? <span style={{ display: "block", margin: "6px 0 14px" }}>{f.options?.map((o) => <label key={o} style={{ marginRight: 12 }}><input type="checkbox" name={`f_${i}`} value={o} defaultChecked={(f.value ?? "").split(", ").includes(o)} /> {o}</label>)}</span>
                : <input name={`f_${i}`} defaultValue={f.value ?? ""} style={{ ...input, borderColor: mark }} />}
            </label>
          );
        })}
        <button style={btn}>Salvar respostas</button>
      </form>
      <p style={{ color: "#aab2bd", fontSize: 14 }}>O que você responder fica salvo no seu perfil e é reaproveitado nas próximas candidaturas. Perguntas de diversidade e conformidade do formulário não são preenchidas pelo app: responda direto no site da empresa.</p>

      {ready && (
        <section style={{ border: "1px solid #2F6FB5", borderRadius: 8, padding: 14, margin: "16px 0" }}>
          <strong>Tudo pronto.</strong> Abra a vaga, cole as respostas e envie. O envio final é seu. <Link href="/limites" style={{ color: "#6aa7e8" }}>Entenda o motivo</Link>.
          <p><a href={job?.url} style={{ ...btn, textDecoration: "none", display: "inline-block" }}>Abrir a vaga</a></p>
          <form action={marcarEnviada}><input type="hidden" name="id" value={app.id} /><button style={{ ...btn, background: "#444" }}>Já enviei</button></form>
        </section>
      )}
    </>
  );
}
