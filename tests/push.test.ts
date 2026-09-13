import { describe, expect, it } from 'vitest';
import { generatePlan } from '../src/algorithm/generate.ts';
import type { PlanInput } from '../src/algorithm/types.ts';
import { DEFAULT_INPUT } from '../src/config.ts';
import { HOUR, MINUTE } from '../src/algorithm/time.ts';
import { dueMessages } from '../src/push/due.ts';

const input: PlanInput = JSON.parse(JSON.stringify(DEFAULT_INPUT));
const plan = generatePlan(input);

describe('due messages', () => {
  it('announces windows as they start, with the end time in the body', () => {
    const dark = plan.events.find(
      (e) => e.kind === 'dark' && e.start > plan.depart - 6 * HOUR && e.start < plan.depart,
    )!;
    const due = dueMessages(plan, dark.start - 5 * MINUTE, dark.start);
    expect(due.map((m) => m.title)).toContain('Avoid bright light');
    const m = due.find((x) => x.title === 'Avoid bright light')!;
    expect(m.body).toMatch(/^Until 09:45 BST\./);
  });

  it('announces the caffeine cutoff rather than the start of the window', () => {
    const caffeine = plan.events.find((e) => e.kind === 'caffeine' && e.start > plan.depart)!;
    expect(dueMessages(plan, caffeine.start - MINUTE, caffeine.start).some((m) => m.title.includes('caffeine'))).toBe(
      false,
    );
    const atEnd = dueMessages(plan, caffeine.end - MINUTE, caffeine.end);
    expect(atEnd.map((m) => m.title)).toContain('Last caffeine for today');
  });

  it('never announces the flight and returns nothing for an empty window', () => {
    expect(dueMessages(plan, plan.depart - MINUTE, plan.depart).some((m) => m.title === 'Flight')).toBe(false);
    expect(dueMessages(plan, plan.planEnd + HOUR, plan.planEnd + 2 * HOUR)).toEqual([]);
  });

  it('is exclusive at the start and inclusive at the end, so windows do not double up', () => {
    const light = plan.events.find((e) => e.kind === 'light' && e.start > plan.arrive)!;
    const before = dueMessages(plan, light.start - 5 * MINUTE, light.start);
    const after = dueMessages(plan, light.start, light.start + 5 * MINUTE);
    expect(before.filter((m) => m.key === `light-${light.start}`)).toHaveLength(1);
    expect(after.filter((m) => m.key === `light-${light.start}`)).toHaveLength(0);
  });
});
