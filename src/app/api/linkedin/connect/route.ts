import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/supabase/server";
import { authUrl } from "@/lib/linkedin";

export async function GET(req: Request) {
  const { user } = await requireUser();
  const origin = new URL(req.url).origin;
  if (!user) return NextResponse.redirect(`${origin}/login`);
  const id = process.env.LINKEDIN_CLIENT_ID;
  if (!id || !process.env.LINKEDIN_CLIENT_SECRET) return NextResponse.redirect(`${origin}/linkedin?msg=${encodeURIComponent("Faltam LINKEDIN_CLIENT_ID e LINKEDIN_CLIENT_SECRET no servidor.")}`);
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(authUrl(id, `${origin}/api/linkedin/callback`, state));
  res.cookies.set("li_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/linkedin" });
  return res;
}
