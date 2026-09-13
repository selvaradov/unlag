// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { generatePlan } from '../src/algorithm/generate.ts';
import type { PlanInput } from '../src/algorithm/types.ts';
import { DEFAULT_INPUT } from '../src/config.ts';
import { HOUR } from '../src/algorithm/time.ts';
import { dayRows } from '../src/ui/dayList.ts';
import { DEFAULT_PX_PER_HOUR, feedItems, renderFeed, timeAt, yOf } from '../src/ui/feed.ts';
import { composeHeadline } from '../src/ui/headline.ts';
import { toICS } from '../src/ui/ics.ts';
import { readInput, writeInput } from '../src/ui/state.ts';

const input: PlanInput = JSON.parse(JSON.stringify(DEFAULT_INPUT));
const plan = generatePlan(input);
const px = DEFAULT_PX_PER_HOUR;
const opts = (now: number) => ({ pxPerHour: px, width: 400, now, selected: null, onSelect: () => {} });

describe('feed', () => {
  it('adds a no more caffeine stretch after each caffeine window', () => {
    const items = feedItems(plan);
    const ok = items.filter((i) => i.look === 'caffeine');
    const no = items.filter((i) => i.look === 'noCaffeine');
    expect(no.length).toBe(ok.length);
    for (const n of no) expect(n.event.end).toBeGreaterThan(n.event.start);
  });

  it('draws one item per feed item, a day header per day and the landing marker', () => {
    const el = renderFeed(plan, opts(plan.depart));
    expect(el.querySelectorAll('g.item').length).toBe(feedItems(plan).length);
    expect(el.querySelectorAll('.day-head').length).toBeGreaterThanOrEqual(8);
    const landing = el.querySelector<SVGTextElement>('text.landing')!;
    expect(Number(landing.getAttribute('y')) - 4).toBeCloseTo(yOf(plan, plan.arrive, px), 3);
    expect(landing.textContent).toContain('13:35');
    expect(el.querySelector('#now')).not.toBeNull();
  });

  it('draws segments to scale and kinks the guide line at the flight', () => {
    const el = renderFeed(plan, opts(plan.depart));
    const sleep = el.querySelector<SVGLineElement>('g.look-sleep .seg')!;
    const y1 = Number(sleep.getAttribute('y1'));
    const y2 = Number(sleep.getAttribute('y2'));
    expect(y2 - y1).toBeCloseTo(8 * px - 14, 3);
    const guide = el.querySelector('path.guide')!.getAttribute('d')!;
    expect(guide).toContain('l18,');
  });

  it('switches hour labels to the destination clock after landing', () => {
    const el = renderFeed(plan, { ...opts(plan.depart), width: 800 });
    const labels = [...el.querySelectorAll<SVGTextElement>('text.hour-label:not(.other)')];
    expect(el.querySelectorAll('text.hour-label.other').length).toBeGreaterThan(0);
    expect(renderFeed(plan, opts(plan.depart)).querySelectorAll('text.hour-label.other').length).toBe(0);
    const at = (t: number) =>
      labels.find((l) => Math.abs(Number(l.getAttribute('y')) - 4 - yOf(plan, t, px)) < 1)?.textContent;
    expect(at(plan.arrive - 95 * 60_000)).toBe('20:00');
    expect(at(plan.arrive + 25 * 60_000)).toBe('14:00');
  });

  it('marks the active segment', () => {
    const el = renderFeed(plan, opts(plan.depart - HOUR));
    expect(el.querySelector('g.item.active.look-dark')).not.toBeNull();
  });

  it('maps y back to time', () => {
    expect(timeAt(plan, yOf(plan, plan.arrive, px), px)).toBeCloseTo(plan.arrive, 0);
  });
});

describe('headline', () => {
  it('writes a note to self with what is next folded in', () => {
    const { text, sub } = composeHeadline(plan, plan.depart - HOUR);
    expect(text).toBe('sunglasses on until 09:45, then the flight at 10:35.');
    expect(sub).toContain('to go');
  });

  it('says when there is nothing to do and keeps caffeine as an aside', () => {
    const { text, sub } = composeHeadline(plan, plan.planStart + 3 * HOUR);
    expect(text).toMatch(/^nothing until 20:00, then bright light\.$/);
    expect(sub).toContain('Caffeine is fine until');
  });

  it('names the evening light in the destination', () => {
    const { text } = composeHeadline(plan, plan.arrive + 5 * HOUR);
    expect(text).toMatch(/^get outside in the light until 22:00, then/);
  });
});

describe('day list', () => {
  it('has one row per day with the sleep window and marks the travel day', () => {
    const rows = dayRows(plan, plan.depart);
    expect(rows.filter((r) => r.travel)).toHaveLength(1);
    expect(rows.find((r) => r.travel)?.sleep).toBe('22:00 to 07:00');
    expect(rows.filter((r) => r.today)).toHaveLength(1);
  });
});

describe('state and export', () => {
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
