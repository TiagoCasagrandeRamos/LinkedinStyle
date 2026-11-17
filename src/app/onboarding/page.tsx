import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { detectLanguage } from "@/lib/language";
import { avancarDeCurriculos, concluir, confirmarCurriculo, enviarCurriculos, removerCurriculo, salvarConteudo, salvarVagas } from "./actions";

const S = {
  input: { display: "block", width: "100%", padding: 10, margin: "6px 0 14px", borderRadius: 6, border: "1px solid #444", background: "#2b3138", color: "#fff", boxSizing: "border-box" as const },
  btn: { padding: "10px 16px", borderRadius: 6, border: 0, background: "#2F6FB5", color: "#fff", cursor: "pointer", marginRight: 8 },
  ghost: { padding: "8px 12px", borderRadius: 6, border: "1px solid #555", background: "transparent", color: "#fff", cursor: "pointer" },
  card: { border: "1px solid #3a4048", borderRadius: 8, padding: 14, margin: "12px 0" },
  hint: { color: "#aab2bd", fontSize: 14, marginTop: -8 },
};
const STEPS = ["Currículos", "Vagas e financeiro", "Conteúdo", "Conexões e chave"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ etapa?: string; erro?: string }> }) {
  const { etapa, erro } = await searchParams;
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  await sb.from("ls_profiles").upsert({ user_id: user.id, email: user.email }, { onConflict: "user_id", ignoreDuplicates: true });
  const { data: prof } = await sb.from("ls_profiles").select("onboarding_step, onboarding_completed_at").eq("user_id", user.id).single();
  if (prof?.onboarding_completed_at && !etapa) redirect("/painel");
  const maxStep = Math.min(prof?.onboarding_step ?? 1, 4);
  const step = Math.min(Math.max(Number(etapa) || maxStep, 1), maxStep);

  return (
    <>
      <p style={{ color: "#aab2bd" }}>Etapa {step} de 4: {STEPS[step - 1]}</p>
      {erro && <p style={{ color: "#ff8a80" }}>{erro}</p>}
      {step === 1 && <Curriculos sb={sb} uid={user.id} />}
      {step === 2 && <Vagas />}
      {step === 3 && <Conteudo />}
      {step === 4 && <Conexoes />}
    </>
  );
}

async function Curriculos({ sb, uid }: { sb: Awaited<ReturnType<typeof requireUser>>["sb"]; uid: string }) {
  const { data } = await sb.from("ls_resumes").select("id, language, original_name, text_content, confirmed_at").eq("user_id", uid).order("created_at");
  const list = data ?? [];
  return (
    <>
      <h1>Seus currículos</h1>
      <p>Suba um em português, um em inglês, ou os dois. Na hora de candidatar, o app detecta o idioma da vaga e escolhe o currículo certo. Se só existir um idioma, ele usa esse e avisa.</p>
      <form action={enviarCurriculos} encType="multipart/form-data" style={S.card}>
        <label>Português (PDF ou DOCX)<input style={S.input} type="file" name="file_pt" accept=".pdf,.docx" /></label>
        <label>Inglês (PDF ou DOCX)<input style={S.input} type="file" name="file_en" accept=".pdf,.docx" /></label>
        <button style={S.btn}>Enviar</button>
      </form>
      {list.map((r) => {
        const det = detectLanguage(r.text_content ?? "");
        const diverge = det.confidence >= 0.6 && det.lang !== r.language;
        return (
          <section key={r.id} style={S.card}>
            <strong>{r.original_name}</strong> {r.confirmed_at ? "(validado)" : "(precisa da sua validação)"}
            {diverge && <p style={{ color: "#ffd180" }}>Marcado como {r.language === "pt" ? "português" : "inglês"}, mas o texto parece estar em {det.lang === "pt" ? "português" : "inglês"}. Confira o idioma abaixo.</p>}
            <form action={confirmarCurriculo}>
              <input type="hidden" name="id" value={r.id} />
              <label>Idioma
                <select style={S.input} name="language" defaultValue={diverge ? det.lang : r.language}>
                  <option value="pt">Português</option><option value="en">Inglês</option>
                </select>
              </label>
              <label>Texto extraído. Corrija o que a leitura do arquivo errou.
                <textarea style={{ ...S.input, minHeight: 200 }} name="text" defaultValue={r.text_content ?? ""} />
              </label>
              <button style={S.btn}>{r.confirmed_at ? "Salvar ajustes" : "Validar este currículo"}</button>
            </form>
            <form action={removerCurriculo} style={{ marginTop: 8 }}><input type="hidden" name="id" value={r.id} /><button style={S.ghost}>Remover</button></form>
          </section>
        );
      })}
      <form action={avancarDeCurriculos}><button style={S.btn}>Continuar</button></form>
    </>
  );
}

function Vagas() {
  return (
    <>
      <h1>Vagas e financeiro</h1>
      <form action={salvarVagas}>
        <label>Cargos que busca (um por linha ou separados por vírgula)<textarea style={S.input} name="titles" required /></label>
        <label>Nível (ex.: pleno, sênior)<input style={S.input} name="seniority" /></label>
        <fieldset style={S.card}><legend>Modalidade</legend>
          <label><input type="checkbox" name="workModes" value="remote" /> Remoto</label>{" "}
          <label><input type="checkbox" name="workModes" value="hybrid" /> Híbrido</label>{" "}
          <label><input type="checkbox" name="workModes" value="onsite" /> Presencial</label>
        </fieldset>
        <label>Cidades aceitas para híbrido ou presencial<input style={S.input} name="cities" /></label>
        <fieldset style={S.card}><legend>Financeiro</legend>
          <label>Moeda<input style={S.input} name="currency" defaultValue="BRL" maxLength={3} /></label>
          <label>Período<select style={S.input} name="salaryPeriod"><option value="month">Mensal</option><option value="year">Anual</option><option value="hour">Por hora</option></select></label>
          <label>Piso (abaixo disso a nota fica limitada a 60)<input style={S.input} name="salaryFloor" inputMode="decimal" /></label>
          <label>Valor desejado<input style={S.input} name="salaryTarget" inputMode="decimal" /></label>
          <label><input type="checkbox" name="contractTypes" value="clt" /> CLT</label>{" "}
          <label><input type="checkbox" name="contractTypes" value="pj" /> PJ</label>{" "}
          <label><input type="checkbox" name="contractTypes" value="freela" /> Freela</label>
          <p><label><input type="checkbox" name="freelanceOk" /> Aceito vagas freelance</label></p>
        </fieldset>
        <label>Setores preferidos (ganham bônus na nota)<input style={S.input} name="preferredSectors" /></label>
        <fieldset style={S.card}><legend>Empresas bloqueadas (obrigatório)</legend>
          <p style={S.hint}>Empresas que nunca devem aparecer: a atual, grupos relacionados, clientes que você atende.</p>
          <textarea style={S.input} name="blockedCompanies" />
          <label><input type="checkbox" name="blockedConfirmed" /> Revisei esta lista (pode estar vazia)</label>
        </fieldset>
        <label>Máximo de vagas por dia<input style={S.input} name="dailyJobLimit" type="number" defaultValue={5} min={1} max={50} /></label>
        <label>Nota mínima para sugerir abordagem a recrutadores<input style={S.input} name="minScoreOutreach" type="number" defaultValue={80} min={0} max={100} /></label>
        <button style={S.btn}>Continuar</button>
      </form>
    </>
  );
}

function Conteudo() {
  return (
    <>
      <h1>Conteúdo no LinkedIn</h1>
      <form action={salvarConteudo}>
        <label>Pilares de post, um por linha: Nome | #cor<textarea style={{ ...S.input, minHeight: 120 }} name="pillars" placeholder={"Gestão de projetos | #2F6FB5\nCarreira | #7C3AED"} required /></label>
        <label>Posts por semana<input style={S.input} name="postsPerWeek" type="number" min={0} max={14} defaultValue={3} /></label>
        <fieldset style={S.card}><legend>Dias de publicação</legend>
          {DIAS.map((d, i) => <label key={d} style={{ marginRight: 10 }}><input type="checkbox" name="postDays" value={i} defaultChecked={[1, 3, 5].includes(i)} /> {d}</label>)}
        </fieldset>
        <label>Horário<input style={S.input} name="postTime" type="time" defaultValue="09:00" /></label>
        <label>Fuso horário<input style={S.input} name="timezone" defaultValue="America/Sao_Paulo" /></label>
        <fieldset style={S.card}><legend>Idiomas dos posts</legend>
          <label><input type="checkbox" name="languages" value="pt" defaultChecked /> Português</label>{" "}
          <label><input type="checkbox" name="languages" value="en" /> Inglês</label>
        </fieldset>
        <label>Tom de voz<textarea style={S.input} name="tone" placeholder="Direto, pessoal, frases curtas" /></label>
        <label>O que evitar (um por linha)<textarea style={S.input} name="avoid" placeholder={"clichês de LinkedIn\nemojis"} /></label>
        <button style={S.btn}>Continuar</button>
      </form>
    </>
  );
}

function Conexoes() {
  return (
    <>
      <h1>Conexões e chave</h1>
      <form action={concluir}>
        <label>Chave da API da Anthropic (usada para pontuar vagas e ler formulários)
          <input style={S.input} name="llmKey" type="password" autoComplete="off" placeholder="sk-ant-..." />
        </label>
        <p style={S.hint}>Fica criptografada no banco, só você usa. Pode deixar em branco agora, mas a nota de requisitos só funciona com ela.</p>
        <fieldset style={S.card}><legend>LinkedIn (opcional)</legend>
          <p>A conexão por OAuth entra na próxima versão. Por enquanto você pode colar links de vagas do LinkedIn para o app listar e pontuar.</p>
        </fieldset>
        <button style={S.btn}>Concluir</button>
      </form>
    </>
  );
}
