// The vertical timeline. A continuous axis, one pixel row per slice of time, with capsule
// pills in three lanes: light, caffeine and melatonin, sleep. The flight is a rail on the right.
import { DateTime } from 'luxon';
import type { Plan, PlanEvent } from '../algorithm/types.ts';
import { HOUR, MINUTE } from '../algorithm/time.ts';
import { FEED, eventTitle } from '../copy.ts';
import { clock, instruction, isPoint, zoneAbbr, zoneAt } from './format.ts';
import { ICONS, type IconName } from './icons.ts';

export const PX_PER_HOUR = 56;
const MIN_PILL_PX = 40;
const DOT_PX = 30;

type Lane = 'light' | 'pill' | 'sleep';

export interface FeedItem {
  event: PlanEvent;
  // Visual kind, which separates derived items from raw event kinds.
  look: 'light' | 'dark' | 'caffeine' | 'noCaffeine' | 'caffeineDose' | 'melatonin' | 'sleep' | 'nap' | 'flight';
  lane: Lane;
  icon: IconName;
  title: string;
  detail: string;
}

const LOOK_TO_LANE: Record<FeedItem['look'], Lane> = {
  light: 'light',
  dark: 'light',
  caffeine: 'pill',
  noCaffeine: 'pill',
  caffeineDose: 'pill',
  melatonin: 'pill',
  sleep: 'sleep',
  nap: 'sleep',
  flight: 'sleep',
};

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

// Turns plan events into feed items, adding the "avoid caffeine" stretch that follows each caffeine window.
export function feedItems(plan: Plan): FeedItem[] {
  const items: FeedItem[] = [];
  const sleeps = plan.events.filter((e) => e.kind === 'sleep' || e.kind === 'nap');
  const make = (
    event: PlanEvent,
    look: FeedItem['look'],
    title = eventTitle(event),
    detail = instruction(plan, event),
  ) => items.push({ event, look, lane: LOOK_TO_LANE[look], icon: LOOK_TO_ICON[look], title, detail });
  for (const e of plan.events) {
    switch (e.kind) {
      case 'caffeine': {
        make(e, 'caffeine');
        const nextSleep = sleeps.find((s) => s.kind === 'sleep' && s.start >= e.end);
        if (nextSleep && nextSleep.start - e.end > 30 * MINUTE) {
          const avoid: PlanEvent = { kind: 'caffeine', start: e.end, end: nextSleep.start };
          make(avoid, 'noCaffeine', FEED.noCaffeineTitle, FEED.noCaffeineDetail);
        }
        break;
      }
      default:
        make(e, e.kind);
    }
  }
  return items;
}

export function axisStart(plan: Plan): number {
  return DateTime.fromMillis(plan.planStart, { zone: plan.input.homeZone }).startOf('day').toMillis();
}

export function yOf(plan: Plan, t: number): number {
  return ((t - axisStart(plan)) / HOUR) * PX_PER_HOUR;
}

interface Marker {
  t: number;
  label: string;
  other: string;
  dayStart: boolean;
}

// Hour marks in the zone in effect, re-snapped to the destination clock at landing.
function hourMarks(plan: Plan): Marker[] {
  const out: Marker[] = [];
  const end = plan.planEnd;
  let zone = zoneAt(plan, axisStart(plan));
  let t = DateTime.fromMillis(axisStart(plan), { zone });
  while (t.toMillis() <= end) {
    const ms = t.toMillis();
    const otherZone = zone === plan.input.homeZone ? plan.input.destZone : plan.input.homeZone;
    out.push({
      t: ms,
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

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (html) e.innerHTML = html;
  return e;
}

export interface FeedHandlers {
  onSelect: (item: FeedItem | null) => void;
}

export function renderFeed(plan: Plan, now: number, handlers: FeedHandlers): HTMLElement {
  const root = el('section', 'feed');
  const height = yOf(plan, plan.planEnd) + PX_PER_HOUR;
  root.style.height = `${height}px`;

  // Hour grid, labels on both sides, day headers and the landing divider.
  for (const m of hourMarks(plan)) {
    const y = yOf(plan, m.t);
    if (!m.dayStart) {
      const line = el('div', 'hour-line');
      line.style.top = `${y}px`;
      root.appendChild(line);
      const left = el('span', 'hour-label left', m.label);
      left.style.top = `${y}px`;
      root.appendChild(left);
      const right = el('span', 'hour-label right', m.other);
      right.style.top = `${y}px`;
      root.appendChild(right);
    } else {
      const zone = zoneAt(plan, m.t);
      const head = el(
        'div',
        'day-head',
        `<span>${DateTime.fromMillis(m.t, { zone }).setLocale('en-GB').toFormat('cccc d LLLL')}</span><span class="zone">${zoneAbbr(plan, m.t)}</span>`,
      );
      head.style.top = `${y}px`;
      head.dataset.day = DateTime.fromMillis(m.t, { zone }).toISODate() ?? '';
      root.appendChild(head);
    }
  }
  const landing = el(
    'div',
    'landing-divider',
    `${ICONS.landing}<span>${FEED.landed(clock(plan, plan.arrive), zoneAbbr(plan, plan.arrive), plan.totalShiftHours, plan.direction)}</span>`,
  );
  landing.style.top = `${yOf(plan, plan.arrive)}px`;
  root.appendChild(landing);

  // Pills.
  const items = feedItems(plan);
  for (const item of items) {
    const e = item.event;
    const point = isPoint(e);
    const y0 = yOf(plan, e.start);
    const h = point ? DOT_PX : Math.max(MIN_PILL_PX, yOf(plan, e.end) - y0);
    const pill = el(
      'button',
      `pill lane-${item.lane} look-${item.look}${point ? ' dot' : ''}${e.optional ? ' optional' : ''}`,
    );
    pill.type = 'button';
    pill.style.top = `${point ? y0 - DOT_PX / 2 : y0}px`;
    pill.style.height = `${h}px`;
    const active = !point && e.start <= now && now < e.end;
    if (active) pill.classList.add('active');
    pill.innerHTML =
      ICONS[item.icon] +
      (active && h > 90 ? `<span class="until">${FEED.until(clock(plan, e.end))}</span>` : '') +
      (item.look === 'flight' && h > 120 ? `<span class="rail-text">${FEED.flightRail}</span>` : '');
    pill.title = `${item.title}. ${point ? clock(plan, e.start) : `${clock(plan, e.start)} to ${clock(plan, e.end)}`}. ${item.detail}`;
    pill.setAttribute('aria-label', pill.title);
    pill.addEventListener('click', () => {
      const selected = root.querySelector('.pill.selected');
      if (selected === pill) {
        pill.classList.remove('selected');
        handlers.onSelect(null);
        return;
      }
      selected?.classList.remove('selected');
      pill.classList.add('selected');
      handlers.onSelect(item);
    });
    root.appendChild(pill);
  }

  // Now line.
  if (now >= axisStart(plan) && now <= plan.planEnd) {
    const line = el('div', 'now-line', `<span>${clock(plan, now)}</span>`);
    line.style.top = `${yOf(plan, now)}px`;
    line.id = 'now';
    root.appendChild(line);
  }
  return root;
}
