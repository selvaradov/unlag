import { describe, expect, it } from 'vitest';
import { generatePlan } from '../src/algorithm/generate.ts';
import { clampDays, planProblem } from '../src/algorithm/validate.ts';
import { formatCode, hasPlanInUrl, normaliseCode, planStillRunning, readInput, writeInput } from '../src/ui/state.ts';
import { DEFAULT_INPUT } from '../src/config.ts';
import type { PlanInput } from '../src/algorithm/types.ts';

const base: PlanInput = JSON.parse(JSON.stringify(DEFAULT_INPUT));

describe('reading a plan from the URL', () => {
  it('clamps absurd day counts instead of looping', () => {
    const input = readInput('?dep=2026-09-16T10%3A35&arr=2026-09-16T13%3A35&pre=1e9&post=1e9');
    expect(input.preflightDays).toBe(3);
    expect(input.postDays).toBe(10);
    expect(() => generatePlan(input)).not.toThrow();
  });

  it('falls back to the example for unknown zones and malformed times', () => {
    const input = readInput(
      '?from=Mars%2FOlympus&bed=25%3A99&wake=07%3A00&dep=2026-09-16T10%3A35&arr=2026-09-16T13%3A35',
    );
    expect(input.homeZone).toBe(base.homeZone);
    expect(input.habitualBed).toBe(base.habitualBed);
  });

  it('replaces a backwards or overlong flight with the example flight', () => {
    const backwards = readInput('?dep=2026-09-16T10%3A35&arr=2026-09-15T13%3A35');
    expect(backwards.flight).toEqual(base.flight);
    const long = readInput('?dep=2026-09-16T10%3A35&arr=2026-09-20T13%3A35');
    expect(long.flight).toEqual(base.flight);
    expect(hasPlanInUrl('?dep=2026-09-16T10%3A35&arr=2026-09-15T13%3A35')).toBe(false);
    expect(hasPlanInUrl(writeInput(base))).toBe(true);
  });

  it('keeps a valid plan unchanged', () => {
    expect(readInput(writeInput(base))).toEqual(base);
  });
});

describe('plan codes', () => {
  it('forgives case, spaces and dashes', () => {
    expect(normaliseCode(' km7-4px ')).toBe('KM74PX');
    expect(normaliseCode('KM7 4PX')).toBe('KM74PX');
  });

  it('rejects the wrong length and letters that look like digits', () => {
    expect(normaliseCode('KM74P')).toBeNull();
    expect(normaliseCode('KM74PXA')).toBeNull();
    expect(normaliseCode('KM74P0')).toBeNull();
    expect(normaliseCode('KM74PI')).toBeNull();
  });

  it('shows a code in two groups', () => {
    expect(formatCode('KM74PX')).toBe('KM7 4PX');
  });
});

describe('planStillRunning', () => {
  const search = writeInput(base);
  const arrive = Date.parse('2026-09-16T20:35Z');

  it('is true while the scheduled days are still to come', () => {
    expect(planStillRunning(search, arrive)).toBe(true);
  });

  it('is false once the last day has ended', () => {
    expect(planStillRunning(search, arrive + 30 * 24 * 3_600_000)).toBe(false);
  });

  it('is false for a query string without a drawable plan', () => {
    expect(planStillRunning('', arrive)).toBe(false);
    expect(planStillRunning('?dep=2026-09-16T10%3A35&arr=2026-09-15T13%3A35', arrive)).toBe(false);
  });
});

describe('planProblem', () => {
  it('names each kind of problem', () => {
    expect(planProblem(base)).toBeNull();
    expect(planProblem({ ...base, habitualWake: base.habitualBed })).toBe('sleep');
    expect(planProblem({ ...base, flight: { depart: '2026-09-16T10:35', arrive: '2026-09-16T01:00' } })).toBe('order');
    expect(planProblem({ ...base, destZone: 'Nowhere/Here' })).toBe('zone');
    expect(planProblem({ ...base, preflightDays: 9 })).toBe('days');
  });

  it('clamps day counts', () => {
    expect(clampDays('1e9', { min: 0, max: 3 }, 3)).toBe(3);
    expect(clampDays('abc', { min: 0, max: 3 }, 2)).toBe(2);
    expect(clampDays(-4, { min: 1, max: 10 }, 5)).toBe(1);
  });
});
