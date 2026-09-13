// The vertical timeline, drawn as one metro style line. Time runs down. Sleep, light and
// avoid light are thick segments on the main line with a station at each start; the flight
// kinks the line; caffeine and melatonin run on a thin line to the right.
import { DateTime } from 'luxon';
import type { Plan, PlanEvent } from '../algorithm/types.ts';
import { HOUR, MINUTE } from '../algorithm/time.ts';
import { FEED, eventTitle } from '../copy.ts';
import { clock, duration, instruction, isPoint, zoneAt } from './format.ts';
import { ICONS, type IconName } from './icons.ts';

export const DEFAULT_PX_PER_HOUR = 56;
export const MIN_PX_PER_HOUR = 18;
export const MAX_PX_PER_HOUR = 150;
// Space above the axis so the first day label clears whatever sits above the feed.
export const FEED_PAD_TOP = 28;

export const LEFT_COL = 56;
export const RIGHT_COL = 56;
const MAIN_OFFSET = 40;
const KINK = 18;
const LABEL_GAP = 24;
// Below this width the other zone's hour column is dropped to make room for labels.
export const NARROW = 480;
// From this width the base line widths and text grow.
const WIDE_FEED = 600;
const BASE = {
  compact: { side: 150, main: 16, thin: 2.5, font: 13.5 },
  wide: { side: 260, main: 20, thin: 4, font: 15 },
};
// Average glyph width as a fraction of the font size, for fitting labels.
const GLYPH = 0.5;

export interface Metrics {
  side: number;
  main: number;
  thin: number;
  station: number;
  dot: number;
  icon: number;
  font: number;
  meta: number;
}

// Line widths and text grow with the hour scale, so zooming in makes everything larger.
export function metrics(px: number, width: number): Metrics {
  const base = width >= WIDE_FEED ? BASE.wide : BASE.compact;
  const s = Math.min(1.6, Math.max(0.85, px / DEFAULT_PX_PER_HOUR));
  const main = Math.round(base.main * s);
  const station = Math.round(main * 0.75) + 2;
  const font = Math.min(18, Math.max(12, base.font * Math.sqrt(s)));
  return {
    side: base.side,
    main,
    thin: base.thin * Math.min(s, 1.3),
    station,
    dot: Math.round(station * 0.8),
    icon: Math.round(station * 1.2),
    font,
    meta: font - 2.5,
  };
}

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

// Pixel offset of an instant from the top of the feed element.
export function yOf(plan: Plan, t: number, px: number): number {
  return FEED_PAD_TOP + ((t - axisStart(plan)) / HOUR) * px;
}

export function timeAt(plan: Plan, y: number, px: number): number {
  return axisStart(plan) + ((y - FEED_PAD_TOP) / px) * HOUR;
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

// Cut text that would run past the available width, judged from an average glyph width.
function fit(text: string, availablePx: number, font: number): string {
  const max = Math.floor(availablePx / (font * GLYPH));
  if (text.length <= max) return text;
  return max > 3 ? `${text.slice(0, max - 1).trimEnd()}…` : '';
}

// Break a label into at most `lines` lines that fit the width; the last line is cut if needed.
function wrap(text: string, availablePx: number, font: number, lines: number): string[] {
  const max = Math.max(4, Math.floor(availablePx / (font * GLYPH)));
  const words = text.split(' ');
  const out: string[] = [];
  let i = 0;
  while (i < words.length && out.length < lines - 1) {
    let cur = words[i++];
    while (i < words.length && `${cur} ${words[i]}`.length <= max) cur = `${cur} ${words[i++]}`;
    out.push(cur);
  }
  const rest = words.slice(i).join(' ');
  if (rest) out.push(fit(rest, availablePx, font));
  return out;
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
  const narrow = width < NARROW;
  const m = metrics(px, width);
  const rightCol = narrow ? 10 : RIGHT_COL;
  const mainX = LEFT_COL + MAIN_OFFSET;
  const sideX = Math.min(width - rightCol - 130, mainX + m.side);
  const labelX = mainX + LABEL_GAP;
  const sideLabelX = sideX + m.dot + 6;
  const sideRoom = width - rightCol - sideLabelX;
  const mainRoom = sideX - m.dot - 6 - labelX;
  const items = feedItems(plan);
  const step = labelStep(px);

  const root = el('section', 'feed');
  root.style.height = `${height}px`;

  const svg: string[] = [];
  svg.push(
    `<svg class="rail" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="--feed-font:${m.font}px;--feed-meta:${m.meta}px" xmlns="http://www.w3.org/2000/svg">`,
  );

  // Hour grid and day labels.
  for (const mk of hourMarks(plan)) {
    const yy = y(mk.t);
    if (mk.dayStart) {
      svg.push(`<line class="hour-line day-line" x1="${LEFT_COL}" x2="${width - rightCol}" y1="${yy}" y2="${yy}"/>`);
      const d = DateTime.fromMillis(mk.t, { zone: zoneAt(plan, mk.t) });
      svg.push(
        `<text class="day-label" x="${width - rightCol}" y="${yy - 6}" text-anchor="end">${d.toFormat('cccc d LLLL')}</text>`,
      );
      continue;
    }
    const labelled = mk.hour % step === 0;
    svg.push(
      `<line class="hour-line${labelled ? '' : ' minor'}" x1="${LEFT_COL}" x2="${width - rightCol}" y1="${yy}" y2="${yy}"/>`,
    );
    if (labelled) {
      svg.push(`<text class="hour-label" x="${LEFT_COL - 8}" y="${yy + 4}" text-anchor="end">${mk.label}</text>`);
      if (!narrow)
        svg.push(`<text class="hour-label other" x="${width - rightCol + 8}" y="${yy + 4}">${mk.other}</text>`);
    }
  }

  // Guide line with the flight kink.
  const yDep = y(plan.depart);
  const yArr = y(plan.arrive);
  const bend = Math.min(10, (yArr - yDep) / 4);
  svg.push(
    `<path class="guide" d="M${mainX},${FEED_PAD_TOP} V${yDep} l${KINK},${bend} V${yArr - bend} l${-KINK},${bend} V${height}"/>`,
  );
  svg.push(`<line class="guide" x1="${sideX}" x2="${sideX}" y1="${FEED_PAD_TOP}" y2="${height}"/>`);

  const onMain = (t: number) => (t > plan.depart && t < plan.arrive ? mainX + KINK : mainX);
  // Label room below a main line item runs until the next main line item starts.
  const mainStarts = items
    .filter((o) => ['sleep', 'nap', 'light', 'dark'].includes(o.look))
    .map((o) => o.event.start)
    .concat([plan.depart, plan.arrive])
    .sort((a, b) => a - b);
  const roomBelow = (start: number) => {
    const next = mainStarts.find((t) => t > start + MINUTE);
    return next === undefined ? Infinity : y(next) - y(start) - 8;
  };
  const selectedKey = opts.selected ? `${opts.selected.look}-${opts.selected.event.start}` : '';
  const doseAt = (t: number, within: number) =>
    items.some((o) => o.look === 'caffeineDose' && Math.abs(o.event.start - t) < within);

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
    const line1 = m.font + 4;
    const line2 = line1 + m.meta + 3;

    switch (item.look) {
      case 'sleep':
      case 'nap':
      case 'light':
      case 'dark': {
        const x = onMain(e.start + MINUTE);
        const y0 = y(e.start);
        const y1 = y(e.end);
        const w = item.look === 'nap' ? m.main - 4 : m.main;
        const inset = w / 2;
        let body = `<line class="seg" x1="${x}" x2="${x}" y1="${y0 + inset}" y2="${Math.max(y0 + inset, y1 - inset)}" stroke-width="${w}"/>`;
        if (item.look === 'dark')
          body += `<line class="seg-core" x1="${x}" x2="${x}" y1="${y0 + inset}" y2="${Math.max(y0 + inset, y1 - inset)}" stroke-width="${w - 5}"/>`;
        body += `<circle class="station" cx="${x}" cy="${y0}" r="${m.station}"/>`;
        body += icon(item.icon, x, y0, m.icon, 'var(--station-ink)');
        const room = roomBelow(e.start);
        const lx = x + LABEL_GAP;
        const titleText = item.title + (e.optional ? ` ${FEED.optional}` : '');
        const titleLines = wrap(titleText, mainRoom, m.font, room >= line2 + 4 ? 2 : 1);
        titleLines.forEach((t, k) => {
          body += `<text class="seg-title" x="${lx}" y="${y0 + 5 + k * line1}">${esc(t)}</text>`;
        });
        let ly = y0 + 5 + titleLines.length * line1;
        if (room >= ly - y0 + m.meta) {
          body += `<text class="seg-meta" x="${lx}" y="${ly}">${duration(e.end - e.start)}</text>`;
          ly += m.meta + 3;
        }
        if (active && room >= ly - y0 + m.meta)
          body += `<text class="seg-until" x="${lx}" y="${ly}">${FEED.until(clock(plan, e.end))}</text>`;
        g(body, `look-${item.look}`);
        break;
      }
      case 'flight': {
        let body = `<circle class="station" cx="${mainX}" cy="${yDep}" r="${m.station}"/>${icon('plane', mainX, yDep, m.icon, 'var(--station-ink)')}`;
        body += `<circle class="station" cx="${mainX}" cy="${yArr}" r="${m.station}"/>${icon('plane', mainX, yArr, m.icon, 'var(--station-ink)')}`;
        body += `<text class="seg-title" x="${labelX}" y="${yDep - 8}">${esc(item.title)} <tspan class="seg-meta">${duration(e.end - e.start)}</tspan></text>`;
        body += `<text class="seg-title landing" x="${labelX}" y="${yArr + 5}">${esc(FEED.landed(clock(plan, plan.arrive)))}</text>`;
        body += `<text class="seg-meta" x="${labelX}" y="${yArr + line1 + 4}">${esc(FEED.clocksChange(plan.totalShiftHours, plan.direction))}</text>`;
        g(body, 'look-flight');
        break;
      }
      case 'caffeine':
      case 'noCaffeine': {
        const y0 = y(e.start);
        const y1 = y(e.end);
        const dashed = item.look === 'noCaffeine' ? ' dashed' : '';
        let body = `<line class="side${dashed}" x1="${sideX}" x2="${sideX}" y1="${y0}" y2="${y1}" stroke-width="${m.thin}"/>`;
        const shareStart = doseAt(e.start, 15 * MINUTE);
        const doseJustBefore = items.some(
          (o) =>
            o.look === 'caffeineDose' &&
            e.start - o.event.start >= 15 * MINUTE &&
            e.start - o.event.start < 60 * MINUTE,
        );
        if (!shareStart) {
          body += `<circle class="dot" cx="${sideX}" cy="${y0}" r="${m.dot}"/>${icon(item.icon, sideX, y0, m.icon - 4, 'var(--dot-ink)')}`;
          const [t1, t2] =
            item.look === 'caffeine' ? [FEED.caffeineFine, FEED.until(clock(plan, e.end))] : [item.title, ''];
          let ly = y0 + 5 + (doseJustBefore ? line2 : 0);
          for (const t of wrap(t1, sideRoom, m.font, 2)) {
            body += `<text class="side-title" x="${sideLabelX}" y="${ly}">${esc(t)}</text>`;
            ly += line1 - 2;
          }
          if (t2 && y1 - y0 >= ly - y0 + m.meta)
            body += `<text class="side-meta" x="${sideLabelX}" y="${ly}">${esc(fit(t2, sideRoom, m.meta))}</text>`;
        }
        g(body, `look-${item.look}`);
        break;
      }
      case 'caffeineDose':
      case 'melatonin': {
        const y0 = y(e.start);
        let body = `<circle class="dot" cx="${sideX}" cy="${y0}" r="${m.dot}"/>${icon(item.icon, sideX, y0, m.icon - 4, 'var(--dot-ink)')}`;
        body += `<text class="side-title" x="${sideLabelX}" y="${y0 + 5}">${esc(item.look === 'melatonin' ? 'melatonin' : 'caffeine')}</text>`;
        body += `<text class="side-meta" x="${sideLabelX}" y="${y0 + line1 + 2}">${esc(fit(`${e.note ?? ''}${e.optional ? ` ${FEED.optional}` : ''}`, sideRoom, m.meta))}</text>`;
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

  // Invisible anchors for scrolling to a day, and the now line.
  for (const mk of hourMarks(plan)) {
    if (!mk.dayStart) continue;
    const anchor = el('div', 'day-head');
    anchor.style.top = `${y(mk.t)}px`;
    anchor.dataset.day = DateTime.fromMillis(mk.t, { zone: zoneAt(plan, mk.t) }).toISODate() ?? '';
    root.appendChild(anchor);
  }
  if (now >= axisStart(plan) && now <= plan.planEnd) {
    const line = el('div', 'now-line', `<span>${clock(plan, now)}</span>`);
    line.style.top = `${y(now)}px`;
    line.style.right = `${rightCol}px`;
    line.id = 'now';
    root.appendChild(line);
  }
  return root;
}
