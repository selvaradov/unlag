// The whole plan input lives in the URL query string so a plan is bookmarkable. The device also
// remembers the plan last shown, so the installed app reopens on it rather than at the start page.
import { generatePlan } from '../algorithm/generate.ts';
import type { CaffeineHabit, PlanInput } from '../algorithm/types.ts';
import { LIMITS, clampDays, isClock, isZone, planProblem } from '../algorithm/validate.ts';
import { DEFAULT_INPUT, PLAN_CODE } from '../config.ts';

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

const LAST_PLAN_KEY = 'unlag-last-plan';

export function defaultInput(): PlanInput {
  return JSON.parse(JSON.stringify(DEFAULT_INPUT));
}

// Reads a plan from the query string. Every value is checked and falls back to the example when
// it is missing or out of bounds, so nothing downstream sees an input it cannot plan.
export function readInput(search: string): PlanInput {
  const q = new URLSearchParams(search);
  const d = defaultInput();
  const zone = (k: string, fallback: string) => (isZone(q.get(k)) ? (q.get(k) as string) : fallback);
  const clock = (k: string, fallback: string) => (isClock(q.get(k)) ? (q.get(k) as string) : fallback);
  const bool = (k: string, fallback: boolean) => (q.has(k) ? q.get(k) === '1' : fallback);
  const code = (k: string) => {
    const v = q.get(k) ?? '';
    return /^[A-Z0-9]{3}$/.test(v) ? v : undefined;
  };
  const caffeine = q.get(KEYS.caffeine);
  const candidate: PlanInput = {
    homeZone: zone(KEYS.homeZone, d.homeZone),
    destZone: zone(KEYS.destZone, d.destZone),
    homeAirport: code(KEYS.homeAirport) ?? (q.has(KEYS.homeZone) ? undefined : d.homeAirport),
    destAirport: code(KEYS.destAirport) ?? (q.has(KEYS.destZone) ? undefined : d.destAirport),
    habitualBed: clock(KEYS.habitualBed, d.habitualBed),
    habitualWake: clock(KEYS.habitualWake, d.habitualWake),
    flight: { depart: q.get(KEYS.depart) ?? d.flight.depart, arrive: q.get(KEYS.arrive) ?? d.flight.arrive },
    travelDayWake: isClock(q.get(KEYS.travelDayWake)) ? (q.get(KEYS.travelDayWake) as string) : undefined,
    preflightDays: clampDays(q.get(KEYS.preflightDays), LIMITS.preflightDays, d.preflightDays),
    postDays: clampDays(q.get(KEYS.postDays), LIMITS.postDays, d.postDays),
    caffeine: (['none', 'regular', 'off'] as CaffeineHabit[]).includes(caffeine as CaffeineHabit)
      ? (caffeine as CaffeineHabit)
      : d.caffeine,
    melatonin: bool(KEYS.melatonin, d.melatonin),
    lightBox: bool(KEYS.lightBox, d.lightBox),
  };
  if (candidate.habitualBed === candidate.habitualWake) candidate.habitualWake = d.habitualWake;
  // A flight that cannot be planned is replaced by the example flight, zones and all.
  if (planProblem(candidate) !== null) {
    candidate.flight = { ...d.flight };
    candidate.homeZone = d.homeZone;
    candidate.destZone = d.destZone;
    candidate.homeAirport = d.homeAirport;
    candidate.destAirport = d.destAirport;
  }
  return candidate;
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

// True when the URL carries a plan of its own that can be drawn, rather than falling back to the example.
export function hasPlanInUrl(search: string): boolean {
  const q = new URLSearchParams(search);
  if (!q.has(KEYS.depart) || !q.has(KEYS.arrive)) return false;
  const read = readInput(search);
  return read.flight.depart === q.get(KEYS.depart) && read.flight.arrive === q.get(KEYS.arrive);
}

// True when the query string carries a plan whose scheduled days have not yet ended.
export function planStillRunning(search: string, now = Date.now()): boolean {
  if (!hasPlanInUrl(search)) return false;
  return generatePlan(readInput(search)).planEnd >= now;
}

export function rememberPlan(search: string): void {
  try {
    localStorage.setItem(LAST_PLAN_KEY, search);
  } catch {
    // Storage can be unavailable; the URL still carries the plan.
  }
}

// The remembered plan, or null when there is none or its days have ended.
export function rememberedPlan(): string | null {
  try {
    const search = localStorage.getItem(LAST_PLAN_KEY);
    return search && planStillRunning(search) ? search : null;
  } catch {
    return null;
  }
}

// A typed code with spaces, dashes and case forgiven, or null when it cannot be a code.
export function normaliseCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== PLAN_CODE.length) return null;
  return [...code].every((c) => PLAN_CODE.alphabet.includes(c)) ? code : null;
}

export function formatCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
