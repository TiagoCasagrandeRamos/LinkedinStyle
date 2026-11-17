"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { collectPending, discardPending, scorePending } from "@/lib/pipeline/db";
import { formatUsd } from "@/lib/llm/cost";

const volta = (msg: string): never => redirect(`/painel?msg=${encodeURIComponent(msg)}`);

/** Busca vagas nas fontes. Gratuito: não chama o Claude. */
export async function buscarVagas() {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  try {
    const r = await collectPending(sb, user.id);
    const erros = r.sourceErrors.length ? ` Erros: ${r.sourceErrors.join("; ")}` : "";
    volta(`${r.stored} vagas novas encontradas, aguardando a sua autorização para avaliar. Puladas: ${r.skipped.offTitle} fora do cargo, ${r.skipped.blocked} de empresas bloqueadas, ${r.skipped.known} já conhecidas.${erros}`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    volta(`Não busquei: ${(e as Error).message}`);
  }
}

/** Avalia as vagas pendentes com o Claude, só com o valor autorizado pelo usuário. */
export async function autorizarAvaliacao(formData: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const calls = Number(formData.get("calls"));
  const usd = Number(formData.get("usd"));
  if (!Number.isFinite(calls) || !Number.isFinite(usd) || calls <= 0) volta("Autorização inválida. Tente de novo.");
  try {
    const r = await scorePending(sb, user.id, { calls, usd });
    volta(`${r.scored} vagas avaliadas. Custo real: ${formatUsd(r.usd)} (${r.usage.input} tokens de entrada, ${r.usage.output} de saída).${r.left ? ` ${r.left} ainda aguardam uma nova autorização.` : ""}`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    volta(`Não avaliei: ${(e as Error).message}`);
  }
}

export async function descartarPendentes() {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  await discardPending(sb, user.id);
  volta("Vagas pendentes descartadas. Nada foi cobrado.");
}
