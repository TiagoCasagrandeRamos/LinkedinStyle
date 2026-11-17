import Link from "next/link";

export const metadata = { title: "Por que não há envio automático" };

export default function Limites() {
  return (
    <>
      <h1>Por que o app não envia a candidatura sozinho</h1>
      <p>O app prepara tudo: identificação, currículo no idioma da vaga e respostas das perguntas customizadas. O último clique fica com você. Isso é uma escolha de projeto, não uma limitação esquecida.</p>
      <h2>Greenhouse e Lever</h2>
      <p>Os dois têm endpoint oficial de submissão, mas a chave de acesso é emitida pelo empregador. Candidato não consegue uma. Qualquer outro caminho seria automação de navegador ou serviço que resolve captcha, o que viola os termos de uso e coloca a sua conta em risco.</p>
      <h2>LinkedIn Easy Apply</h2>
      <p>Não existe API para isso, e automatizar o clique tem risco real de banimento da conta. Fica fora do escopo. O que o app faz: se você colar o link de uma vaga do LinkedIn, ele lista e pontua a vaga como qualquer outra.</p>
      <h2>Regra para campos incertos</h2>
      <p>Pretensão salarial, disponibilidade, anos de experiência em uma ferramenta: se o app não tem certeza, ele pergunta. Nunca chuta. A resposta que você der fica salva no perfil para as próximas candidaturas.</p>
      <p><Link href="/" style={{ color: "#6aa7e8" }}>Voltar</Link></p>
    </>
  );
}
