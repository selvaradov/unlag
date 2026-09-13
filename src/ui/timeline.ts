// One SVG row per day. Rows tile a continuous UTC axis; the row containing the landing runs
// from home midnight to the next destination midnight, so it is longer than 24 hours.
import { DateTime } from 'luxon';
import type { Plan, PlanEvent } from '../algorithm/types.ts';
import { HOUR, type Interval, intersect } from '../algorithm/time.ts';
import { LEGEND, TMIN_LEGEND, eventTitle } from '../copy.ts';
import { clock, dayLabel, instruction, isPoint, zoneAbbr, zoneAt } from './format.ts';

const PX_PER_HOUR = 22;
const LEFT = 8;
const RIGHT = 8;
const ROW_HEIGHT = 74;
const LANE = {
  sleep: { y: 18, h: 22 },
  light: { y: 42, h: 12 },
  pill: { y: 56, h: 6 },
  axis: 66,
};
const TICK_EVERY_HOURS = 3;

interface Row {
  start: number;
  end: number;
}

function rows(plan: Plan): Row[] {
  const out: Row[] = [];
  let start = DateTime.fromMillis(plan.planStart, { zone: plan.input.homeZone }).startOf('day').toMillis();
  while (start < plan.planEnd) {
    const zone = zoneAt(plan, start);
    let end = DateTime.fromMillis(start, { zone }).plus({ days: 1 }).startOf('day').toMillis();
    if (start < plan.arrive && end > plan.arrive) {
      end = DateTime.fromMillis(plan.arrive, { zone: plan.input.destZone }).plus({ days: 1 }).startOf('day').toMillis();
    }
    out.push({ start, end });
    start = end;
  }
  return out;
}

function x(row: Row, t: number): number {
  return LEFT + ((t - row.start) / HOUR) * PX_PER_HOUR;
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function tickInstants(plan: Plan, row: Row): { t: number; label: string; zoneChange: boolean }[] {
  const ticks: { t: number; label: string; zoneChange: boolean }[] = [];
  let zone = zoneAt(plan, row.start);
  let t = DateTime.fromMillis(row.start, { zone });
  while (t.toMillis() < row.end) {
    ticks.push({ t: t.toMillis(), label: t.toFormat('HH'), zoneChange: false });
    let next = t.plus({ hours: TICK_EVERY_HOURS });
    if (t.toMillis() < plan.arrive && next.toMillis() >= plan.arrive) {
      zone = plan.input.destZone;
      next = DateTime.fromMillis(plan.arrive, { zone }).startOf('hour');
      if (next.hour % TICK_EVERY_HOURS !== 0)
        next = next.plus({ hours: TICK_EVERY_HOURS - (next.hour % TICK_EVERY_HOURS) });
      ticks.push({ t: next.toMillis(), label: next.toFormat('HH'), zoneChange: true });
      next = next.plus({ hours: TICK_EVERY_HOURS });
    }
    t = next;
  }
  return ticks;
}

function title(plan: Plan, e: PlanEvent): string {
  const when = isPoint(e)
    ? `${clock(plan, e.start)} ${zoneAbbr(plan, e.start)}`
    : `${clock(plan, e.start)} to ${clock(plan, e.end)} ${zoneAbbr(plan, e.end)}`;
  return `${eventTitle(e)}. ${when}. ${instruction(plan, e)}`;
}

function drawEvent(g: SVGGElement, plan: Plan, row: Row, e: PlanEvent, clip: Interval): void {
  const x0 = x(row, clip.start);
  const x1 = x(row, clip.end);
  const w = Math.max(x1 - x0, 1);
  let shape: SVGElement;
  switch (e.kind) {
    case 'sleep':
    case 'nap':
    case 'flight':
      shape = svgEl('rect', {
        x: x0,
        y: LANE.sleep.y,
        width: w,
        height: LANE.sleep.h,
        rx: 2,
        class: `ev ev-${e.kind}`,
      });
      break;
    case 'light':
    case 'dark':
      shape = svgEl('rect', {
        x: x0,
        y: LANE.light.y,
        width: w,
        height: LANE.light.h,
        rx: 2,
        class: `ev ev-${e.kind}`,
      });
      break;
    case 'caffeine':
      shape = svgEl('rect', { x: x0, y: LANE.pill.y, width: w, height: LANE.pill.h, rx: 3, class: 'ev ev-caffeine' });
      break;
    case 'caffeineDose':
    case 'melatonin':
      shape = svgEl('circle', { cx: x0, cy: LANE.pill.y + LANE.pill.h / 2, r: 4.5, class: `ev ev-${e.kind}` });
      break;
  }
  if (e.optional) shape.classList.add('optional');
  const t = svgEl('title', {});
  t.textContent = title(plan, e);
  shape.appendChild(t);
  g.appendChild(shape);
}

export function renderTimeline(plan: Plan, now: number): HTMLElement {
  const root = document.createElement('section');
  root.className = 'timeline';
  for (const row of rows(plan)) {
    const zoneStart = zoneAt(plan, row.start);
    const zoneEnd = zoneAt(plan, row.end - 1);
    const head = document.createElement('h3');
    head.textContent =
      zoneStart === zoneEnd
        ? `${dayLabel(plan, row.start, zoneStart)}, ${zoneAbbr(plan, row.start, zoneStart)}`
        : `${dayLabel(plan, row.start, zoneStart)}, ${zoneAbbr(plan, row.start, zoneStart)} to ${zoneAbbr(plan, row.end - 1, zoneEnd)}`;
    root.appendChild(head);

    const width = x(row, row.end) + RIGHT;
    const svg = svgEl('svg', {
      viewBox: `0 0 ${width} ${ROW_HEIGHT}`,
      width,
      height: ROW_HEIGHT,
      class: 'row',
      role: 'img',
    });
    svg.appendChild(svgEl('line', { x1: LEFT, x2: width - RIGHT, y1: LANE.axis, y2: LANE.axis, class: 'axis' }));
    for (const tick of tickInstants(plan, row)) {
      const tx = x(row, tick.t);
      svg.appendChild(svgEl('line', { x1: tx, x2: tx, y1: LANE.axis, y2: LANE.axis + 4, class: 'axis' }));
      const label = svgEl('text', { x: tx, y: LANE.axis + 12, class: `tick${tick.zoneChange ? ' zone-change' : ''}` });
      label.textContent = tick.label;
      svg.appendChild(label);
    }
    const g = svgEl('g', {});
    const order: PlanEvent['kind'][] = [
      'flight',
      'sleep',
      'nap',
      'light',
      'dark',
      'caffeine',
      'caffeineDose',
      'melatonin',
    ];
    for (const kind of order) {
      for (const e of plan.events.filter((ev) => ev.kind === kind)) {
        if (isPoint(e)) {
          if (e.start >= row.start && e.start < row.end) drawEvent(g, plan, row, e, { start: e.start, end: e.start });
          continue;
        }
        const clip = intersect(e, row);
        if (clip) drawEvent(g, plan, row, e, clip);
      }
    }
    svg.appendChild(g);
    for (const tm of plan.tmins) {
      if (tm.at >= row.start && tm.at < row.end) {
        const tx = x(row, tm.at);
        const tri = svgEl('path', {
          d: `M${tx - 4},${LANE.axis + 1} L${tx + 4},${LANE.axis + 1} L${tx},${LANE.axis - 5} Z`,
          class: 'tmin',
        });
        const t = svgEl('title', {});
        t.textContent = `${TMIN_LEGEND}, ${clock(plan, tm.at)} ${zoneAbbr(plan, tm.at)}`;
        tri.appendChild(t);
        svg.appendChild(tri);
      }
    }
    if (now >= row.start && now < row.end) {
      const nx = x(row, now);
      svg.appendChild(svgEl('line', { x1: nx, x2: nx, y1: 6, y2: LANE.axis, class: 'now-line' }));
    }
    const scroller = document.createElement('div');
    scroller.className = 'row-scroll';
    scroller.appendChild(svg);
    root.appendChild(scroller);
  }

  const legend = document.createElement('ul');
  legend.className = 'legend';
  for (const item of LEGEND) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="swatch ev-${item.kind}"></span>${item.label}`;
    legend.appendChild(li);
  }
  const tminItem = document.createElement('li');
  tminItem.innerHTML = `<span class="swatch tmin-swatch"></span>${TMIN_LEGEND}`;
  legend.appendChild(tminItem);
  root.appendChild(legend);
  return root;
}
