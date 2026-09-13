// The list of days. Each row shows the night that follows the day on a noon to noon strip,
// and on travel days the local departure or arrival time.
import { DateTime } from 'luxon';
import type { Plan } from '../algorithm/types.ts';
import { DAYLIST } from '../copy.ts';
import { HOUR } from '../algorithm/time.ts';
import { clock, zoneAbbr, zoneAt } from './format.ts';
import { ICONS } from './icons.ts';

export interface DayRow {
  iso: string;
  label: string;
  zone: string;
  start: number;
  end: number;
  sleep: string | null;
  // Night position on a noon to noon scale, as fractions of the strip.
  strip: { left: number; width: number } | null;
  // Departure or arrival happening on this local day, with its local time.
  flight: { kind: 'depart' | 'arrive'; time: string } | null;
  today: boolean;
}

export function dayRows(plan: Plan, now: number): DayRow[] {
  const rows: DayRow[] = [];
  const sleeps = plan.events.filter((e) => e.kind === 'sleep' && e.note !== 'onBoard');
  let t = DateTime.fromMillis(plan.planStart, { zone: plan.input.homeZone }).startOf('day');
  while (t.toMillis() < plan.planEnd) {
    const zone = zoneAt(plan, t.toMillis());
    const day = DateTime.fromMillis(t.toMillis(), { zone });
    const dayEnd = day.plus({ days: 1 }).startOf('day');
    const spansLanding = t.toMillis() <= plan.arrive && plan.arrive < dayEnd.toMillis();
    const end = spansLanding
      ? DateTime.fromMillis(plan.arrive, { zone: plan.input.destZone }).plus({ days: 1 }).startOf('day')
      : dayEnd;
    const noon = day.plus({ hours: 12 }).toMillis();
    const nextNoon = end.plus({ hours: 12 }).toMillis();
    const night = sleeps.find((s) => s.start >= noon && s.start < nextNoon);
    let strip: DayRow['strip'] = null;
    if (night) {
      // The strip runs from the noon before the night to the noon after it, in the night's zone.
      const nightZone = zoneAt(plan, night.start);
      const stripStart = DateTime.fromMillis(night.start, { zone: nightZone })
        .startOf('day')
        .plus({ hours: 12 })
        .toMillis();
      const base = night.start >= stripStart ? stripStart : stripStart - 24 * HOUR;
      strip = { left: (night.start - base) / (24 * HOUR), width: (night.end - night.start) / (24 * HOUR) };
    }
    const departs = plan.depart >= t.toMillis() && plan.depart < end.toMillis();
    rows.push({
      iso: day.toISODate() ?? '',
      label: day.toFormat('ccc d LLL'),
      zone: zoneAbbr(plan, t.toMillis()),
      start: t.toMillis(),
      end: end.toMillis(),
      sleep: night ? `${clock(plan, night.start)} to ${clock(plan, night.end)}` : null,
      strip,
      flight: departs
        ? { kind: 'depart', time: clock(plan, plan.depart) }
        : spansLanding
          ? { kind: 'arrive', time: clock(plan, plan.arrive) }
          : null,
      today: now >= t.toMillis() && now < end.toMillis(),
    });
    t = end;
  }
  // The plan ends at a wake, so the final day has no night to show.
  while (rows.length > 1 && rows[rows.length - 1].sleep === null && rows[rows.length - 1].flight === null) rows.pop();
  return rows;
}

export function renderDayList(plan: Plan, now: number, onPick: (iso: string) => void): HTMLElement {
  const root = document.createElement('ul');
  root.className = 'day-list';
  for (const row of dayRows(plan, now)) {
    const li = document.createElement('li');
    li.dataset.day = row.iso;
    if (row.today) li.classList.add('today');
    // The take off or landing icon says which; the word would not fit beside the zone.
    const flight = row.flight
      ? ` · <span title="${row.flight.kind === 'depart' ? DAYLIST.depart : DAYLIST.arrive}">${row.flight.kind === 'depart' ? ICONS.planeTakeoff : ICONS.planeLanding}${row.flight.time}</span>`
      : '';
    const night = row.strip
      ? `<span class="night"><span class="strip" title="${DAYLIST.stripTitle}"><span class="bar" style="left:${(row.strip.left * 100).toFixed(1)}%;width:${(row.strip.width * 100).toFixed(1)}%"></span></span><span class="times">${row.sleep}</span></span>`
      : `<span class="no-night">${DAYLIST.noSleep}</span>`;
    li.innerHTML = `<span class="date">${row.label}<small>${row.zone}${flight}</small></span>${night}`;
    li.addEventListener('click', () => onPick(row.iso));
    root.appendChild(li);
  }
  return root;
}
