// The list of days. Each row draws the day's instructions on a noon to noon strip in the row's
// zone, and on travel days shows the local departure or arrival time.
import { DateTime } from 'luxon';
import type { Plan } from '../algorithm/types.ts';
import { DAYLIST, DAY_AXIS, eventTitle } from '../copy.ts';
import { HOUR } from '../algorithm/time.ts';
import { clock, zoneAbbr, zoneAt } from './format.ts';
import { ICONS } from './icons.ts';

export interface StripBar {
  kind: 'sleep' | 'nap' | 'light' | 'dark';
  left: number;
  width: number;
  title: string;
}

export interface DayRow {
  iso: string;
  label: string;
  // Zone the row is drawn in: the zone in effect at the end of the day, so a travel day uses the destination.
  zone: string;
  zoneName: string;
  start: number;
  end: number;
  // Noon to noon window the strip covers, in the row's zone.
  stripStart: number;
  bars: StripBar[];
  sleep: string | null;
  flight: { kind: 'depart' | 'arrive'; time: string } | null;
  today: boolean;
}

export function dayRows(plan: Plan, now: number): DayRow[] {
  const rows: DayRow[] = [];
  const main = plan.events.filter(
    (e) => e.kind === 'sleep' || e.kind === 'nap' || e.kind === 'light' || e.kind === 'dark',
  );
  let t = DateTime.fromMillis(plan.planStart, { zone: plan.input.homeZone }).startOf('day');
  while (t.toMillis() < plan.planEnd) {
    const startZone = zoneAt(plan, t.toMillis());
    const day = DateTime.fromMillis(t.toMillis(), { zone: startZone });
    const dayEnd = day.plus({ days: 1 }).startOf('day');
    const spansLanding = t.toMillis() <= plan.arrive && plan.arrive < dayEnd.toMillis();
    const end = spansLanding
      ? DateTime.fromMillis(plan.arrive, { zone: plan.input.destZone }).plus({ days: 1 }).startOf('day')
      : dayEnd;
    const zone = zoneAt(plan, end.toMillis() - 1);
    // Noon of this local day in the row's zone, to noon the next day.
    const stripStart = DateTime.fromMillis(end.toMillis() - 1, { zone })
      .startOf('day')
      .plus({ hours: 12 })
      .toMillis();
    const stripEnd = stripStart + 24 * HOUR;
    const bars: StripBar[] = [];
    for (const e of main) {
      const s = Math.max(e.start, stripStart);
      const f = Math.min(e.end, stripEnd);
      if (f <= s) continue;
      bars.push({
        kind: e.kind as StripBar['kind'],
        left: (s - stripStart) / (24 * HOUR),
        width: (f - s) / (24 * HOUR),
        title: `${eventTitle(e)} ${clock(plan, e.start)} to ${clock(plan, e.end)}`,
      });
    }
    const night = main.find(
      (e) => e.kind === 'sleep' && e.note !== 'onBoard' && e.start >= stripStart && e.start < stripEnd,
    );
    const departs = plan.depart >= t.toMillis() && plan.depart < end.toMillis();
    rows.push({
      iso: day.toISODate() ?? '',
      label: day.toFormat('ccc d LLL'),
      zone,
      zoneName: zoneAbbr(plan, end.toMillis() - 1, zone),
      start: t.toMillis(),
      end: end.toMillis(),
      stripStart,
      bars,
      sleep: night ? `${clock(plan, night.start)} to ${clock(plan, night.end)}` : null,
      flight: departs
        ? { kind: 'depart', time: clock(plan, plan.depart) }
        : spansLanding
          ? { kind: 'arrive', time: clock(plan, plan.arrive) }
          : null,
      today: now >= t.toMillis() && now < end.toMillis(),
    });
    t = end;
  }
  // The plan ends at a wake, so the final day has nothing after noon to show.
  while (rows.length > 1 && rows[rows.length - 1].bars.length === 0 && rows[rows.length - 1].flight === null)
    rows.pop();
  return rows;
}

export function renderDayList(plan: Plan, now: number, onPick: (iso: string) => void): HTMLElement {
  const root = document.createElement('div');
  root.className = 'day-list-wrap';
  const axis = document.createElement('div');
  axis.className = 'day-axis';
  axis.innerHTML = `<span class="caption">${DAY_AXIS.caption}</span><span class="ticks">${DAY_AXIS.ticks.map((x) => `<span>${x}</span>`).join('')}</span>`;
  root.appendChild(axis);
  const list = document.createElement('ul');
  list.className = 'day-list';
  for (const row of dayRows(plan, now)) {
    const li = document.createElement('li');
    li.dataset.day = row.iso;
    if (row.today) li.classList.add('today');
    // The take off or landing icon says which; the word would not fit beside the zone.
    const flight = row.flight
      ? ` · <span title="${row.flight.kind === 'depart' ? DAYLIST.depart : DAYLIST.arrive}">${row.flight.kind === 'depart' ? ICONS.planeTakeoff : ICONS.planeLanding}${row.flight.time}</span>`
      : '';
    const bars = row.bars
      .map(
        (b) =>
          `<span class="bar look-${b.kind}" title="${b.title}" style="left:${(b.left * 100).toFixed(1)}%;width:${(b.width * 100).toFixed(1)}%"></span>`,
      )
      .join('');
    li.innerHTML = `<span class="date">${row.label}<small>${row.zoneName}${flight}</small></span><span class="strip">${bars}</span>`;
    li.addEventListener('click', () => onPick(row.iso));
    list.appendChild(li);
  }
  root.appendChild(list);
  return root;
}
