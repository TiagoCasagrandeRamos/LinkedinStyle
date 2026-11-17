/** Próximos horários de post a partir dos dias da semana (0=dom) e do horário configurados. */
export function nextSlots(days: number[], time: string, count: number, from = new Date()): Date[] {
  const [h, m] = time.split(":").map(Number);
  const set = new Set(days);
  const out: Date[] = [];
  for (let i = 0; out.length < count && i < 60; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    d.setHours(h, m || 0, 0, 0);
    if (set.has(d.getDay()) && d > from) out.push(d);
  }
  return out;
}
