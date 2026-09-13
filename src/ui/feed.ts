// The vertical timeline, drawn as one metro style line. Time runs down. Sleep, light and
// avoid light are thick segments on the main line with a station at each start; the flight
// kinks the line; caffeine and melatonin run on a thin line to the right.
import { DateTime } from 'luxon';
import type { Plan, PlanEvent } from '../algorithm/types.ts';
import { HOUR, MINUTE } from '../algorithm/time.ts';
import { FEED, eventTitle } from '../copy.ts';
import { clock, duration, instruction, isPoint, zoneAbbr, zoneAt } from './format.ts';
import { ICONS, type IconName } from './icons.ts';

export const DEFAULT_PX_PER_HOUR = 56;
export const MIN_PX_PER_HOUR = 18;
export const MAX_PX_PER_HOUR = 150;

const LEFT_COL = 56;
const RIGHT_COL = 56;
// Below this width the other zone's hour column is dropped to make room for labels.
const NARROW = 480;
const MAIN_OFFSET = 40;
const KINK = 18;
const LABEL_GAP = 24;
const SIDE_LINE_OFFSET = 132;
const STATION_R = 11;
const DOT_R = 9;
const MAIN_W = 14;
const THIN_W = 2.5;

export interface FeedItem {
  event: PlanEvent;
  look: 'light' | 'dark' | 'caffeine' | 'noCaffeine' | 'caffeineDose' | 'melatonin' | 'sleep' | 'nap' | 'flight';
  icon: IconName;
  title: string;
  detail: string;
}

const LOOK_TO_ICON: Record<FeedItem['look'], IconName> = {
  light: 'sun',
  dark: 'noSun',
  caffeine: 'cup',
  noCaffeine: 'noCup',
  caffeineDose: 'cup',
  melatonin: 'pill',
  sleep: 'sleep',
  nap: 'moon',
  flight: 'plane',
};

// Plan events become feed items, plus the "no more caffeine" stretch that follows each caffeine window.
export function feedItems(plan: Plan): FeedItem[] {
  const items: FeedItem[] = [];
  const sleeps = plan.events.filter((e) => e.kind === 'sleep');
  const make = (
    event: PlanEvent,
    look: FeedItem['look'],
    title = eventTitle(event),
    detail = instruction(plan, event),
  ) => items.push({ event, look, icon: LOOK_TO_ICON[look], title, detail });
  for (const e of plan.events) {
    if (e.kind === 'caffeine') {
      make(e, 'caffeine');
      const nextSleep = sleeps.find((s) => s.start >= e.end);
      if (nextSleep && nextSleep.start - e.end > 30 * MINUTE) {
        make(
          { kind: 'caffeine', start: e.end, end: nextSleep.start },
          'noCaffeine',
          FEED.noCaffeineTitle,
          FEED.noCaffeineDetail,
        );
      }
    } else {
      make(e, e.kind);
    }
  }
  return items;
}

export function axisStart(plan: Plan): number {
  return DateTime.fromMillis(plan.planStart, { zone: plan.input.homeZone }).startOf('day').toMillis();
}

export function yOf(plan: Plan, t: number, px: number): number {
  return ((t - axisStart(plan)) / HOUR) * px;
}

export function timeAt(plan: Plan, y: number, px: number): number {
  return axisStart(plan) + (y / px) * HOUR;
}

interface Mark {
  t: number;
  hour: number;
  label: string;
  other: string;
  dayStart: boolean;
}

// Hour marks in the zone in effect, re-snapped to the destination clock at landing.
function hourMarks(plan: Plan): Mark[] {
  const out: Mark[] = [];
  let zone = zoneAt(plan, axisStart(plan));
  let t = DateTime.fromMillis(axisStart(plan), { zone });
  while (t.toMillis() <= plan.planEnd) {
    const ms = t.toMillis();
    const otherZone = zone === plan.input.homeZone ? plan.input.destZone : plan.input.homeZone;
    out.push({
      t: ms,
      hour: t.hour,
      label: t.toFormat('HH:mm'),
      other: DateTime.fromMillis(ms, { zone: otherZone }).toFormat('HH:mm'),
      dayStart: t.hour === 0 && t.minute === 0,
    });
    let next = t.plus({ hours: 1 });
    if (ms < plan.arrive && next.toMillis() > plan.arrive) {
      zone = plan.input.destZone;
      next = DateTime.fromMillis(plan.arrive, { zone }).startOf('hour').plus({ hours: 1 });
    }
    t = next;
  }
  return out;
}

function labelStep(px: number): number {
  if (px >= 40) return 1;
  if (px >= 22) return 2;
  if (px >= 12) return 3;
  return 6;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function icon(name: IconName, cx: number, cy: number, size: number, color: string): string {
  return ICONS[name].replace(
    '<svg class="icon ',
    `<svg x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" style="color:${color}" class="icon `,
  );
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (html) e.innerHTML = html;
  return e;
}

export interface FeedOptions {
  pxPerHour: number;
  width: number;
  now: number;
  selected: FeedItem | null;
  onSelect: (item: FeedItem | null) => void;
}

export function renderFeed(plan: Plan, opts: FeedOptions): HTMLElement {
  const { pxPerHour: px, width, now } = opts;
  const y = (t: number) => yOf(plan, t, px);
  const height = y(plan.planEnd) + px;
  const mainX = LEFT_COL + MAIN_OFFSET;
  const narrow = width < NARROW;
  const rightCol = narrow ? 10 : RIGHT_COL;
  const sideX = Math.min(width - rightCol - 120, mainX + SIDE_LINE_OFFSET);
  const labelX = mainX + LABEL_GAP;
  const items = feedItems(plan);
  const step = labelStep(px);

  const root = el('section', 'feed');
  root.style.height = `${height}px`;

  const svg: string[] = [];
  svg.push(
    `<svg class="rail" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`,
  );

  // Hour grid.
  for (const m of hourMarks(plan)) {
    if (m.dayStart) continue;
    const yy = y(m.t);
    const labelled = m.hour % step === 0;
    svg.push(
      `<line class="hour-line${labelled ? '' : ' minor'}" x1="${LEFT_COL}" x2="${width - rightCol}" y1="${yy}" y2="${yy}"/>`,
    );
    if (labelled) {
      svg.push(`<text class="hour-label" x="${LEFT_COL - 8}" y="${yy + 4}" text-anchor="end">${m.label}</text>`);
      if (!narrow)
        svg.push(`<text class="hour-label other" x="${width - rightCol + 8}" y="${yy + 4}">${m.other}</text>`);
    }
  }

  // Guide line with the flight kink.
  const yDep = y(plan.depart);
  const yArr = y(plan.arrive);
  const bend = Math.min(10, (yArr - yDep) / 4);
  svg.push(
    `<path class="guide" d="M${mainX},0 V${yDep} l${KINK},${bend} V${yArr - bend} l${-KINK},${bend} V${height}"/>`,
  );
  svg.push(`<line class="guide" x1="${sideX}" x2="${sideX}" y1="0" y2="${height}"/>`);

  const onMain = (t: number) => (t > plan.depart && t < plan.arrive ? mainX + KINK : mainX);
  const selectedKey = opts.selected ? `${opts.selected.look}-${opts.selected.event.start}` : '';

  items.forEach((item, i) => {
    const e = item.event;
    const key = `${item.look}-${e.start}`;
    const sel = key === selectedKey ? ' selected' : '';
    const active = !isPoint(e) && e.start <= now && now < e.end;
    const title = esc(
      `${item.title}. ${isPoint(e) ? clock(plan, e.start) : `${clock(plan, e.start)} to ${clock(plan, e.end)}`}. ${item.detail}`,
    );
    const g = (body: string, cls: string) =>
      svg.push(
        `<g class="item ${cls}${sel}${active ? ' active' : ''}" data-i="${i}" tabindex="0" role="button"><title>${title}</title>${body}</g>`,
      );

    switch (item.look) {
      case 'sleep':
      case 'nap':
      case 'light':
      case 'dark': {
        const x = onMain(e.start + MINUTE);
        const y0 = y(e.start);
        const y1 = y(e.end);
        const w = item.look === 'nap' ? MAIN_W - 4 : MAIN_W;
        const inset = w / 2;
        let body = `<line class="seg" x1="${x}" x2="${x}" y1="${y0 + inset}" y2="${Math.max(y0 + inset, y1 - inset)}" stroke-width="${w}"/>`;
        if (item.look === 'dark')
          body += `<line class="seg-core" x1="${x}" x2="${x}" y1="${y0 + inset}" y2="${Math.max(y0 + inset, y1 - inset)}" stroke-width="${w - 5}"/>`;
        body += `<circle class="station" cx="${x}" cy="${y0}" r="${STATION_R}"/>`;
        body += icon(item.icon, x, y0, 14, 'var(--station-ink)');
        const tall = y1 - y0;
        const lx = x + LABEL_GAP;
        body += `<text class="seg-title" x="${lx}" y="${y0 + 4}">${esc(item.title)}${e.optional ? `<tspan class="opt"> ${FEED.optional}</tspan>` : ''}</text>`;
        if (tall >= 34) body += `<text class="seg-meta" x="${lx}" y="${y0 + 20}">${duration(e.end - e.start)}</text>`;
        if (active && tall >= 50)
          body += `<text class="seg-until" x="${lx}" y="${y0 + 36}">${FEED.until(clock(plan, e.end))}</text>`;
        g(body, `look-${item.look}`);
        break;
      }
      case 'flight': {
        let body = `<circle class="station" cx="${mainX}" cy="${yDep}" r="${STATION_R}"/>${icon('plane', mainX, yDep, 14, 'var(--station-ink)')}`;
        body += `<circle class="station" cx="${mainX}" cy="${yArr}" r="${STATION_R}"/>${icon('landing', mainX, yArr, 14, 'var(--station-ink)')}`;
        body += `<text class="seg-title" x="${labelX}" y="${yDep - 8}">${esc(item.title)} <tspan class="seg-meta">${duration(e.end - e.start)}</tspan></text>`;
        body += `<text class="seg-title landing" x="${labelX}" y="${yArr + 4}">${esc(FEED.landed(clock(plan, plan.arrive)))}</text>`;
        body += `<text class="seg-meta" x="${labelX}" y="${yArr + 20}">${esc(FEED.clocksChange(plan.totalShiftHours, plan.direction))}</text>`;
        g(body, 'look-flight');
        break;
      }
      case 'caffeine':
      case 'noCaffeine': {
        const y0 = y(e.start);
        const y1 = y(e.end);
        const dashed = item.look === 'noCaffeine' ? ' dashed' : '';
        let body = `<line class="side${dashed}" x1="${sideX}" x2="${sideX}" y1="${y0}" y2="${y1}" stroke-width="${THIN_W}"/>`;
        const doseAt = items.some((o) => o.look === 'caffeineDose' && Math.abs(o.event.start - e.start) < 15 * MINUTE);
        const doseBefore = items.some(
          (o) =>
            o.look === 'caffeineDose' &&
            e.start - o.event.start >= 15 * MINUTE &&
            e.start - o.event.start < 60 * MINUTE,
        );
        if (!doseAt) {
          const [t1, t2] =
            item.look === 'caffeine' ? [FEED.caffeineFine, FEED.until(clock(plan, e.end))] : [item.title, ''];
          const ly = y0 + 4 + (doseBefore ? 30 : 0);
          body += `<text class="side-title" x="${sideX + 14}" y="${ly}">${esc(t1)}</text>`;
          if (t2 && y1 - y0 >= 30) body += `<text class="side-meta" x="${sideX + 14}" y="${ly + 14}">${esc(t2)}</text>`;
        }
        g(body, `look-${item.look}`);
        break;
      }
      case 'caffeineDose':
      case 'melatonin': {
        const y0 = y(e.start);
        let body = `<circle class="dot" cx="${sideX}" cy="${y0}" r="${DOT_R}"/>${icon(item.icon, sideX, y0, 11, 'var(--dot-ink)')}`;
        body += `<text class="side-title" x="${sideX + 14}" y="${y0 + 4}">${esc(item.look === 'melatonin' ? 'melatonin' : 'caffeine')}</text>`;
        body += `<text class="side-meta" x="${sideX + 14}" y="${y0 + 18}">${esc(e.note ?? '')}${e.optional ? ` ${FEED.optional}` : ''}</text>`;
        g(body, `look-${item.look}`);
        break;
      }
    }
  });
  svg.push('</svg>');
  root.innerHTML = svg.join('');

  const rail = root.querySelector('svg')!;
  rail.addEventListener('click', (ev) => {
    const g = (ev.target as Element).closest<SVGGElement>('g.item');
    if (!g) return;
    const item = items[Number(g.dataset.i)];
    const already = g.classList.contains('selected');
    rail.querySelectorAll('g.item.selected').forEach((s) => s.classList.remove('selected'));
    if (already) {
      opts.onSelect(null);
    } else {
      g.classList.add('selected');
      opts.onSelect(item);
    }
  });
  rail.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      (ev.target as HTMLElement).click();
      ev.preventDefault();
    }
  });

  // Day headers and the now line are HTML so they can carry backgrounds.
  for (const m of hourMarks(plan)) {
    if (!m.dayStart) continue;
    const zone = zoneAt(plan, m.t);
    const d = DateTime.fromMillis(m.t, { zone });
    const other = zoneAbbr(plan, m.t, zone === plan.input.homeZone ? plan.input.destZone : plan.input.homeZone);
    const head = el(
      'div',
      'day-head',
      `<span>${d.toFormat('cccc d LLLL')}</span><span class="zone">${zoneAbbr(plan, m.t)}${narrow ? '' : ` · ${FEED.otherZone(other)}`}</span>`,
    );
    head.style.top = `${y(m.t)}px`;
    head.dataset.day = d.toISODate() ?? '';
    root.appendChild(head);
  }

  if (now >= axisStart(plan) && now <= plan.planEnd) {
    const line = el('div', 'now-line', `<span>${clock(plan, now)}</span>`);
    line.style.top = `${y(now)}px`;
    line.id = 'now';
    root.appendChild(line);
  }
  return root;
}
