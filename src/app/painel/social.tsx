import { gerarRascunho } from "./draft-actions";
import { sugerirConexoes } from "./network-actions";
import CopyButton from "./copy-button";
import { linkedinPeopleSearch } from "@/lib/network";
import { formatUsd } from "@/lib/llm/cost";
import { criarConexao, apagarConexao, apagarPost, criarPost, marcarPost, mudarConexao } from "./social-actions";

type Post = { id: string; title: string | null; body: string; pillar: string | null; language: string; status: string; scheduled_for: string | null };
type Conn = { invite_note: string | null; followup_message: string | null; reason: string | null; kind: string; id: string; name: string; company: string | null; role: string | null; profile_url: string | null; note: string | null; status: string; follow_up_at: string | null };

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

export type OutreachJob = { id: string; title: string; company: string; score: number };

export function ConexoesTab({ conns, jobs, connUsd, hasKey, minScore, usedToday }: { conns: Conn[]; jobs: OutreachJob[]; connUsd: number; hasKey: boolean; minScore: number; usedToday: { vaga: number; rede: number } }) {
  return (
    <>
      <form action={sugerirConexoes} style={{ ...card, borderColor: "#2F6FB5" }}>
        <strong>Sugerir conexões</strong>
        <p style={{ color: "#aab2bd", fontSize: 14 }}>O Claude procura na web pública pessoas que contratam ou atuam na área, traz o link do perfil e escreve a nota do convite e a mensagem para depois do aceite. Só entra quem tem link de perfil que apareceu na busca. Você confere, copia e envia no LinkedIn. O app não envia nada.</p>
        <p style={{ fontSize: 14 }}>Hoje: {usedToday.vaga} de 2 abordagens ligadas a vaga, {usedToday.rede} de 5 de construção de rede.</p>
        <label style={{ fontSize: 14 }}>Tipo</label>
        <select name="kind" style={input} defaultValue="vaga"><option value="vaga">Ligada a uma vaga (recrutador ou gestor)</option><option value="rede">Construção de rede (empresa-alvo)</option></select>
        <label style={{ fontSize: 14 }}>Vaga (só vagas com nota {minScore} ou mais)</label>
        <select name="jobId" style={input} defaultValue="">{jobs.length === 0 && <option value="">Nenhuma vaga elegível ainda</option>}{jobs.map((j) => <option key={j.id} value={j.id}>{j.score} · {j.title} · {j.company}</option>)}</select>
        <label style={{ fontSize: 14 }}>Empresa (para construção de rede)</label>
        <input name="company" placeholder="Nome da empresa" style={input} />
        <label style={{ fontSize: 14 }}>Área ou papel que procura</label>
        <input name="area" placeholder="ex.: gestor de projetos, recrutador de tecnologia" style={input} />
        <input type="hidden" name="usd" value={connUsd.toFixed(6)} />
        <button style={btn} disabled={!hasKey}>Autorizar e buscar (até {formatUsd(connUsd)})</button>
        <p style={{ color: "#aab2bd", fontSize: 14 }}>O valor inclui até 3 buscas na web (US$ 0,01 cada) e o texto gerado. Nada é cobrado até você tocar no botão. O custo real aparece depois.</p>
        {!hasKey && <p style={{ color: "#ffd180" }}>Cadastre a chave da API na etapa 3 do onboarding.</p>}
      </form>
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
          {c.reason && <p style={{ fontSize: 14, color: "#cfd6df" }}>Por que: {c.reason}</p>}
          {c.profile_url && <p><a href={c.profile_url} target="_blank" rel="noreferrer" style={{ color: "#6aa7e8" }}>Abrir perfil no LinkedIn</a> <span style={{ color: "#aab2bd", fontSize: 13 }}>(confira que é a pessoa certa antes de enviar)</span></p>}
          {c.invite_note && (<div style={{ background: "#2b3138", padding: 10, borderRadius: 6, margin: "8px 0" }}>
            <div style={{ fontSize: 13, color: "#aab2bd" }}>Nota do convite ({c.invite_note.length} de 200 caracteres)</div>
            <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{c.invite_note}</p><CopyButton text={c.invite_note} label="Copiar nota" />
          </div>)}
          {c.followup_message && (<div style={{ background: "#2b3138", padding: 10, borderRadius: 6, margin: "8px 0" }}>
            <div style={{ fontSize: 13, color: "#aab2bd" }}>Mensagem para o dia seguinte ao aceite</div>
            <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{c.followup_message}</p><CopyButton text={c.followup_message} label="Copiar mensagem" />
          </div>)}
          {c.company && <p style={{ fontSize: 13 }}><a href={linkedinPeopleSearch(c.company, c.role ?? "")} target="_blank" rel="noreferrer" style={{ color: "#6aa7e8" }}>Buscar mais pessoas de {c.company} no LinkedIn</a></p>}
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
