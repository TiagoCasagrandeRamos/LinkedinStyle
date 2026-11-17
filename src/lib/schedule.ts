const DEFAULT_TZ = "America/Sao_Paulo";

function offsetMs(date: Date, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converte data e hora de parede num fuso para o instante UTC. */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz = DEFAULT_TZ): Date {
  const wall = Date.UTC(y, mo, d, h, mi);
  let utc = wall - offsetMs(new Date(wall), tz);
  utc = wall - offsetMs(new Date(utc), tz);
  return new Date(utc);
}

/** AAAA-MM-DD do dia local no fuso. */
export function dayKey(date: Date, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * Próximos horários de post, no fuso da pessoa, a partir dos dias da semana (0=dom) e do horário.
 * `takenDays` são dias (AAAA-MM-DD) que já têm post: o slot livre pula esses dias.
 */
export function nextSlots(days: number[], time: string, count: number, from = new Date(), tz = DEFAULT_TZ, takenDays: Set<string> = new Set()): Date[] {
  const [h, m] = time.split(":").map(Number);
  const set = new Set(days);
  const [y, mo, d] = dayKey(from, tz).split("-").map(Number);
  const out: Date[] = [];
  for (let i = 0; out.length < count && i < 120; i++) {
    const cal = new Date(Date.UTC(y, mo - 1, d + i));
    if (!set.has(cal.getUTCDay())) continue;
    const slot = zonedToUtc(cal.getUTCFullYear(), cal.getUTCMonth(), cal.getUTCDate(), h, m || 0, tz);
    if (slot <= from || takenDays.has(dayKey(slot, tz))) continue;
    out.push(slot);
  }
  return out;
}
