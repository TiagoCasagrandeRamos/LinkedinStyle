import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";

export default async function Painel() {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const { data: prof } = await sb.from("ls_profiles").select("onboarding_completed_at").eq("user_id", user.id).single();
  if (!prof?.onboarding_completed_at) redirect("/onboarding");
  const { data: resumes } = await sb.from("ls_resumes").select("language").eq("user_id", user.id).not("confirmed_at", "is", null);
  const langs = [...new Set((resumes ?? []).map((r) => r.language))].join(" e ");
  return (
    <>
      <h1>Painel</h1>
      <p>Onboarding concluído. Currículos validados: {langs || "nenhum"}.</p>
      <p>As vagas coletadas e as candidaturas preparadas vão aparecer aqui.</p>
      <p><Link href="/onboarding?etapa=1" style={{ color: "#6aa7e8" }}>Revisar onboarding</Link></p>
    </>
  );
}
