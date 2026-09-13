// Formatting helpers shared by the header, timeline, text list and calendar export.
import { DateTime } from 'luxon';
import type { Plan, PlanEvent } from '../algorithm/types.ts';
import { DAYLIGHT_HOURS } from '../config.ts';
import { localHour } from '../algorithm/time.ts';
import { eventInstruction, type EventContext } from '../copy.ts';

export function zoneAt(plan: Plan, t: number): string {
  return t < plan.arrive ? plan.input.homeZone : plan.input.destZone;
}

export function dt(plan: Plan, t: number, zone = zoneAt(plan, t)): DateTime {
  return DateTime.fromMillis(t, { zone });
}

export function clock(plan: Plan, t: number, zone?: string): string {
  return dt(plan, t, zone).toFormat('HH:mm');
}

export function zoneAbbr(plan: Plan, t: number, zone?: string): string {
  return dt(plan, t, zone).toFormat('ZZZZ');
}

export function dayLabel(plan: Plan, t: number, zone?: string): string {
  return dt(plan, t, zone).toFormat('cccc d LLLL');
}

export function shortDay(plan: Plan, t: number, zone?: string): string {
  return dt(plan, t, zone).toFormat('ccc d LLL');
}

export function isPoint(e: PlanEvent): boolean {
  return e.end === e.start;
}

export function overlapsDaylight(plan: Plan, e: PlanEvent): boolean {
  const zone = zoneAt(plan, e.start);
  const step = 15 * 60_000;
  for (let t = e.start; t <= e.end; t += step) {
    const h = localHour(t, zone);
    if (h >= DAYLIGHT_HOURS.start && h < DAYLIGHT_HOURS.end) return true;
  }
  return false;
}

export function contextFor(plan: Plan, e: PlanEvent): EventContext {
  return { direction: plan.direction, daylight: overlapsDaylight(plan, e), endClock: clock(plan, e.end) };
}

export function instruction(plan: Plan, e: PlanEvent): string {
  return eventInstruction(e, contextFor(plan, e));
}

export function duration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
