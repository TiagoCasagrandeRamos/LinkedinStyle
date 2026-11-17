import { describe, expect, it } from "vitest";
import { authUrl, buildPostBody, createPost, escapeLittleText, exchangeCode, explainError, postUrl, tokenDaysLeft } from "../src/lib/linkedin";
import { decidePublish, type DuePost } from "../src/lib/publish-rules";

describe("linkedin", () => {
  it("escapa os 15 caracteres reservados do little text", () => {
    expect(escapeLittleText("Q3 (alta de 40%) #IA @fulano [x] {y} <z> a_b *c* ~d | \\")).toBe("Q3 \\(alta de 40%\\) \\#IA \\@fulano \\[x\\] \\{y\\} \\<z\\> a\\_b \\*c\\* \\~d \\| \\\\");
    expect(escapeLittleText("texto simples, sem nada.")).toBe("texto simples, sem nada.");
  });
  it("monta o corpo do post com autor, visibilidade e imagem opcional", () => {
    const b = buildPostBody("urn:li:person:abc", "Olá (mundo)", { urn: "urn:li:image:1", alt: "alt" }) as Record<string, unknown>;
    expect(b.author).toBe("urn:li:person:abc");
    expect(b.commentary).toBe("Olá \\(mundo\\)");
    expect(b.lifecycleState).toBe("PUBLISHED");
    expect((b.content as { media: { id: string } }).media.id).toBe("urn:li:image:1");
    expect(buildPostBody("a", "t")).not.toHaveProperty("content");
  });
  it("monta a URL de autorização com os escopos de postagem", () => {
    const u = new URL(authUrl("cid", "https://app/cb", "st"));
    expect(u.searchParams.get("scope")).toBe("openid profile w_member_social");
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app/cb");
  });
  it("conta os dias que faltam do token", () => {
    expect(tokenDaysLeft("2026-11-27T00:00:00Z", new Date("2026-11-17T00:00:00Z"))).toBe(10);
  });
  it("explica erros em português", () => {
    expect(explainError(401, "")).toContain("Reconecte");
    expect(explainError(426, "")).toContain("LINKEDIN_VERSION");
    expect(explainError(429, "")).toContain("Limite diário");
  });
  it("cria o post com os cabeçalhos exigidos e lê o identificador", async () => {
    let seen: { url: string; headers: Record<string, string>; body: string } | null = null;
    const f = (async (url: string, init: RequestInit) => { seen = { url, headers: init.headers as Record<string, string>, body: String(init.body) }; return new Response("", { status: 201, headers: { "x-restli-id": "urn:li:share:123" } }); }) as unknown as typeof fetch;
    const urn = await createPost("tok", { a: 1 }, f);
    expect(urn).toBe("urn:li:share:123");
    expect(seen!.url).toBe("https://api.linkedin.com/rest/posts");
    expect(seen!.headers["X-Restli-Protocol-Version"]).toBe("2.0.0");
    expect(seen!.headers["Linkedin-Version"]).toMatch(/^\d{6}$/);
    expect(postUrl(urn)).toBe("https://www.linkedin.com/feed/update/urn:li:share:123/");
  });
  it("erro da API vira exceção com explicação", async () => {
    const f = (async () => new Response("denied", { status: 403 })) as unknown as typeof fetch;
    await expect(createPost("t", {}, f)).rejects.toThrow(/Share on LinkedIn/);
  });
  it("troca o código pelo token", async () => {
    const f = (async () => new Response(JSON.stringify({ access_token: "AQV", expires_in: 5184000 }), { status: 200 })) as unknown as typeof fetch;
    expect(await exchangeCode("c", "https://app/cb", "id", "sec", f)).toEqual({ token: "AQV", expiresIn: 5184000 });
    const bad = (async () => new Response(JSON.stringify({ error_description: "invalid" }), { status: 400 })) as unknown as typeof fetch;
    await expect(exchangeCode("c", "r", "i", "s", bad)).rejects.toThrow("invalid");
  });
});

describe("regras da publicação automática", () => {
  const now = new Date("2026-11-18T12:05:00Z");
  const post: DuePost = { status: "agendado", auto_publish: true, scheduled_for: "2026-11-18T12:00:00Z", body: "Um texto de post com mais de vinte caracteres.", failed: false, publishing_started_at: null };
  const ctx = { enabled: true, tokenExpiresAt: "2026-12-30T00:00:00Z", avoidHits: 0 };
  it("publica quando tudo está certo", () => expect(decidePublish(post, ctx, now)).toEqual({ ok: true }));
  it("não publica antes da hora nem sem consentimento do post", () => {
    expect(decidePublish({ ...post, scheduled_for: "2026-11-18T13:00:00Z" }, ctx, now)).toMatchObject({ ok: false, final: false });
    expect(decidePublish({ ...post, auto_publish: false }, ctx, now)).toMatchObject({ ok: false, final: false });
    expect(decidePublish({ ...post, publishing_started_at: "2026-11-18T12:01:00Z" }, ctx, now)).toMatchObject({ ok: false, final: false });
  });
  it("respeita o interruptor geral e o token", () => {
    expect(decidePublish(post, { ...ctx, enabled: false }, now)).toMatchObject({ ok: false, final: true });
    expect(decidePublish(post, { ...ctx, tokenExpiresAt: "2026-11-01T00:00:00Z" }, now)).toMatchObject({ ok: false, final: true });
    expect(decidePublish(post, { ...ctx, tokenExpiresAt: null }, now)).toMatchObject({ ok: false, final: true });
  });
  it("não publica texto com o que a pessoa pediu para evitar", () => {
    const r = decidePublish(post, { ...ctx, avoidHits: 2 }, now);
    expect(r).toMatchObject({ ok: false, final: true });
    expect((r as { reason: string }).reason).toContain("2 ocorrência");
  });
  it("não publica fora da janela de atraso", () => {
    expect(decidePublish(post, ctx, new Date("2026-11-18T19:00:00Z"))).toMatchObject({ ok: false, final: true });
  });
});
