import { DateTime } from 'luxon';

export interface Interval {
  start: number;
  end: number;
}

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export function hours(i: Interval): number {
  return (i.end - i.start) / HOUR;
}

export function intersect(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

// Remove every cut from the interval and return what is left, in order.
export function subtract(a: Interval, cuts: Interval[]): Interval[] {
  let pieces: Interval[] = [a];
  for (const c of cuts) {
    const next: Interval[] = [];
    for (const p of pieces) {
      if (c.end <= p.start || c.start >= p.end) {
        next.push(p);
        continue;
      }
      if (c.start > p.start) next.push({ start: p.start, end: c.start });
      if (c.end < p.end) next.push({ start: c.end, end: p.end });
    }
    pieces = next;
  }
  return pieces;
}

export function contains(cuts: Interval[], t: number): Interval | undefined {
  return cuts.find((c) => t >= c.start && t < c.end);
}

export function parseClock(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { hour: h, minute: m ?? 0 };
}

export function clockHours(hhmm: string): number {
  const { hour, minute } = parseClock(hhmm);
  return hour + minute / 60;
}

// Epoch ms of a wall clock time on a given local date in a zone.
export function atClock(dateISO: string, hhmm: string, zone: string): number {
  return DateTime.fromISO(dateISO, { zone }).set(parseClock(hhmm)).toMillis();
}

export function localISO(ms: number, zone: string): string {
  return DateTime.fromMillis(ms, { zone }).toISO({ suppressMilliseconds: true }) ?? '';
}

export function localDate(ms: number, zone: string): string {
  return DateTime.fromMillis(ms, { zone }).toISODate() ?? '';
}

export function addDays(dateISO: string, days: number, zone: string): string {
  return DateTime.fromISO(dateISO, { zone }).plus({ days }).toISODate() ?? '';
}

export function offsetMinutes(ms: number, zone: string): number {
  return DateTime.fromMillis(ms, { zone }).offset;
}

// Fractional local clock hour at an instant.
export function localHour(ms: number, zone: string): number {
  const d = DateTime.fromMillis(ms, { zone });
  return d.hour + d.minute / 60;
}

// Round to the nearest number of minutes.
export function roundTo(ms: number, minutes: number): number {
  const step = minutes * MINUTE;
  return Math.round(ms / step) * step;
}
