import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { chooseDirection, generatePlan } from '../src/algorithm/generate.ts';
import type { Plan, PlanEvent, PlanInput } from '../src/algorithm/types.ts';
import { DEFAULT_INPUT } from '../src/config.ts';
import { HOUR } from '../src/algorithm/time.ts';

const base: PlanInput = JSON.parse(JSON.stringify(DEFAULT_INPUT));

function local(plan: Plan, t: number): string {
  const zone = t < plan.arrive ? plan.input.homeZone : plan.input.destZone;
  return DateTime.fromMillis(t, { zone }).toFormat('ccc HH:mm');
}

function events(plan: Plan, kind: PlanEvent['kind']): string[] {
  return plan.events
    .filter((e) => e.kind === kind)
    .map((e) => (e.end === e.start ? local(plan, e.start) : `${local(plan, e.start)}-${local(plan, e.end)}`));
}

describe('chooseDirection', () => {
  it('delays for westward trips', () => {
    expect(chooseDirection(8)).toEqual({ direction: 'delay', total: 8 });
  });
  it('advances for modest eastward trips and delays for very long ones', () => {
    expect(chooseDirection(16)).toEqual({ direction: 'advance', total: 8 });
    expect(chooseDirection(14)).toEqual({ direction: 'delay', total: 14 });
  });
});

describe('London to San Francisco on UA 900', () => {
  const plan = generatePlan(base);

  it('is an eight hour delay', () => {
    expect(plan.direction).toBe('delay');
    expect(plan.totalShiftHours).toBe(8);
  });

  it('starts Tmin three hours before habitual wake and moves it later every day', () => {
    expect(local(plan, plan.tmins[0].at)).toBe('Sun 04:00');
    for (let i = 1; i < plan.tmins.length; i++) {
      const step = (plan.tmins[i].at - plan.tmins[i - 1].at) / HOUR - 24;
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThanOrEqual(2);
    }
  });

  it('earns less before the flight than after it', () => {
    const before = plan.tmins.filter((t) => t.at < plan.depart && t.earned > 0).map((t) => t.earned);
    const after = plan.tmins.filter((t) => t.at > plan.arrive && t.earned > 0).map((t) => t.earned);
    expect(Math.max(...before)).toBeLessThan(Math.min(...after));
  });

  it('never schedules a night shorter than six and a half hours', () => {
    for (const s of plan.events.filter((e) => e.kind === 'sleep' && !e.note)) {
      expect((s.end - s.start) / HOUR).toBeGreaterThanOrEqual(6.5);
    }
  });

  it('wakes at the fixed time on the travel day and pulls bedtime back to protect sleep', () => {
    expect(events(plan, 'sleep')).toContain('Wed 00:00-Wed 06:30');
  });

  it('asks for sunglasses from wake until the light would advance the clock', () => {
    expect(events(plan, 'dark')).toContain('Wed 06:30-Wed 09:45');
  });

  it('naps on the plane, not at the airport, and keeps caffeine until after the nap', () => {
    const nap = plan.events.find((e) => e.kind === 'nap');
    expect(nap).toBeDefined();
    expect(nap!.start).toBeGreaterThan(plan.depart);
    expect(nap!.end).toBeLessThan(plan.arrive);
    const caffeine = plan.events.filter((e) => e.kind === 'caffeine').find((e) => e.start >= plan.depart);
    expect(caffeine!.start).toBe(nap!.end);
  });

  it('puts the shifting light in the destination evening and bed early on the first night', () => {
    expect(events(plan, 'light')).toContain('Wed 18:00-Wed 22:00');
    expect(events(plan, 'sleep')).toContain('Wed 22:00-Thu 07:00');
  });

  it('never suggests a dose within an hour of the cutoff', () => {
    const cutoffs = plan.events.filter((e) => e.kind === 'caffeine').map((e) => e.end);
    for (const d of plan.events.filter((e) => e.kind === 'caffeineDose')) {
      const cutoff = cutoffs.find((c) => c > d.start)!;
      expect(cutoff - d.start).toBeGreaterThanOrEqual(HOUR);
    }
  });

  it('stops caffeine eight hours before bed for a non-user', () => {
    const wed = plan.events.filter((e) => e.kind === 'caffeine').find((e) => e.start >= plan.depart);
    expect(local(plan, wed!.end)).toBe('Wed 14:00');
  });

  it('offers melatonin only as an optional sleep aid on the first three destination nights', () => {
    const doses = plan.events.filter((e) => e.kind === 'melatonin');
    expect(doses).toHaveLength(3);
    expect(doses.every((d) => d.optional && d.start > plan.arrive)).toBe(true);
  });

  it('stops issuing light instructions once adapted', () => {
    expect(plan.adaptedAt).not.toBeNull();
    const after = plan.events.filter((e) => (e.kind === 'light' || e.kind === 'dark') && e.start > plan.adaptedAt!);
    expect(after).toHaveLength(0);
  });

  it('matches the reviewed snapshot', () => {
    const summary = plan.events.map((e) => `${e.kind} ${local(plan, e.start)} ${local(plan, e.end)} ${e.note ?? ''}`);
    expect({ tmins: plan.tmins.map((t) => local(plan, t.at)), summary }).toMatchSnapshot();
  });
});

describe('options', () => {
  it('drops caffeine and melatonin when switched off', () => {
    const plan = generatePlan({ ...base, caffeine: 'off', melatonin: false });
    expect(plan.events.some((e) => e.kind.startsWith('caffeine') || e.kind === 'melatonin')).toBe(false);
  });

  it('adapts sooner with a light box', () => {
    const plain = generatePlan(base);
    const boxed = generatePlan({ ...base, lightBox: true });
    expect(boxed.adaptedAt!).toBeLessThan(plain.adaptedAt!);
  });

  it('with no preflight days still schedules the night before travel', () => {
    const plan = generatePlan({ ...base, preflightDays: 0 });
    expect(events(plan, 'sleep')[0]).toBe('Tue 23:00-Wed 06:30');
  });
});

describe('landing late', () => {
  const flight = (arrive: string) =>
    generatePlan({ ...base, flight: { depart: '2026-09-16T10:35', arrive }, preflightDays: 1 });
  const firstNight = (plan: ReturnType<typeof generatePlan>) =>
    plan.events.find((e) => e.kind === 'sleep' && e.start >= plan.arrive)!;

  it('goes to bed soon after a late evening landing rather than the next night', () => {
    const plan = flight('2026-09-16T23:30');
    const night = firstNight(plan);
    expect(local(plan, night.start)).toBe('Thu 01:00');
    expect(local(plan, night.end)).toBe('Thu 07:30');
  });

  it('sleeps after a small hours landing and wakes at least the minimum later', () => {
    const plan = flight('2026-09-17T03:00');
    const night = firstNight(plan);
    expect(local(plan, night.start)).toBe('Thu 04:30');
    expect(local(plan, night.end)).toBe('Thu 11:00');
  });

  it("keeps tonight's bedtime after a daytime landing", () => {
    const plan = flight('2026-09-16T13:35');
    const night = firstNight(plan);
    expect(local(plan, night.start)).toBe('Wed 22:00');
  });

  it('sleeps early after an evening landing close to bedtime', () => {
    const plan = flight('2026-09-16T20:30');
    const night = firstNight(plan);
    expect(local(plan, night.start)).toBe('Wed 22:00');
    expect(local(plan, night.end)).toBe('Thu 07:00');
  });
});

describe('eastward overnight flight', () => {
  // San Francisco to London, leaving in the evening and landing the next afternoon.
  const plan = generatePlan({
    ...base,
    homeZone: 'America/Los_Angeles',
    destZone: 'Europe/London',
    flight: { depart: '2026-12-20T19:30', arrive: '2026-12-21T13:45' },
    travelDayWake: undefined,
    preflightDays: 2,
  });

  it('advances eight hours', () => {
    expect(plan.direction).toBe('advance');
    expect(plan.totalShiftHours).toBe(8);
  });

  it('sleeps on the plane during the body night', () => {
    const onBoard = plan.events.find((e) => e.kind === 'sleep' && e.note === 'onBoard');
    expect(onBoard).toBeDefined();
    expect(onBoard!.start).toBeGreaterThan(plan.depart);
    expect(onBoard!.end).toBeLessThan(plan.arrive);
  });

  it('seeks light after Tmin and avoids it before, with afternoon melatonin', () => {
    const light = plan.events.filter((e) => e.kind === 'light');
    const dark = plan.events.filter((e) => e.kind === 'dark');
    expect(light.length).toBeGreaterThan(0);
    expect(dark.length).toBeGreaterThan(0);
    const t1 = plan.tmins[1].at;
    expect(light.some((l) => l.start >= t1 && l.start < t1 + 8 * HOUR)).toBe(true);
    const mel = plan.events.filter((e) => e.kind === 'melatonin');
    expect(mel.length).toBeGreaterThan(0);
    expect(mel.every((m) => !m.optional)).toBe(true);
  });

  it('keeps the lights low through the evening before each preflight bedtime', () => {
    const preflightBeds = plan.events.filter((e) => e.kind === 'sleep' && e.start < plan.depart);
    expect(preflightBeds.length).toBeGreaterThan(0);
    for (const bed of preflightBeds) {
      const evening = plan.events.find((e) => e.kind === 'dark' && e.end === bed.start);
      expect(evening).toBeDefined();
      expect(bed.start - evening!.start).toBeGreaterThanOrEqual(2 * HOUR);
    }
  });
});
