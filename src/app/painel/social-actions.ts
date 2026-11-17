"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";

const postSchema = z.object({
  title: z.string().trim().max(200).optional(),
  body: z.string().trim().max(3000).optional(),
  pillar: z.string().trim().max(80).optional(),
  language: z.enum(["pt", "en"]),
  scheduled_for: z.string().optional(),
});

export async function criarPost(fd: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const p = postSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) redirect("/painel?aba=posts&msg=" + encodeURIComponent("Post inválido."));
  const when = p.data.scheduled_for ? new Date(p.data.scheduled_for) : null;
  await sb.from("ls_posts").insert({
    user_id: user.id, title: p.data.title || null, body: p.data.body ?? "", pillar: p.data.pillar || null,
    language: p.data.language, scheduled_for: when?.toISOString() ?? null, status: when ? "agendado" : "rascunho",
  });
  revalidatePath("/painel");
}

export async function marcarPost(fd: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const status = z.enum(["rascunho", "agendado", "publicado"]).parse(fd.get("status"));
  await sb.from("ls_posts").update({ status, published_at: status === "publicado" ? new Date().toISOString() : null })
    .eq("id", String(fd.get("id"))).eq("user_id", user.id);
  revalidatePath("/painel");
}

export async function apagarPost(fd: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  await sb.from("ls_posts").delete().eq("id", String(fd.get("id"))).eq("user_id", user.id);
  revalidatePath("/painel");
}

const connSchema = z.object({
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().max(120).optional(),
  role: z.string().trim().max(120).optional(),
  profile_url: z.string().trim().url().optional().or(z.literal("")),
  note: z.string().trim().max(500).optional(),
  follow_up_at: z.string().optional(),
});

export async function criarConexao(fd: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const c = connSchema.safeParse(Object.fromEntries(fd));
  if (!c.success) redirect("/painel?aba=conexoes&msg=" + encodeURIComponent("Preencha ao menos o nome (e use um link válido, se colocar)."));
  await sb.from("ls_connections").insert({
    user_id: user.id, name: c.data.name, company: c.data.company || null, role: c.data.role || null,
    profile_url: c.data.profile_url || null, note: c.data.note || null, follow_up_at: c.data.follow_up_at || null,
  });
  revalidatePath("/painel");
}

export async function mudarConexao(fd: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const status = z.enum(["para_abordar", "abordado", "respondeu", "conectado"]).parse(fd.get("status"));
  await sb.from("ls_connections").update({ status }).eq("id", String(fd.get("id"))).eq("user_id", user.id);
  revalidatePath("/painel");
}

export async function apagarConexao(fd: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  await sb.from("ls_connections").delete().eq("id", String(fd.get("id"))).eq("user_id", user.id);
  revalidatePath("/painel");
}
