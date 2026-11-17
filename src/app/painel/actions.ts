"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { runUserPipeline } from "@/lib/pipeline/db";

export async function rodarAgora() {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  let msg: string;
  try {
    const r = await runUserPipeline(sb, user.id);
    msg = `${r.stored} vagas novas pontuadas. Puladas: ${r.skipped.offTitle} fora do cargo, ${r.skipped.blocked} bloqueadas, ${r.skipped.known} já conhecidas${r.skipped.overLimit ? `, ${r.skipped.overLimit} acima do teto da rodada` : ""}.${r.sourceErrors.length ? ` Erros: ${r.sourceErrors.join("; ")}` : ""}`;
  } catch (e) {
    msg = `Não rodou: ${(e as Error).message}`;
  }
  redirect(`/painel?msg=${encodeURIComponent(msg)}`);
}
