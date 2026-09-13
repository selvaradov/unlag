// The vertical timeline, drawn as one metro style line. Time runs down. Sleep, light and
// avoid light are thick segments on the main line with a station at each start; the flight
// kinks the line; caffeine and melatonin run on a thin line to the right. Labels are laid
// out in a separate pass so they never overlap.
import { DateTime } from 'luxon';
import type { Plan, PlanEvent } from '../algorithm/types.ts';
import { HOUR, MINUTE } from '../algorithm/time.ts';
import { FEED, eventTitle } from '../copy.ts';
import { clock, duration, instruction, isPoint, zoneAbbr, zoneAt } from './format.ts';
import { ICONS, type IconName } from './icons.ts';

export const DEFAULT_PX_PER_HOUR = 56;
export const MIN_PX_PER_HOUR = 18;
export const MAX_PX_PER_HOUR = 150;
// Space above the axis so the first day label clears whatever sits above the feed.
export const FEED_PAD_TOP = 28;

export const LEFT_COL = 56;
export const RIGHT_COL = 56;
const MAIN_OFFSET = 40;
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
const LABEL_GAP_Y = 4;

export interface Metrics {
  side: number;
  main: number;
  thin: number;
  station: number;
  dot: number;
  icon: number;
  font: number;
  meta: number;
  kink: number;
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
    // The flight kink is wide enough that a station on it clears a station on the main line.
    kink: station * 2 + 6,
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
  dark: 'glasses',
  caffeine: 'cup',
  noCaffeine: 'noCup',
  caffeineDose: 'cup',
  melatonin: 'pill',
  sleep: 'bed',
  nap: 'moon',
  flight: 'planeTakeoff',
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

// The first candidate that fits, else the last one cut to fit.
function fitPreferring(candidates: string[], availablePx: number, font: number): string {
  const max = Math.floor(availablePx / (font * GLYPH));
  return candidates.find((c) => c.length <= max) ?? fit(candidates[candidates.length - 1], availablePx, font);
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

interface LabelLine {
  cls: string;
  text: string;
  h: number;
}

// A stack of label lines anchored at a top edge, allowed to run down to maxY.
interface Block {
  lane: 'main' | 'side';
  top: number;
  maxY: number;
  x: number;
  item: number;
  lines: LabelLine[];
}

// Lays out blocks in a lane so none overlap: later blocks move down, and lines are dropped
// from the bottom of a block when there is no room before the next item begins.
function layout(blocks: Block[]): string {
  const out: string[] = [];
  for (const lane of ['main', 'side'] as const) {
    let bottom = -Infinity;
    for (const b of blocks.filter((x) => x.lane === lane).sort((a, c) => a.top - c.top)) {
      const top = Math.max(b.top, bottom + LABEL_GAP_Y);
      let used = 0;
      for (const line of b.lines) {
        if (top + used + line.h > b.maxY) break;
        out.push(
          `<text class="${line.cls}" data-i="${b.item}" x="${b.x}" y="${top + used + line.h - 4}">${line.text}</text>`,
        );
        used += line.h;
      }
      if (used > 0) bottom = top + used;
    }
  }
  return out.join('');
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
  const titleH = m.font + 4;
  const metaH = m.meta + 3;

  const root = el('section', 'feed');
  root.style.height = `${height}px`;

  const svg: string[] = [];
  svg.push(
    `<svg class="rail" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="--feed-font:${m.font}px;--feed-meta:${m.meta}px" xmlns="http://www.w3.org/2000/svg">`,
  );

  // Hour grid and day labels.
  const marks = hourMarks(plan);
  for (const mk of marks) {
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
      // Labels carry their y so the now line can hide the one it would cover.
      svg.push(
        `<text class="hour-label" data-y="${yy}" x="${LEFT_COL - 8}" y="${yy + 4}" text-anchor="end">${mk.label}</text>`,
      );
      if (!narrow)
        svg.push(
          `<text class="hour-label other" data-y="${yy}" x="${width - rightCol + 8}" y="${yy + 4}">${mk.other}</text>`,
        );
    }
  }

  // Guide line with the flight kink. The flight span is shaded, and the axis breaks at landing
  // where the clock changes, with the zone names at either end of the break.
  const yDep = y(plan.depart);
  const yArr = y(plan.arrive);
  const bend = Math.min(10, (yArr - yDep) / 4);
  const gap = 7;
  svg.push(
    `<rect class="flight-band" x="${LEFT_COL}" y="${yDep}" width="${width - rightCol - LEFT_COL}" height="${yArr - yDep}"/>`,
  );
  svg.push(
    `<path class="guide" d="M${mainX},${FEED_PAD_TOP} V${yDep} l${m.kink},${bend} V${yArr - bend - gap} M${mainX},${yArr + gap} V${height}"/>`,
  );
  svg.push(`<line class="guide" x1="${sideX}" x2="${sideX}" y1="${FEED_PAD_TOP}" y2="${yArr - gap}"/>`);
  svg.push(`<line class="guide" x1="${sideX}" x2="${sideX}" y1="${yArr + gap}" y2="${height}"/>`);
  svg.push(`<line class="zone-break" x1="${LEFT_COL - 4}" x2="${width - rightCol + 4}" y1="${yArr}" y2="${yArr}"/>`);
  svg.push(
    `<text class="zone-break-label" x="${LEFT_COL - 8}" y="${yArr + 4}" text-anchor="end">${zoneAbbr(plan, plan.arrive)}</text>`,
  );
  if (!narrow) {
    svg.push(
      `<text class="zone-break-label other" x="${width - rightCol + 8}" y="${yArr + 4}">${zoneAbbr(plan, plan.arrive, plan.input.homeZone)}</text>`,
    );
  }

  const onMain = (t: number) => (t > plan.depart && t < plan.arrive ? mainX + m.kink : mainX);
  const selectedKey = opts.selected ? `${opts.selected.look}-${opts.selected.event.start}` : '';
  const isMain = (o: FeedItem) => ['sleep', 'nap', 'light', 'dark'].includes(o.look);
  const mainStarts = items
    .filter(isMain)
    .map((o) => o.event.start)
    .concat([plan.depart, plan.arrive])
    .sort((a, b) => a - b);
  const sideStarts = items
    .filter((o) => !isMain(o) && o.look !== 'flight')
    .map((o) => o.event.start)
    .sort((a, b) => a - b);
  const nextStart = (starts: number[], t: number) => {
    const next = starts.find((s) => s > t + MINUTE);
    return next === undefined ? height : y(next) - 6;
  };
  const doseWithin = (t: number, before: number, after: number) =>
    items.some((o) => o.look === 'caffeineDose' && o.event.start > t - before && o.event.start < t + after);
  const blocks: Block[] = [];
  const line = (cls: string, text: string, h: number): LabelLine => ({ cls, text: esc(text), h });

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
        const w = item.look === 'nap' ? m.main - 4 : m.main;
        const inset = w / 2;
        let body = `<line class="seg" x1="${x}" x2="${x}" y1="${y0 + inset}" y2="${Math.max(y0 + inset, y1 - inset)}" stroke-width="${w}"/>`;
        if (item.look === 'dark')
          body += `<line class="seg-core" x1="${x}" x2="${x}" y1="${y0 + inset}" y2="${Math.max(y0 + inset, y1 - inset)}" stroke-width="${w - 5}"/>`;
        body += `<circle class="station" cx="${x}" cy="${y0}" r="${m.station}"/>`;
        body += icon(item.icon, x, y0, m.icon, 'var(--station-ink)');
        g(body, `look-${item.look}`);
        const maxY = nextStart(mainStarts, e.start);
        const room = mainRoom - (x - mainX);
        const lines = wrap(item.title + (e.optional ? ` ${FEED.optional}` : ''), room, m.font, 3).map((t) =>
          line('seg-title', t, titleH),
        );
        lines.push(line('seg-meta', duration(e.end - e.start), metaH));
        if (active) lines.push(line('seg-until', FEED.until(clock(plan, e.end)), metaH));
        // An item starting on a day boundary keeps its label below the date rule.
        const onBoundary = marks.some((mk) => mk.dayStart && Math.abs(mk.t - e.start) < 15 * MINUTE);
        blocks.push({
          lane: 'main',
          top: onBoundary ? y0 + 4 : y0 - m.font * 0.6,
          maxY,
          x: x + LABEL_GAP,
          item: i,
          lines,
        });
        break;
      }
      case 'flight': {
        let body = `<circle class="station" cx="${mainX}" cy="${yDep}" r="${m.station}"/>${icon('planeTakeoff', mainX, yDep, m.icon, 'var(--station-ink)')}`;
        body += `<circle class="station" cx="${mainX}" cy="${yArr}" r="${m.station}"/>${icon('planeLanding', mainX, yArr, m.icon, 'var(--station-ink)')}`;
        g(body, 'look-flight');
        // Departure label sits above its station so the first thing on board keeps the row below.
        blocks.push({
          lane: 'main',
          top: yDep - titleH - 2,
          maxY: yDep + m.station,
          x: labelX,
          item: i,
          lines: [line('seg-title', `${item.title} · ${duration(e.end - e.start)}`, titleH)],
        });
        // The landing label sits under the break rule, not across it.
        blocks.push({
          lane: 'main',
          top: yArr + 6,
          maxY: nextStart(mainStarts, plan.arrive),
          x: labelX,
          item: i,
          lines: [
            line('seg-title landing', FEED.landed(clock(plan, plan.arrive)), titleH),
            line('seg-meta', FEED.clocksChange(plan.totalShiftHours, plan.direction), metaH),
          ],
        });
        break;
      }
      case 'caffeine':
      case 'noCaffeine': {
        const y0 = y(e.start);
        const y1 = y(e.end);
        const dashed = item.look === 'noCaffeine' ? ' dashed' : '';
        let body = `<line class="side${dashed}" x1="${sideX}" x2="${sideX}" y1="${y0}" y2="${y1}" stroke-width="${m.thin}"/>`;
        // A dose at or just before the start shares the station; the window's own dot and label are dropped.
        const shared = doseWithin(e.start, 45 * MINUTE, 15 * MINUTE);
        if (!shared) {
          body += `<circle class="dot" cx="${sideX}" cy="${y0}" r="${m.dot}"/>${icon(item.icon, sideX, y0, m.icon - 4, 'var(--dot-ink)')}`;
          const lines = wrap(item.look === 'caffeine' ? FEED.caffeineFine : item.title, sideRoom, m.font, 2).map((t) =>
            line('side-title', t, titleH - 2),
          );
          if (item.look === 'caffeine') lines.push(line('side-meta', FEED.until(clock(plan, e.end)), metaH));
          blocks.push({
            lane: 'side',
            top: y0 - m.font * 0.6,
            maxY: nextStart(sideStarts, e.start),
            x: sideLabelX,
            item: i,
            lines,
          });
        }
        g(body, `look-${item.look}`);
        break;
      }
      case 'caffeineDose':
      case 'melatonin': {
        const y0 = y(e.start);
        const body = `<circle class="dot" cx="${sideX}" cy="${y0}" r="${m.dot}"/>${icon(item.icon, sideX, y0, m.icon - 4, 'var(--dot-ink)')}`;
        g(body, `look-${item.look}`);
        blocks.push({
          lane: 'side',
          top: y0 - m.font * 0.6,
          maxY: nextStart(sideStarts, e.start),
          x: sideLabelX,
          item: i,
          lines: [
            line('side-title', item.look === 'melatonin' ? 'melatonin' : 'caffeine', titleH - 2),
            line(
              'side-meta',
              fitPreferring(
                [`${e.note ?? ''}${e.optional ? ` ${FEED.optional}` : ''}`, e.note ?? ''],
                sideRoom,
                m.meta,
              ),
              metaH,
            ),
          ],
        });
        break;
      }
    }
  });
  svg.push(`<g class="labels">${layout(blocks)}</g>`);
  svg.push('</svg>');
  root.innerHTML = svg.join('');

  const rail = root.querySelector('svg')!;
  rail.addEventListener('click', (ev) => {
    const hit = (ev.target as Element).closest<SVGElement>('[data-i]');
    if (!hit) return;
    const i = Number(hit.dataset.i);
    const g = rail.querySelector<SVGGElement>(`g.item[data-i="${i}"]`)!;
    const already = g.classList.contains('selected');
    rail.querySelectorAll('g.item.selected').forEach((s) => s.classList.remove('selected'));
    if (already) {
      opts.onSelect(null);
    } else {
      g.classList.add('selected');
      opts.onSelect(items[i]);
    }
  });
  rail.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      (ev.target as HTMLElement).click();
      ev.preventDefault();
    }
  });

  // Invisible anchors for scrolling to a day, and the now line.
  for (const mk of marks) {
    if (!mk.dayStart) continue;
    const anchor = el('div', 'day-head');
    anchor.style.top = `${y(mk.t)}px`;
    anchor.dataset.day = DateTime.fromMillis(mk.t, { zone: zoneAt(plan, mk.t) }).toISODate() ?? '';
    root.appendChild(anchor);
  }
  if (now >= axisStart(plan) && now <= plan.planEnd) {
    const nowLine = el('div', 'now-line', `<span>${clock(plan, now)}</span>`);
    nowLine.style.top = `${y(now)}px`;
    nowLine.style.right = `${rightCol}px`;
    nowLine.id = 'now';
    root.appendChild(nowLine);
  }
  return root;
}
