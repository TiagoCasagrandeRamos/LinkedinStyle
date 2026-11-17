import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";

/** Recebe o PNG da arte (gerado no navegador) e guarda no bucket privado `art`. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { sb, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "login" }, { status: 401 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  const png = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (!png) return NextResponse.json({ error: "Envie um PNG." }, { status: 400 });
  if (bytes.length > 4_000_000) return NextResponse.json({ error: "Imagem grande demais." }, { status: 413 });
  const { data: post } = await sb.from("ls_posts").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!post) return NextResponse.json({ error: "post não encontrado" }, { status: 404 });
  const path = `${user.id}/${id}.png`;
  const up = await sb.storage.from("art").upload(path, bytes, { contentType: "image/png", upsert: true });
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
  await sb.from("ls_posts").update({ art_path: path }).eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
