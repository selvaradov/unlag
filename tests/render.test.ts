// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { generatePlan } from '../src/algorithm/generate.ts';
import type { PlanInput } from '../src/algorithm/types.ts';
import { DEFAULT_INPUT } from '../src/config.ts';
import { HOUR } from '../src/algorithm/time.ts';
import { dayRows } from '../src/ui/dayList.ts';
import { PX_PER_HOUR, feedItems, renderFeed, yOf } from '../src/ui/feed.ts';
import { composeHeadline } from '../src/ui/headline.ts';
import { toICS } from '../src/ui/ics.ts';
import { readInput, writeInput } from '../src/ui/state.ts';

const input: PlanInput = JSON.parse(JSON.stringify(DEFAULT_INPUT));
const plan = generatePlan(input);
const noop = { onSelect: () => {} };

describe('feed', () => {
  it('adds an avoid caffeine stretch after each caffeine window', () => {
    const items = feedItems(plan);
    const ok = items.filter((i) => i.look === 'caffeine');
    const no = items.filter((i) => i.look === 'noCaffeine');
    expect(no.length).toBe(ok.length);
    for (const n of no) expect(n.event.end).toBeGreaterThan(n.event.start);
  });

  it('draws a pill per item, a day header per day and the landing divider', () => {
    // Day headers sit above pills so a capsule never covers the date.
    const feed = renderFeed(plan, plan.depart, noop);
    expect(feed.querySelector('.day-head')).not.toBeNull();
    const el = renderFeed(plan, plan.depart, noop);
    expect(el.querySelectorAll('.pill').length).toBe(feedItems(plan).length);
    expect(el.querySelectorAll('.day-head').length).toBeGreaterThanOrEqual(8);
    const landing = el.querySelector<HTMLElement>('.landing-divider')!;
    expect(parseFloat(landing.style.top)).toBeCloseTo(yOf(plan, plan.arrive), 3);
    expect(el.querySelector('#now')).not.toBeNull();
  });

  it('keeps pill heights proportional with a floor', () => {
    const el = renderFeed(plan, plan.depart, noop);
    const sleeps = [...el.querySelectorAll<HTMLElement>('.pill.look-sleep')];
    expect(sleeps.length).toBeGreaterThan(5);
    expect(parseFloat(sleeps[0].style.height)).toBeCloseTo(8 * PX_PER_HOUR, 3);
    for (const p of el.querySelectorAll<HTMLElement>('.pill:not(.dot)'))
      expect(parseFloat(p.style.height)).toBeGreaterThanOrEqual(40);
  });

  it('switches hour labels to the destination clock after landing', () => {
    const el = renderFeed(plan, plan.depart, noop);
    const labels = [...el.querySelectorAll<HTMLElement>('.hour-label.left')];
    const before = labels.find((l) => Math.abs(parseFloat(l.style.top) - yOf(plan, plan.arrive - 95 * 60_000)) < 1);
    const after = labels.find((l) => Math.abs(parseFloat(l.style.top) - yOf(plan, plan.arrive + 25 * 60_000)) < 1);
    expect(before?.textContent).toBe('20:00');
    expect(after?.textContent).toBe('14:00');
  });
});

describe('headline', () => {
  it('composes the active windows into a sentence', () => {
    const { text } = composeHeadline(plan, plan.depart - 60 * 60_000);
    expect(text).toBe('Avoid bright light');
    const evening = composeHeadline(plan, plan.arrive + 5 * HOUR);
    expect(evening.text).toMatch(/^See bright light/);
  });

  it('does not headline caffeine on its own', () => {
    const { text, sub } = composeHeadline(plan, plan.planStart + 3 * HOUR);
    expect(text).toMatch(/^Nothing to do until/);
    expect(sub).toContain('Caffeine is fine until');
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
