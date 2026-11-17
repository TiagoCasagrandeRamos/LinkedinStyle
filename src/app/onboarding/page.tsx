import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { detectLanguage } from "@/lib/language";
import { avancarDeCurriculos, concluir, confirmarCurriculo, enviarCurriculos, removerCurriculo, salvarChave, salvarConteudo, salvarVagas } from "./actions";
import PillarsEditor from "./pillars-editor";
import WritingEditor from "./writing-editor";
import { estimatePillars, usageCost } from "@/lib/llm/cost";
import { normalizeWeights } from "@/lib/writing/traits";
import type { Pillar } from "@/lib/pillars";

const S = {
  input: { display: "block", width: "100%", padding: 10, margin: "6px 0 14px", borderRadius: 6, border: "1px solid #444", background: "#2b3138", color: "#fff", boxSizing: "border-box" as const },
  btn: { padding: "10px 16px", borderRadius: 6, border: 0, background: "#2F6FB5", color: "#fff", cursor: "pointer", marginRight: 8 },
  ghost: { padding: "8px 12px", borderRadius: 6, border: "1px solid #555", background: "transparent", color: "#fff", cursor: "pointer" },
  card: { border: "1px solid #3a4048", borderRadius: 8, padding: 14, margin: "12px 0" },
  hint: { color: "#aab2bd", fontSize: 14, marginTop: -8 },
};
const STEPS = ["Currículos", "Vagas e financeiro", "Chave e conexões", "Pilares e cadência", "Perfil de escrita"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ etapa?: string; erro?: string }> }) {
  const { etapa, erro } = await searchParams;
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  await sb.from("ls_profiles").upsert({ user_id: user.id, email: user.email }, { onConflict: "user_id", ignoreDuplicates: true });
  const { data: prof } = await sb.from("ls_profiles").select("onboarding_step, onboarding_completed_at").eq("user_id", user.id).single();
  if (prof?.onboarding_completed_at && !etapa) redirect("/painel");
  const maxStep = Math.min(prof?.onboarding_step ?? 1, 5);
  const step = Math.min(Math.max(Number(etapa) || maxStep, 1), maxStep);

  return (
    <>
      <p style={{ color: "#aab2bd" }}>Etapa {step} de 5: {STEPS[step - 1]}</p>
      {erro && <p style={{ color: "#ff8a80" }}>{erro}</p>}
      {step === 1 && <Curriculos sb={sb} uid={user.id} />}
      {step === 2 && <Vagas />}
      {step === 3 && <Chave />}
      {step === 4 && <Conteudo sb={sb} uid={user.id} />}
      {step === 5 && <Escrita sb={sb} uid={user.id} />}
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

type SB = Awaited<ReturnType<typeof requireUser>>["sb"];

async function firstResume(sb: SB, uid: string): Promise<string> {
  const { data } = await sb.from("ls_resumes").select("text_content").eq("user_id", uid).not("confirmed_at", "is", null).order("language", { ascending: false }).limit(1);
  return (data?.[0]?.text_content as string | undefined) ?? "";
}

async function Conteudo({ sb, uid }: { sb: SB; uid: string }) {
  const [{ data: cs }, { data: prof }, { data: prefs }, resume] = await Promise.all([
    sb.from("ls_content_settings").select("pillars, posts_per_week, post_days, post_time, timezone, languages").eq("user_id", uid).maybeSingle(),
    sb.from("ls_profiles").select("llm_key_encrypted").eq("user_id", uid).single(),
    sb.from("ls_job_preferences").select("titles, preferred_sectors").eq("user_id", uid).maybeSingle(),
    firstResume(sb, uid),
  ]);
  const extra = ((prefs?.titles ?? []) as string[]).join().length + ((prefs?.preferred_sectors ?? []) as string[]).join().length;
  const estimate = usageCost(estimatePillars(resume.length, extra));
  const saved = ((cs?.pillars ?? []) as Pillar[]).filter((p) => p && typeof p === "object" && "keywords" in p);
  const days: number[] = cs?.post_days ?? [1, 3, 5];
  return (
    <>
      <h1>Pilares e cadência</h1>
      <form action={salvarConteudo}>
        <PillarsEditor initial={saved} estimateUsd={estimate} hasKey={Boolean(prof?.llm_key_encrypted)} />
        <label>Posts por semana<input style={S.input} name="postsPerWeek" type="number" min={0} max={14} defaultValue={cs?.posts_per_week ?? 3} /></label>
        <fieldset style={S.card}><legend>Dias de publicação</legend>
          {DIAS.map((d, i) => <label key={d} style={{ marginRight: 10 }}><input type="checkbox" name="postDays" value={i} defaultChecked={days.includes(i)} /> {d}</label>)}
        </fieldset>
        <label>Horário<input style={S.input} name="postTime" type="time" defaultValue={String(cs?.post_time ?? "09:00").slice(0, 5)} /></label>
        <label>Fuso horário<input style={S.input} name="timezone" defaultValue={cs?.timezone ?? "America/Sao_Paulo"} /></label>
        <fieldset style={S.card}><legend>Idiomas dos posts</legend>
          <label><input type="checkbox" name="languages" value="pt" defaultChecked={(cs?.languages ?? ["pt"]).includes("pt")} /> Português</label>{" "}
          <label><input type="checkbox" name="languages" value="en" defaultChecked={(cs?.languages ?? []).includes("en")} /> Inglês</label>
        </fieldset>
        <button style={S.btn}>Continuar</button>
      </form>
    </>
  );
}

async function Escrita({ sb, uid }: { sb: SB; uid: string }) {
  const [{ data: cs }, { data: prof }, resume] = await Promise.all([
    sb.from("ls_content_settings").select("writing_profile, avoid").eq("user_id", uid).maybeSingle(),
    sb.from("ls_profiles").select("llm_key_encrypted").eq("user_id", uid).single(),
    firstResume(sb, uid),
  ]);
  return (
    <>
      <h1>Perfil de escrita</h1>
      <form action={concluir}>
        <WritingEditor initial={normalizeWeights((cs?.writing_profile as { weights?: unknown } | null)?.weights)} initialAvoid={(cs?.avoid ?? []) as string[]} resumeChars={resume.length} hasKey={Boolean(prof?.llm_key_encrypted)} />
        <button style={S.btn}>Concluir</button>
      </form>
    </>
  );
}

function Chave() {
  return (
    <>
      <h1>Chave e conexões</h1>
      <form action={salvarChave}>
        <label>Chave da API da Anthropic (usada para pontuar vagas, sugerir pilares e gerar exemplos de escrita)
          <input style={S.input} name="llmKey" type="password" autoComplete="off" placeholder="sk-ant-..." />
        </label>
        <p style={S.hint}>Fica criptografada no banco, só você usa. Antes de cada uso pago o app mostra o custo estimado e só executa depois que você autorizar. Sem a chave você segue, mas as sugestões automáticas ficam desligadas.</p>
        <fieldset style={S.card}><legend>LinkedIn (opcional)</legend>
          <p>A conexão por OAuth entra na próxima versão. Por enquanto você pode colar links de vagas do LinkedIn para o app listar e pontuar.</p>
        </fieldset>
        <button style={S.btn}>Continuar</button>
      </form>
    </>
  );
}
