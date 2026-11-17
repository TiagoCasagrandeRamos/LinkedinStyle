import Link from "next/link";

export default function Home() {
  return (
    <>
      <h1>LinkedinStyle</h1>
      <p>Coleta vagas de boards públicos, pontua contra o seu currículo e deixa a candidatura pronta para você revisar e enviar.</p>
      <ul>
        <li>Vagas: Greenhouse, Lever, Ashby, Workable e Gupy, com rodada diária.</li>
        <li>Candidatura: o app monta o formulário inteiro e pergunta o que não souber.</li>
        <li>O envio final é sempre seu.</li>
      </ul>
      <p><Link href="/login" style={{ color: "#6aa7e8" }}>Entrar ou criar conta</Link></p>
      <p><Link href="/limites" style={{ color: "#6aa7e8" }}>Por que o app não envia a candidatura sozinho</Link></p>
    </>
  );
}
