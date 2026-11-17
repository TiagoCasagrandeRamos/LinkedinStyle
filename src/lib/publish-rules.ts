/** Janela máxima de atraso: passou disso, o app não publica sozinho e pede nova confirmação. */
export const MAX_LATE_HOURS = 6;

export interface DuePost { status: string; auto_publish: boolean; scheduled_for: string | null; body: string | null; failed: boolean; publishing_started_at: string | null }
export interface PublishCtx { enabled: boolean; tokenExpiresAt: string | null; avoidHits: number }

export type Decision = { ok: true } | { ok: false; reason: string; final: boolean };

/**
 * Decide se um post pode sair sozinho agora. `final: true` desliga a publicação automática
 * do post (precisa de nova confirmação); `final: false` só espera a próxima rodada.
 */
export function decidePublish(p: DuePost, c: PublishCtx, now = new Date()): Decision {
  if (p.status !== "agendado" || !p.auto_publish) return { ok: false, reason: "post fora de publicação automática", final: false };
  if (p.publishing_started_at) return { ok: false, reason: "já está em publicação", final: false };
  if (!p.scheduled_for || new Date(p.scheduled_for) > now) return { ok: false, reason: "ainda não chegou a hora", final: false };
  if (!c.enabled) return { ok: false, reason: "a publicação automática está desligada na página do LinkedIn", final: true };
  if (!c.tokenExpiresAt || new Date(c.tokenExpiresAt) <= now) return { ok: false, reason: "o LinkedIn não está conectado ou o acesso expirou. Reconecte", final: true };
  if (!p.body || p.body.trim().length < 20) return { ok: false, reason: "o texto está vazio", final: true };
  if (c.avoidHits > 0) return { ok: false, reason: `o texto tem ${c.avoidHits} ocorrência(s) do que você pediu para evitar. Corrija e confirme de novo`, final: true };
  const lateH = (now.getTime() - new Date(p.scheduled_for).getTime()) / 3_600_000;
  if (lateH > MAX_LATE_HOURS) return { ok: false, reason: `a hora marcada passou há mais de ${MAX_LATE_HOURS} horas e o post não saiu. Reagende e confirme de novo`, final: true };
  return { ok: true };
}
