// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { generatePlan } from '../src/algorithm/generate.ts';
import type { PlanInput } from '../src/algorithm/types.ts';
import { DEFAULT_INPUT } from '../src/config.ts';
import { HOUR } from '../src/algorithm/time.ts';
import { dayRows, renderDayList } from '../src/ui/dayList.ts';
import { DEFAULT_PX_PER_HOUR, FEED_PAD_TOP, feedItems, metrics, renderFeed, timeAt, yOf } from '../src/ui/feed.ts';
import { composeHeadline } from '../src/ui/headline.ts';
import { toICS } from '../src/ui/ics.ts';
import { readInput, writeInput } from '../src/ui/state.ts';

const input: PlanInput = JSON.parse(JSON.stringify(DEFAULT_INPUT));
const plan = generatePlan(input);
const px = DEFAULT_PX_PER_HOUR;
const axisTime = () => timeAt(plan, FEED_PAD_TOP, 56);
const opts = (now: number) => ({ pxPerHour: px, width: 400, now, selected: null, onSelect: () => {} });

describe('feed', () => {
  it('adds a no more caffeine stretch after each caffeine window', () => {
    const items = feedItems(plan);
    const ok = items.filter((i) => i.look === 'caffeine');
    const no = items.filter((i) => i.look === 'noCaffeine');
    expect(no.length).toBe(ok.length);
    for (const n of no) expect(n.event.end).toBeGreaterThan(n.event.start);
  });

  it('keeps day labels clear of the stations and the top edge', () => {
    for (const width of [400, 760]) {
      const el = renderFeed(plan, { ...opts(plan.depart), width });
      const labels = [...el.querySelectorAll<SVGTextElement>('text.day-label')];
      expect(labels.length).toBeGreaterThanOrEqual(8);
      const stations = [...el.querySelectorAll<SVGCircleElement>('circle.station, circle.dot')].map((c) => ({
        x: Number(c.getAttribute('cx')),
        y: Number(c.getAttribute('cy')),
        r: Number(c.getAttribute('r')),
      }));
      for (const l of labels) {
        const y = Number(l.getAttribute('y'));
        const xEnd = Number(l.getAttribute('x'));
        expect(y).toBeGreaterThan(12);
        for (const s of stations) {
          const rowsOverlap = Math.abs(s.y - y + 4) < s.r + 8;
          const colsOverlap = s.x + s.r > xEnd - 170;
          expect(rowsOverlap && colsOverlap).toBe(false);
        }
      }
      // Side labels never sit on the same row as a day label.
      const sideYs = [...el.querySelectorAll<SVGTextElement>('text.side-title')].map((t) =>
        Number(t.getAttribute('y')),
      );
      for (const l of labels) {
        const y = Number(l.getAttribute('y'));
        expect(sideYs.some((sy) => Math.abs(sy - y) < 12)).toBe(false);
      }
    }
  });

  it('lays labels out without overlaps at any zoom', () => {
    for (const px of [18, 30, 56, 120]) {
      for (const width of [390, 760]) {
        const el = renderFeed(plan, { ...opts(plan.depart), pxPerHour: px, width });
        const texts = [...el.querySelectorAll<SVGTextElement>('g.labels text')].map((t) => ({
          x: Number(t.getAttribute('x')),
          y: Number(t.getAttribute('y')),
          h: parseFloat(t.classList.contains('seg-title') || t.classList.contains('side-title') ? '16' : '13'),
        }));
        const lanes = new Map<number, typeof texts>();
        for (const t of texts) lanes.set(t.x, [...(lanes.get(t.x) ?? []), t]);
        for (const lane of lanes.values()) {
          lane.sort((a, b) => a.y - b.y);
          for (let i = 1; i < lane.length; i++)
            expect(lane[i].y - lane[i - 1].y).toBeGreaterThanOrEqual(lane[i - 1].h - 4);
        }
      }
    }
  });

  it('scales lines and text with the hour scale', () => {
    const small = metrics(20, 400);
    const normal = metrics(56, 400);
    const big = metrics(120, 400);
    expect(small.main).toBeLessThan(normal.main);
    expect(big.main).toBeGreaterThan(normal.main);
    expect(big.font).toBeGreaterThan(normal.font);
    expect(metrics(56, 760).main).toBeGreaterThan(normal.main);
    expect(yOf(plan, axisTime(), 56)).toBe(FEED_PAD_TOP);
  });

  it('draws one item per feed item, a day header per day and the landing marker', () => {
    const el = renderFeed(plan, opts(plan.depart));
    expect(el.querySelectorAll('g.item').length).toBe(feedItems(plan).length);
    expect(el.querySelectorAll('.day-head').length).toBeGreaterThanOrEqual(8);
    const landing = el.querySelector<SVGTextElement>('text.landing')!;
    expect(Number(landing.getAttribute('y')) - yOf(plan, plan.arrive, px)).toBeGreaterThan(6);
    expect(Number(landing.getAttribute('y')) - yOf(plan, plan.arrive, px)).toBeLessThan(30);
    expect(landing.textContent).toContain('13:35');
    expect(el.querySelector('#now')).not.toBeNull();
  });

  it('draws segments to scale and kinks the guide line at the flight', () => {
    const el = renderFeed(plan, opts(plan.depart));
    const sleep = el.querySelector<SVGLineElement>('g.look-sleep .seg')!;
    const y1 = Number(sleep.getAttribute('y1'));
    const y2 = Number(sleep.getAttribute('y2'));
    expect(y2 - y1).toBeCloseTo(8 * px - metrics(px, 400).main, 3);
    const guide = el.querySelector('path.guide')!.getAttribute('d')!;
    expect(guide).toMatch(/l\d+,/);
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
    expect(el.querySelector('text.zone-break-label')?.textContent).toBe('PDT');
    expect(el.querySelector('rect.flight-band')).not.toBeNull();
  });

  it('marks the active segment', () => {
    const el = renderFeed(plan, opts(plan.depart - HOUR));
    expect(el.querySelector('g.item.active.look-dark')).not.toBeNull();
  });

  it('renders cached plans with the current scale, selection and time', () => {
    const cachedPlan = generatePlan(input);
    renderFeed(cachedPlan, opts(cachedPlan.depart - HOUR));
    for (const pxPerHour of [18, 56, 150]) {
      for (const width of [390, 760]) {
        const freshPlan = generatePlan(input);
        const selected = feedItems(cachedPlan).find((item) => item.look === 'sleep')!;
        const options = { ...opts(selected.event.start + HOUR), pxPerHour, width, selected };
        const cached = renderFeed(cachedPlan, options);
        const fresh = renderFeed(freshPlan, options);
        expect(cached.outerHTML).toBe(fresh.outerHTML);
        expect(cached.querySelector('g.item.selected.active.look-sleep')).not.toBeNull();
      }
    }
  });

  it('keeps cached dates and labels separate when the trip changes', () => {
    const firstPlan = generatePlan(input);
    const first = renderFeed(firstPlan, opts(firstPlan.depart));
    const nextInput: PlanInput = {
      ...input,
      homeZone: 'America/Los_Angeles',
      destZone: 'Europe/London',
      flight: { depart: '2026-10-24T16:00', arrive: '2026-10-25T10:00' },
      preflightDays: 1,
      postDays: 2,
    };
    const nextPlan = generatePlan(nextInput);
    const next = renderFeed(nextPlan, opts(nextPlan.depart));
    expect(next.querySelector('.day-head')?.getAttribute('data-day')).not.toBe(
      first.querySelector('.day-head')?.getAttribute('data-day'),
    );
    expect(next.outerHTML).toBe(renderFeed(generatePlan(nextInput), opts(nextPlan.depart)).outerHTML);
    expect(renderFeed(firstPlan, opts(firstPlan.depart)).outerHTML).toBe(first.outerHTML);
  });

  it('keeps touch targets attached while updating the drawing to each zoom', () => {
    const options = opts(plan.depart);
    const feed = renderFeed(plan, options);
    document.body.appendChild(feed);
    const targets = [...feed.querySelectorAll('svg.rail, g.item, text.hour-label, g.labels text')];
    const drawing = (root: HTMLElement) => {
      const copy = root.cloneNode(true) as HTMLElement;
      copy.querySelectorAll<HTMLElement | SVGElement>('[style]').forEach((element) => {
        if (element.style.display === 'none') element.remove();
      });
      return [...copy.querySelectorAll('*')]
        .map((element) => ({
          tag: element.tagName,
          attributes: [...element.attributes].map((attribute) => [attribute.name, attribute.value]).sort(),
          text: element.children.length ? '' : element.textContent,
        }))
        .map((element) => JSON.stringify(element))
        .sort();
    };
    for (const pxPerHour of [18, 150, 35, 56]) {
      const next = { ...options, pxPerHour };
      expect(renderFeed(plan, next, feed)).toBe(feed);
      expect(targets.every((target) => feed.contains(target))).toBe(true);
      expect(drawing(feed)).toEqual(drawing(renderFeed(plan, next)));
    }
    feed.remove();
  });

  it('uses current selection callbacks after an in-place drawing update', () => {
    const selected: (string | null)[] = [];
    const feed = renderFeed(plan, opts(plan.depart));
    renderFeed(
      plan,
      {
        ...opts(plan.depart),
        pxPerHour: 100,
        onSelect: (item) => selected.push(item?.look ?? null),
      },
      feed,
    );
    const item = feed.querySelector('g.look-sleep')!;
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(selected).toEqual(['sleep', null]);
  });

  it('renders viewport labels at the same positions as the complete plan', () => {
    for (const pxPerHour of [18, 56, 150]) {
      for (const width of [390, 760]) {
        const options = { ...opts(plan.depart), pxPerHour, width };
        const full = renderFeed(plan, options);
        for (const top of [0, yOf(plan, plan.arrive, pxPerHour), parseFloat(full.style.height) - 500]) {
          const viewport = { top, bottom: top + 500 };
          const part = renderFeed(plan, { ...options, viewport });
          const visibleLabels = (feed: HTMLElement) =>
            [...feed.querySelectorAll('g.labels text')]
              .filter(
                (label) => Number(label.getAttribute('y')) >= top && Number(label.getAttribute('y')) <= viewport.bottom,
              )
              .map((label) => label.outerHTML);
          expect(visibleLabels(part)).toEqual(visibleLabels(full));
          expect(part.style.height).toBe(full.style.height);
          expect(part.querySelectorAll('.hour-line').length).toBeLessThan(full.querySelectorAll('.hour-line').length);
          expect([...part.querySelectorAll('g.item title')].map((title) => title.textContent)).toEqual(
            [...full.querySelectorAll('g.item title')].map((title) => title.textContent),
          );
          expect(part.querySelectorAll('g.item[tabindex="0"]').length).toBe(full.querySelectorAll('g.item').length);
        }
      }
    }
  });

  it('maps y back to time', () => {
    expect(timeAt(plan, yOf(plan, plan.arrive, px), px)).toBeCloseTo(plan.arrive, 0);
  });
});

describe('headline', () => {
  it('writes a note to self with what is next folded in', () => {
    const { text, sub } = composeHeadline(plan, plan.depart - HOUR);
    expect(text).toBe('Sunglasses on until 09:45, then the flight at 10:35.');
    expect(sub).toMatch(/^Sunglasses off in 10 min\./);
  });

  it('says when there is nothing to do and keeps caffeine as an aside', () => {
    const { text, sub } = composeHeadline(plan, plan.planStart + 3 * HOUR);
    expect(text).toMatch(/^Nothing until 20:00, then bright light\.$/);
    expect(sub).toContain('Caffeine is fine until');
  });

  it('names the evening light in the destination', () => {
    const { text } = composeHeadline(plan, plan.arrive + 5 * HOUR);
    expect(text).toMatch(/^Get outside in the light until 22:00, then/);
  });
});

describe('day list', () => {
  it('retains each day interval for scroll highlighting across zone changes', () => {
    const now = plan.depart;
    const list = renderDayList(plan, now, () => {});
    const rows = dayRows(plan, now);
    const days = [...list.querySelectorAll<HTMLElement>('li')];
    expect(days.map((day) => [day.dataset.day, Number(day.dataset.start), Number(day.dataset.end)])).toEqual(
      rows.map((row) => [row.iso, row.start, row.end]),
    );
  });
  it('has one row per day with the night, the flight time on the travel day, and no empty last day', () => {
    const rows = dayRows(plan, plan.depart);
    const travel = rows.filter((r) => r.flight);
    expect(travel).toHaveLength(1);
    expect(travel[0].flight).toEqual({ kind: 'depart', time: '10:35' });
    expect(travel[0].sleep).toBe('22:00 to 07:00');
    expect(rows.filter((r) => r.today)).toHaveLength(1);
    expect(rows[rows.length - 1].sleep).not.toBeNull();
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
