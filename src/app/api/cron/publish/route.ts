import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { decryptSecret } from "@/lib/crypto";
import { buildPostBody, createPost, postUrl, uploadImage } from "@/lib/linkedin";
import { decidePublish } from "@/lib/publish-rules";
import { scanAvoid } from "@/lib/posts";

export const maxDuration = 60;

/**
 * Publica os posts agendados que a pessoa autorizou um a um. Chamado a cada poucos minutos
 * pelo pg_cron do Supabase (migração 0009). Não usa o Claude, então não gera custo de IA.
 */
export async function GET(req: Request) {
  const secrets = [process.env.PUBLISH_SECRET, process.env.CRON_SECRET].filter(Boolean);
  if (!secrets.length || !secrets.some((s) => req.headers.get("authorization") === `Bearer ${s}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY ausente" }, { status: 500 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, service, { auth: { persistSession: false } });

  const now = new Date();
  const { data: due } = await sb.from("ls_posts").select("*").eq("status", "agendado").eq("auto_publish", true).eq("failed", false)
    .is("publishing_started_at", null).lte("scheduled_for", now.toISOString()).order("scheduled_for").limit(10);
  const out: Record<string, string> = {};

  for (const p of due ?? []) {
    const [{ data: prof }, { data: auth }, { data: cs }] = await Promise.all([
      sb.from("ls_profiles").select("auto_publish_enabled").eq("user_id", p.user_id).maybeSingle(),
      sb.from("ls_linkedin_auth").select("*").eq("user_id", p.user_id).maybeSingle(),
      sb.from("ls_content_settings").select("avoid").eq("user_id", p.user_id).maybeSingle(),
    ]);
    const avoidHits = scanAvoid(p.body ?? "", (cs?.avoid ?? []) as string[]).hits.length;
    const d = decidePublish(p, { enabled: !!prof?.auto_publish_enabled, tokenExpiresAt: auth?.expires_at ?? null, avoidHits }, now);
    if (!d.ok) {
      if (d.final) {
        await sb.from("ls_posts").update({ auto_publish: false, failed: true, error: `Não publiquei sozinho: ${d.reason}.` }).eq("id", p.id);
        out[p.id] = `bloqueado: ${d.reason}`;
      }
      continue;
    }
    // trava: só uma rodada pega o post (evita publicar em dobro)
    const { data: claimed } = await sb.from("ls_posts").update({ publishing_started_at: now.toISOString() }).eq("id", p.id).is("publishing_started_at", null).select("id");
    if (!claimed?.length) continue;
    try {
      const token = decryptSecret(auth!.access_token_encrypted);
      let image: { urn: string; alt: string } | undefined;
      if (p.art_path) {
        const dl = await sb.storage.from("art").download(p.art_path);
        if (dl.data) image = { urn: await uploadImage(token, auth!.member_urn, new Uint8Array(await dl.data.arrayBuffer())), alt: p.art_phrase || p.title || "Arte do post" };
      }
      const urn = await createPost(token, buildPostBody(auth!.member_urn, p.body, image));
      await sb.from("ls_posts").update({ status: "publicado", published_at: new Date().toISOString(), published_urn: urn, published_url: postUrl(urn), auto_publish: false }).eq("id", p.id);
      out[p.id] = `publicado ${urn}`;
    } catch (e) {
      // não tenta de novo sozinho: pode ter saído parcialmente. A pessoa decide.
      await sb.from("ls_posts").update({ failed: true, auto_publish: false, error: (e as Error).message }).eq("id", p.id);
      out[p.id] = `falhou: ${(e as Error).message}`;
    }
  }
  return NextResponse.json({ checked: due?.length ?? 0, out });
}
