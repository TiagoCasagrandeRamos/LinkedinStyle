/** Integração oficial do LinkedIn: login OAuth e API de posts (escopo w_member_social). */
export const LINKEDIN_VERSION = process.env.LINKEDIN_VERSION || "202510";
const API = "https://api.linkedin.com";

const RESERVED = /[\\|{}@[\]()<>#*_~]/g;
/** O campo commentary usa o "little text format": os caracteres reservados precisam de barra invertida. */
export const escapeLittleText = (t: string) => t.replace(RESERVED, (m) => `\\${m}`);

export const SCOPES = "openid profile w_member_social";

export function authUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, state, scope: SCOPES });
  return `https://www.linkedin.com/oauth/v2/authorization?${q}`;
}

export function buildPostBody(author: string, text: string, image?: { urn: string; alt: string }) {
  return {
    author,
    commentary: escapeLittleText(text),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
    ...(image ? { content: { media: { id: image.urn, altText: image.alt.slice(0, 300) } } } : {}),
  };
}

export const postUrl = (urn: string) => `https://www.linkedin.com/feed/update/${urn}/`;

export function tokenDaysLeft(expiresAt: string | Date, now = new Date()): number {
  return Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000);
}

const headers = (token: string, json = true) => ({
  Authorization: `Bearer ${token}`, "Linkedin-Version": LINKEDIN_VERSION, "X-Restli-Protocol-Version": "2.0.0", ...(json ? { "Content-Type": "application/json" } : {}),
});

/** Mensagens em português para os erros mais comuns da API. */
export function explainError(status: number, body: string): string {
  const detail = body.slice(0, 300);
  if (status === 401) return "O LinkedIn recusou o token (expirou ou foi revogado). Reconecte o LinkedIn.";
  if (status === 403) return `Sem permissão para publicar. Confira se o produto Share on LinkedIn está ativo no app e reconecte. ${detail}`;
  if (status === 426) return "A versão da API do LinkedIn saiu do ar. Atualize a variável LINKEDIN_VERSION no servidor.";
  if (status === 429) return "Limite diário de posts da API atingido. Tente amanhã.";
  if (status === 422) return `O LinkedIn não aceitou o texto. ${detail}`;
  return `O LinkedIn respondeu ${status}. ${detail}`;
}

type F = typeof fetch;

export async function exchangeCode(code: string, redirectUri: string, clientId: string, clientSecret: string, f: F = fetch) {
  const res = await f("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(j.error_description ?? `LinkedIn respondeu ${res.status} na troca do código`);
  return { token: j.access_token, expiresIn: j.expires_in ?? 5_184_000 };
}

export async function fetchMember(token: string, f: F = fetch) {
  const res = await f(`${API}/v2/userinfo`, { headers: { Authorization: `Bearer ${token}` } });
  const j = (await res.json().catch(() => ({}))) as { sub?: string; name?: string };
  if (!res.ok || !j.sub) throw new Error(`Não consegui ler o perfil (${res.status}). Confira o produto Sign In with LinkedIn using OpenID Connect.`);
  return { urn: `urn:li:person:${j.sub}`, name: j.name ?? null };
}

export async function uploadImage(token: string, ownerUrn: string, bytes: Uint8Array, f: F = fetch): Promise<string> {
  const init = await f(`${API}/rest/images?action=initializeUpload`, { method: "POST", headers: headers(token), body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }) });
  const txt = await init.text();
  if (!init.ok) throw new Error(explainError(init.status, txt));
  const v = (JSON.parse(txt) as { value?: { uploadUrl?: string; image?: string } }).value;
  if (!v?.uploadUrl || !v.image) throw new Error("O LinkedIn não devolveu o endereço de envio da imagem.");
  const put = await f(v.uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, body: bytes as unknown as BodyInit });
  if (!put.ok) throw new Error(`Falha ao enviar a imagem (${put.status}).`);
  return v.image;
}

export async function createPost(token: string, body: unknown, f: F = fetch): Promise<string> {
  const res = await f(`${API}/rest/posts`, { method: "POST", headers: headers(token), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(explainError(res.status, await res.text()));
  const urn = res.headers.get("x-restli-id");
  if (!urn) throw new Error("O LinkedIn aceitou o post mas não devolveu o identificador. Confira o seu feed antes de tentar de novo.");
  return urn;
}
