import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { adicionarFonte, removerFonte } from "./actions";

const input = { padding: 10, borderRadius: 6, border: "1px solid #444", background: "#2b3138", color: "#fff", marginRight: 8 };
const btn = { padding: "10px 16px", borderRadius: 6, border: 0, background: "#2F6FB5", color: "#fff", cursor: "pointer" };

export default async function Fontes({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const { data } = await sb.from("ls_job_sources").select("id, kind, slug_or_url, company").eq("user_id", user.id).order("company");
  return (
    <>
      <h1>Fontes de vagas</h1>
      <p>Cadastre o board de cada empresa. Para Greenhouse, o código é o final do endereço, por exemplo <code>boards.greenhouse.io/<b>nubank</b></code>. Lever, Ashby, Workable e Gupy entram nas próximas versões.</p>
      {erro && <p style={{ color: "#ff8a80" }}>{erro}</p>}
      <form action={adicionarFonte} style={{ margin: "16px 0" }}>
        <input style={input} name="slug" placeholder="código do board" required />
        <input style={input} name="company" placeholder="nome da empresa" />
        <button style={btn}>Adicionar</button>
      </form>
      <ul>
        {(data ?? []).map((s) => (
          <li key={s.id}>{s.company ?? s.slug_or_url} ({s.kind}: {s.slug_or_url})
            <form action={removerFonte} style={{ display: "inline", marginLeft: 8 }}><input type="hidden" name="id" value={s.id} /><button style={{ ...btn, background: "#444", padding: "4px 8px" }}>remover</button></form>
          </li>
        ))}
      </ul>
      <p><Link href="/painel" style={{ color: "#6aa7e8" }}>Painel</Link></p>
    </>
  );
}
