import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { exchangeCode, fetchMember } from "@/lib/linkedin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const go = (msg: string) => { const r = NextResponse.redirect(`${url.origin}/linkedin?msg=${encodeURIComponent(msg)}`); r.cookies.delete({ name: "li_state", path: "/api/linkedin" }); return r; };
  const { sb, user } = await requireUser();
  if (!user) return NextResponse.redirect(`${url.origin}/login`);
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)li_state=([^;]+)/)?.[1];
  if (url.searchParams.get("error")) return go("Você cancelou a conexão no LinkedIn.");
  if (!cookie || cookie !== url.searchParams.get("state")) return go("A conexão expirou ou não confere. Tente de novo.");
  const code = url.searchParams.get("code");
  if (!code) return go("O LinkedIn não devolveu o código.");
  try {
    const { token, expiresIn } = await exchangeCode(code, `${url.origin}/api/linkedin/callback`, process.env.LINKEDIN_CLIENT_ID!, process.env.LINKEDIN_CLIENT_SECRET!);
    const member = await fetchMember(token);
    const { error } = await sb.from("ls_linkedin_auth").upsert({
      user_id: user.id, access_token_encrypted: encryptSecret(token), expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      member_urn: member.urn, member_name: member.name, connected_at: new Date().toISOString(),
    });
    if (error) return go(`Não consegui guardar a conexão: ${error.message}`);
    return go("LinkedIn conectado. A publicação automática continua desligada até você ligar.");
  } catch (e) {
    return go((e as Error).message);
  }
}
