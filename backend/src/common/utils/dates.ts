export function todayInOffset(offset: string, now: Date = new Date()): string {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  const shifted = new Date(now.getTime() + sign * (h * 60 + m) * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function addDaysToDateString(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function endOfDayInOffset(date: string, offset: string): Date {
  return new Date(`${date}T23:59:59.999${offset}`);
}

export function formatDateBR(date: Date | string, offset = '-03:00'): string {
  const iso = typeof date === 'string' ? date.slice(0, 10) : todayInOffset(offset, date);
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
