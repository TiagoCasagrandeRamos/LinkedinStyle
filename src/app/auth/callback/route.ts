import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Destino do link de confirmação de e-mail do Supabase. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/onboarding", url.origin));
  }
  return NextResponse.redirect(new URL("/login?erro=" + encodeURIComponent("Link de confirmação inválido ou expirado"), url.origin));
}
