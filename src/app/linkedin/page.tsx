import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { tokenDaysLeft } from "@/lib/linkedin";
import { alternarAutomatico, desconectar } from "./actions";

const btn = { padding: "10px 16px", borderRadius: 6, border: 0, background: "#2F6FB5", color: "#fff", cursor: "pointer", marginRight: 8, textDecoration: "none", display: "inline-block" } as const;
const ghost = { ...btn, background: "#444" } as const;
const card = { border: "1px solid #3a4048", borderRadius: 8, padding: 14, margin: "14px 0" } as const;
const hint = { color: "#aab2bd", fontSize: 14 } as const;

export default async function LinkedinPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const [{ data: li }, { data: prof }, { data: next }] = await Promise.all([
    sb.from("ls_linkedin_auth").select("expires_at, member_name, connected_at").eq("user_id", user.id).maybeSingle(),
    sb.from("ls_profiles").select("auto_publish_enabled").eq("user_id", user.id).maybeSingle(),
    sb.from("ls_posts").select("id, title, scheduled_for, auto_publish").eq("user_id", user.id).eq("status", "agendado").order("scheduled_for"),
  ]);
  const configured = Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
  const left = li ? tokenDaysLeft(li.expires_at) : null;
  const expired = li ? left! < 0 : false;
  const on = !!prof?.auto_publish_enabled;
  return (
    <>
      <p><Link href="/painel" style={{ color: "#6aa7e8" }}>Voltar ao painel</Link></p>
      <h1>LinkedIn</h1>
      {msg && <p style={{ background: "#2b3138", padding: 10, borderRadius: 6 }}>{msg}</p>}

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Conexão</h2>
        {!configured && <p style={{ color: "#ffd180" }}>O servidor ainda não tem LINKEDIN_CLIENT_ID e LINKEDIN_CLIENT_SECRET. Veja o passo a passo no README, seção "Publicação automática".</p>}
        {li ? (
          <>
            <p>Conectado{li.member_name ? ` como ${li.member_name}` : ""}. {expired ? <strong style={{ color: "#ff8a80" }}>O acesso expirou.</strong> : `O acesso vale por mais ${left} dia(s).`}</p>
            {!expired && left! <= 7 && <p style={{ color: "#ffd180" }}>O LinkedIn não renova esse acesso sozinho. Reconecte antes de vencer para os posts agendados continuarem saindo.</p>}
          </>
        ) : <p style={hint}>Não conectado. O app só pede permissão para publicar no seu perfil e ler seu nome.</p>}
        <a href="/api/linkedin/connect" style={{ ...btn, opacity: configured ? 1 : 0.5, pointerEvents: configured ? "auto" : "none" }}>{li ? "Reconectar" : "Conectar o LinkedIn"}</a>
        {li && <form action={desconectar} style={{ display: "inline" }}><button style={ghost}>Desconectar</button></form>}
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Publicação automática</h2>
        <p style={hint}>Desligada por padrão. Ligada, o app só publica posts agendados que você autorizou um a um, com o texto exato que você viu. Mudou o texto, a autorização cai. Se o texto tiver algo da sua lista de evitar, ou se a hora passar mais de 6 horas sem sair, o app não publica e avisa no post. Nada disso usa IA paga.</p>
        <p>Estado: <strong>{on ? "ligada" : "desligada"}</strong></p>
        <form action={alternarAutomatico}>
          <input type="hidden" name="on" value={on ? "0" : "1"} />
          <button style={on ? ghost : btn} disabled={!li || expired}>{on ? "Desligar" : "Ligar"}</button>
        </form>
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Posts agendados</h2>
        {(next ?? []).length === 0 ? <p style={hint}>Nenhum post agendado.</p> : (
          <ul>{(next ?? []).map((p) => (
            <li key={p.id}><Link href={`/posts/${p.id}`} style={{ color: "#8ab4f8" }}>{p.title}</Link>, {new Date(p.scheduled_for as string).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}: {p.auto_publish ? "sai sozinho" : "aguarda você"}</li>
          ))}</ul>
        )}
      </section>
    </>
  );
}
