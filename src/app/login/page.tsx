import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

async function entrar(formData: FormData) {
  "use server";
  const sb = await supabaseServer();
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const mode = String(formData.get("mode"));
  const { error } = mode === "signup"
    ? await sb.auth.signUp({ email, password })
    : await sb.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?erro=${encodeURIComponent(error.message)}`);
  redirect("/onboarding");
}

const input = { display: "block", width: "100%", padding: 10, margin: "6px 0 14px", borderRadius: 6, border: "1px solid #444", background: "#2b3138", color: "#fff", boxSizing: "border-box" as const };
const btn = { padding: "10px 16px", borderRadius: 6, border: 0, background: "#2F6FB5", color: "#fff", cursor: "pointer", marginRight: 8 };

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <>
      <h1>Entrar</h1>
      {erro && <p style={{ color: "#ff8a80" }}>{erro}</p>}
      <form action={entrar}>
        <label>E-mail<input style={input} name="email" type="email" required autoComplete="email" /></label>
        <label>Senha<input style={input} name="password" type="password" minLength={8} required autoComplete="current-password" /></label>
        <button style={btn} name="mode" value="signin">Entrar</button>
        <button style={{ ...btn, background: "#444" }} name="mode" value="signup">Criar conta</button>
      </form>
    </>
  );
}
