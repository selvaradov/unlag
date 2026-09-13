// The whole plan input lives in the URL query string so a plan is bookmarkable.
import type { CaffeineHabit, PlanInput } from '../algorithm/types.ts';
import { DEFAULT_INPUT } from '../config.ts';

const KEYS = {
  homeZone: 'from',
  destZone: 'to',
  homeAirport: 'fromAp',
  destAirport: 'toAp',
  depart: 'dep',
  arrive: 'arr',
  habitualBed: 'bed',
  habitualWake: 'wake',
  travelDayWake: 'twake',
  preflightDays: 'pre',
  postDays: 'post',
  caffeine: 'caf',
  melatonin: 'mel',
  lightBox: 'box',
} as const;

export function defaultInput(): PlanInput {
  return JSON.parse(JSON.stringify(DEFAULT_INPUT));
}

export function readInput(search: string): PlanInput {
  const q = new URLSearchParams(search);
  const d = defaultInput();
  const num = (k: string, fallback: number) => {
    const v = Number(q.get(k));
    return q.has(k) && Number.isFinite(v) ? v : fallback;
  };
  const bool = (k: string, fallback: boolean) => (q.has(k) ? q.get(k) === '1' : fallback);
  const caffeine = q.get(KEYS.caffeine);
  return {
    homeZone: q.get(KEYS.homeZone) ?? d.homeZone,
    destZone: q.get(KEYS.destZone) ?? d.destZone,
    homeAirport: q.get(KEYS.homeAirport) ?? (q.has(KEYS.homeZone) ? undefined : d.homeAirport),
    destAirport: q.get(KEYS.destAirport) ?? (q.has(KEYS.destZone) ? undefined : d.destAirport),
    habitualBed: q.get(KEYS.habitualBed) ?? d.habitualBed,
    habitualWake: q.get(KEYS.habitualWake) ?? d.habitualWake,
    flight: { depart: q.get(KEYS.depart) ?? d.flight.depart, arrive: q.get(KEYS.arrive) ?? d.flight.arrive },
    travelDayWake: q.has(KEYS.travelDayWake) ? q.get(KEYS.travelDayWake) || undefined : d.travelDayWake,
    preflightDays: num(KEYS.preflightDays, d.preflightDays),
    postDays: num(KEYS.postDays, d.postDays),
    caffeine: (['none', 'regular', 'off'] as CaffeineHabit[]).includes(caffeine as CaffeineHabit)
      ? (caffeine as CaffeineHabit)
      : d.caffeine,
    melatonin: bool(KEYS.melatonin, d.melatonin),
    lightBox: bool(KEYS.lightBox, d.lightBox),
  };
}

export function writeInput(input: PlanInput): string {
  const q = new URLSearchParams();
  q.set(KEYS.homeZone, input.homeZone);
  q.set(KEYS.destZone, input.destZone);
  if (input.homeAirport) q.set(KEYS.homeAirport, input.homeAirport);
  if (input.destAirport) q.set(KEYS.destAirport, input.destAirport);
  q.set(KEYS.depart, input.flight.depart);
  q.set(KEYS.arrive, input.flight.arrive);
  q.set(KEYS.habitualBed, input.habitualBed);
  q.set(KEYS.habitualWake, input.habitualWake);
  q.set(KEYS.travelDayWake, input.travelDayWake ?? '');
  q.set(KEYS.preflightDays, String(input.preflightDays));
  q.set(KEYS.postDays, String(input.postDays));
  q.set(KEYS.caffeine, input.caffeine);
  q.set(KEYS.melatonin, input.melatonin ? '1' : '0');
  q.set(KEYS.lightBox, input.lightBox ? '1' : '0');
  return `?${q.toString()}`;
}
