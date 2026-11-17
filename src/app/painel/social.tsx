import { gerarRascunho } from "./draft-actions";
import { formatUsd } from "@/lib/llm/cost";
import { criarConexao, apagarConexao, apagarPost, criarPost, marcarPost, mudarConexao } from "./social-actions";

type Post = { id: string; title: string | null; body: string; pillar: string | null; language: string; status: string; scheduled_for: string | null };
type Conn = { id: string; name: string; company: string | null; role: string | null; profile_url: string | null; note: string | null; status: string; follow_up_at: string | null };

const btn = { padding: "8px 14px", borderRadius: 6, border: 0, background: "#2F6FB5", color: "#fff", cursor: "pointer", marginRight: 8 } as const;
const small = { ...btn, background: "#444", padding: "4px 10px", fontSize: 13 } as const;
const input = { width: "100%", padding: 8, margin: "4px 0 10px", borderRadius: 6, border: "1px solid #3a4048", background: "#2b3138", color: "#fff", boxSizing: "border-box" } as const;
const card = { border: "1px solid #3a4048", borderRadius: 8, padding: 14, margin: "12px 0" } as const;
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const STATUS_CONN: Record<string, string> = { para_abordar: "Para abordar", abordado: "Abordado", respondeu: "Respondeu", conectado: "Conectado" };

export type PautaPillar = { name: string; color: string; items: { title: string; link: string; source: string; date: string }[]; error?: string };

export function PostsTab({ posts, slots, pillars, pauta, draftUsd, hasKey }: { posts: Post[]; slots: string[]; pillars: string[]; pauta: PautaPillar[] | null; draftUsd: number; hasKey: boolean }) {
  return (
    <>
      <section style={card}>
        <strong>Próximos horários pela sua cadência</strong>
        <p style={{ color: "#aab2bd", fontSize: 14 }}>{slots.length ? slots.map(fmt).join(" · ") : "Defina dias e horário no onboarding (etapa 3)."}</p>
      </section>
      <section style={card}>
        <strong>Radar de notícias</strong>
        <p style={{ color: "#aab2bd", fontSize: 14 }}>Busca notícias dos últimos 7 dias pelas palavras-chave de cada pilar. É grátis, não usa o Claude.</p>
        <a href="/painel?aba=posts&pauta=1" style={{ ...btn, textDecoration: "none", display: "inline-block" }}>Buscar pauta do dia</a>
        {pauta && (
          <>
            <h3>Pauta de {new Date().toLocaleDateString("pt-BR", { dateStyle: "full", timeZone: "America/Sao_Paulo" })}</h3>
            {pauta.length === 0 && <p>Nenhum pilar com palavras-chave. Edite os pilares no onboarding (etapa 4).</p>}
            {pauta.map((p) => (
              <div key={p.name} style={{ borderLeft: `4px solid ${p.color}`, paddingLeft: 10, margin: "10px 0" }}>
                <strong style={{ color: p.color }}>{p.name}</strong>
                {p.error && <p style={{ color: "#ffd180" }}>Não consegui buscar: {p.error}</p>}
                {!p.error && p.items.length === 0 && <p style={{ color: "#aab2bd" }}>Nada novo nesta semana.</p>}
                <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
                  {p.items.map((n) => <li key={n.link}><a href={n.link} style={{ color: "#6aa7e8" }}>{n.title}</a> <span style={{ color: "#aab2bd", fontSize: 13 }}>({n.source}, {new Date(n.date).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })})</span></li>)}
                </ul>
              </div>
            ))}
          </>
        )}
      </section>
      <form action={gerarRascunho} style={{ ...card, borderColor: "#2F6FB5" }}>
        <strong>Gerar rascunho com o Claude</strong>
        <p style={{ color: "#aab2bd", fontSize: 14 }}>Usa o seu perfil de escrita e o seu currículo. Nada é cobrado até você tocar no botão. É estimativa, o custo real aparece depois.</p>
        <textarea name="topic" placeholder="Tema ou notícia (cole o título da pauta aqui)" rows={3} required style={input} />
        <select name="pillar" style={input} defaultValue=""><option value="">Sem pilar</option>{pillars.map((p) => <option key={p}>{p}</option>)}</select>
        <select name="language" style={input} defaultValue="pt"><option value="pt">Português</option><option value="en">English</option></select>
        <input type="hidden" name="usd" value={draftUsd.toFixed(6)} />
        <button style={btn} disabled={!hasKey}>Autorizar e gerar ({formatUsd(draftUsd)})</button>
        {!hasKey && <p style={{ color: "#ffd180" }}>Cadastre a chave da API na etapa 3 do onboarding.</p>}
      </form>
      <form action={criarPost} style={card}>
        <strong>Novo post</strong>
        <input name="title" placeholder="Título ou ideia" style={input} />
        <textarea name="body" placeholder="Texto do post" rows={5} style={input} />
        <select name="pillar" style={input} defaultValue=""><option value="">Sem pilar</option>{pillars.map((p) => <option key={p}>{p}</option>)}</select>
        <select name="language" style={input} defaultValue="pt"><option value="pt">Português</option><option value="en">English</option></select>
        <label style={{ fontSize: 14 }}>Agendar para (opcional)</label>
        <input name="scheduled_for" type="datetime-local" style={input} />
        <button style={btn}>Salvar post</button>
      </form>
      <p style={{ color: "#aab2bd", fontSize: 14 }}>O app organiza e lembra. A publicação no LinkedIn é feita por você, na hora, depois de copiar o texto.</p>
      {posts.length === 0 && <p>Nenhum post ainda.</p>}
      {posts.map((p) => (
        <article key={p.id} style={card}>
          <strong>{p.title || "Sem título"}</strong> · {p.status}{p.scheduled_for ? ` · ${fmt(p.scheduled_for)}` : ""}
          <div style={{ color: "#aab2bd", fontSize: 14 }}>{p.pillar ?? "sem pilar"} · {p.language === "pt" ? "português" : "inglês"}</div>
          <p style={{ whiteSpace: "pre-wrap" }}>{p.body}</p>
          {(["rascunho", "agendado", "publicado"] as const).filter((s) => s !== p.status).map((s) => (
            <form key={s} action={marcarPost} style={{ display: "inline" }}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value={s} /><button style={small}>Marcar como {s}</button></form>
          ))}
          <form action={apagarPost} style={{ display: "inline" }}><input type="hidden" name="id" value={p.id} /><button style={small}>Apagar</button></form>
        </article>
      ))}
    </>
  );
}

export function ConexoesTab({ conns }: { conns: Conn[] }) {
  return (
    <>
      <form action={criarConexao} style={card}>
        <strong>Nova conexão</strong>
        <input name="name" placeholder="Nome" required style={input} />
        <input name="company" placeholder="Empresa" style={input} />
        <input name="role" placeholder="Cargo (ex.: recrutadora)" style={input} />
        <input name="profile_url" placeholder="Link do perfil no LinkedIn" style={input} />
        <input name="note" placeholder="Anotação" style={input} />
        <label style={{ fontSize: 14 }}>Retomar contato em</label>
        <input name="follow_up_at" type="date" style={input} />
        <button style={btn}>Salvar</button>
      </form>
      <p style={{ color: "#aab2bd", fontSize: 14 }}>Você controla cada convite e mensagem. O app guarda quem abordar e quando retomar, sem automatizar envios.</p>
      {conns.length === 0 && <p>Nenhuma conexão cadastrada.</p>}
      {conns.map((c) => (
        <article key={c.id} style={card}>
          <strong>{c.profile_url ? <a href={c.profile_url} style={{ color: "#6aa7e8" }}>{c.name}</a> : c.name}</strong> · {STATUS_CONN[c.status]}
          <div style={{ color: "#aab2bd", fontSize: 14 }}>{[c.role, c.company].filter(Boolean).join(" · ")}{c.follow_up_at ? ` · retomar em ${new Date(c.follow_up_at + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}</div>
          {c.note && <p>{c.note}</p>}
          {Object.keys(STATUS_CONN).filter((s) => s !== c.status).map((s) => (
            <form key={s} action={mudarConexao} style={{ display: "inline" }}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value={s} /><button style={small}>{STATUS_CONN[s]}</button></form>
          ))}
          <form action={apagarConexao} style={{ display: "inline" }}><input type="hidden" name="id" value={c.id} /><button style={small}>Apagar</button></form>
        </article>
      ))}
    </>
  );
}
