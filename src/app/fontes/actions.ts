"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

export async function adicionarFonte(formData: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const company = String(formData.get("company") ?? "").trim() || null;
  if (!/^[a-z0-9_-]{2,60}$/.test(slug)) redirect(`/fontes?erro=${encodeURIComponent("Código inválido: use só letras, números, hífen ou underline")}`);
  const probe = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
  if (!probe.ok) redirect(`/fontes?erro=${encodeURIComponent(`Board "${slug}" não encontrado no Greenhouse`)}`);
  const { error } = await sb.from("ls_job_sources").insert({ user_id: user.id, kind: "greenhouse", slug_or_url: slug, company });
  if (error) redirect(`/fontes?erro=${encodeURIComponent(error.code === "23505" ? "Fonte já cadastrada" : error.message)}`);
  redirect("/fontes");
}

export async function removerFonte(formData: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  await sb.from("ls_job_sources").delete().eq("id", String(formData.get("id"))).eq("user_id", user.id);
  redirect("/fontes");
}
