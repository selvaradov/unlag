// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { generatePlan } from '../src/algorithm/generate.ts';
import type { PlanInput } from '../src/algorithm/types.ts';
import { DEFAULT_INPUT } from '../src/config.ts';
import { toICS } from '../src/ui/ics.ts';
import { renderNowNext } from '../src/ui/nowNext.ts';
import { readInput, writeInput } from '../src/ui/state.ts';
import { renderTextList } from '../src/ui/textList.ts';
import { renderTimeline } from '../src/ui/timeline.ts';

const input: PlanInput = JSON.parse(JSON.stringify(DEFAULT_INPUT));
const plan = generatePlan(input);

describe('rendering', () => {
  it('draws one row per day with a longer row for the travel day', () => {
    const el = renderTimeline(plan, plan.depart);
    const rows = el.querySelectorAll('svg.row');
    expect(rows.length).toBeGreaterThanOrEqual(8);
    const widths = [...rows].map((r) => parseFloat((r as SVGElement).style.width));
    const normal = widths[0];
    expect(widths.filter((w) => w > normal)).toHaveLength(1);
    expect(el.querySelectorAll('.ev-sleep').length).toBeGreaterThan(5);
    expect(el.querySelectorAll('.tmin').length).toBe(plan.tmins.length);
  });

  it('shows the current instruction and the next one', () => {
    const el = renderNowNext(plan, plan.depart + 3_600_000);
    expect(el.querySelector('.now strong')?.textContent).toMatch(/Nap|Avoid|Flight|Caffeine/);
    expect(el.querySelector('.next strong')?.textContent).toBeTruthy();
  });

  it('lists every day in the text view', () => {
    const el = renderTextList(plan, plan.planStart);
    expect(el.querySelectorAll('h3').length).toBeGreaterThanOrEqual(8);
    expect(el.textContent).toContain('Sunglasses');
  });

  it('round trips the input through the URL', () => {
    expect(readInput(writeInput(input))).toEqual(input);
  });

  it('exports a calendar with alarms', () => {
    const ics = toICS(plan);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics.match(/BEGIN:VEVENT/g)!.length).toBeGreaterThan(20);
    expect(ics).toContain('TRIGGER:-PT10M');
    expect(ics).toContain('SUMMARY:Last caffeine');
  });
});
