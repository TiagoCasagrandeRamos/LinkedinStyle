import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { collectPending } from "@/lib/pipeline/db";

export const maxDuration = 300;

/**
 * Coleta diária. Só busca e filtra vagas, de graça. A avaliação com o Claude
 * é paga e só roda quando o usuário autoriza o valor no painel.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY ausente" }, { status: 500 });
  const sb = createClient(url, service, { auth: { persistSession: false } });

  const { data: users } = await sb.from("ls_profiles").select("user_id").not("onboarding_completed_at", "is", null);
  const summary: Record<string, string> = {};
  for (const u of users ?? []) {
    try {
      const r = await collectPending(sb, u.user_id);
      summary[u.user_id] = `${r.stored} vagas novas aguardando autorização, ${r.sourceErrors.length} erros de fonte`;
    } catch (e) {
      summary[u.user_id] = `falhou: ${(e as Error).message}`;
    }
  }
  return NextResponse.json({ users: users?.length ?? 0, summary });
}
