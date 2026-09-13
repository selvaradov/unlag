// Bounds on a plan's inputs, applied wherever untrusted values arrive: the URL, the walkthrough
// and stored notification subscriptions.
import { DateTime, IANAZone } from 'luxon';
import type { PlanInput } from './types.ts';

export const LIMITS = {
  preflightDays: { min: 0, max: 3 },
  postDays: { min: 1, max: 10 },
  // Longest flight the plan will draw, in hours.
  maxFlightHours: 48,
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOCAL = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

export function isZone(zone: unknown): zone is string {
  return typeof zone === 'string' && zone.length < 64 && IANAZone.isValidZone(zone);
}

export function isClock(t: unknown): t is string {
  return typeof t === 'string' && TIME.test(t);
}

export function clampDays(n: unknown, range: { min: number; max: number }, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(range.max, Math.max(range.min, Math.round(v)));
}

// Why an input cannot be planned, or null when it can.
export function planProblem(input: PlanInput): string | null {
  if (!isZone(input.homeZone) || !isZone(input.destZone)) return 'zone';
  if (!isClock(input.habitualBed) || !isClock(input.habitualWake)) return 'time';
  if (input.habitualBed === input.habitualWake) return 'sleep';
  if (input.travelDayWake !== undefined && !isClock(input.travelDayWake)) return 'time';
  if (!LOCAL.test(input.flight.depart) || !LOCAL.test(input.flight.arrive)) return 'flight';
  const dep = DateTime.fromISO(input.flight.depart, { zone: input.homeZone });
  const arr = DateTime.fromISO(input.flight.arrive, { zone: input.destZone });
  if (!dep.isValid || !arr.isValid) return 'flight';
  const hours = (arr.toMillis() - dep.toMillis()) / 3_600_000;
  if (hours <= 0) return 'order';
  if (hours > LIMITS.maxFlightHours) return 'length';
  if (input.preflightDays < LIMITS.preflightDays.min || input.preflightDays > LIMITS.preflightDays.max) return 'days';
  if (input.postDays < LIMITS.postDays.min || input.postDays > LIMITS.postDays.max) return 'days';
  return null;
}
