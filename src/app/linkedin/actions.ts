"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

const back = (msg: string): never => redirect(`/linkedin?msg=${encodeURIComponent(msg)}`);

export async function alternarAutomatico(fd: FormData) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const on = fd.get("on") === "1";
  if (on) {
    const { data: li } = await sb.from("ls_linkedin_auth").select("expires_at").eq("user_id", user.id).maybeSingle();
    if (!li || new Date(li.expires_at) <= new Date()) back("Conecte o LinkedIn antes de ligar.");
  }
  await sb.from("ls_profiles").update({ auto_publish_enabled: on }).eq("user_id", user.id);
  if (!on) await sb.from("ls_posts").update({ auto_publish: false }).eq("user_id", user.id).eq("status", "agendado");
  back(on ? "Publicação automática ligada. Ela só vale para posts que você autorizar um a um." : "Publicação automática desligada. Os posts agendados voltaram para a sua aprovação final.");
}

export async function desconectar() {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  await sb.from("ls_linkedin_auth").delete().eq("user_id", user.id);
  await sb.from("ls_profiles").update({ auto_publish_enabled: false }).eq("user_id", user.id);
  await sb.from("ls_posts").update({ auto_publish: false }).eq("user_id", user.id).eq("status", "agendado");
  back("LinkedIn desconectado. Para revogar também no LinkedIn, remova o app em Configurações > Privacidade > Serviços de dados.");
}
