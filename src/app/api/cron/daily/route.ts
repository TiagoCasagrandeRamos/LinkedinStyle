import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { runUserPipeline } from "@/lib/pipeline/db";

export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY ausente" }, { status: 500 });
  const sb = createClient(url, service, { auth: { persistSession: false } });

  const { data: users } = await sb.from("ls_profiles").select("user_id").not("onboarding_completed_at", "is", null).not("llm_key_encrypted", "is", null);
  const summary: Record<string, string> = {};
  for (const u of users ?? []) {
    try {
      const r = await runUserPipeline(sb, u.user_id);
      summary[u.user_id] = `${r.stored} novas, ${r.sourceErrors.length} erros de fonte`;
    } catch (e) {
      summary[u.user_id] = `falhou: ${(e as Error).message}`;
    }
  }
  return NextResponse.json({ users: users?.length ?? 0, summary });
}
