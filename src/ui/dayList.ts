// The list of days. Each row shows the night that follows the day and, on travel days, the flight time.
import { DateTime } from 'luxon';
import type { Plan } from '../algorithm/types.ts';
import { DAYLIST } from '../copy.ts';
import { clock, zoneAbbr, zoneAt } from './format.ts';
import { ICONS } from './icons.ts';

export interface DayRow {
  iso: string;
  label: string;
  zone: string;
  sleep: string | null;
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
    const departs = plan.depart >= t.toMillis() && plan.depart < end.toMillis();
    const arrives = spansLanding;
    rows.push({
      iso: day.toISODate() ?? '',
      label: day.toFormat('ccc d LLL'),
      zone: zoneAbbr(plan, t.toMillis()),
      sleep: night ? `${clock(plan, night.start)} to ${clock(plan, night.end)}` : null,
      flight:
        arrives && !departs
          ? { kind: 'arrive', time: clock(plan, plan.arrive) }
          : departs
            ? { kind: 'depart', time: clock(plan, plan.depart) }
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
    if (row.today) li.classList.add('today');
    const flight = row.flight
      ? `<small class="flight">${ICONS.plane}${row.flight.kind === 'depart' ? DAYLIST.depart : DAYLIST.arrive} ${row.flight.time}</small>`
      : '';
    li.innerHTML = `<span class="date">${row.label}<small>${row.zone}</small>${flight}</span>${row.sleep ? `<span class="sleep-pill">${ICONS.bed}${row.sleep}</span>` : `<span class="no-night">${DAYLIST.noSleep}</span>`}`;
    li.addEventListener('click', () => onPick(row.iso));
    root.appendChild(li);
  }
  return root;
}
