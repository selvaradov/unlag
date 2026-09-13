// The list of days behind the day title. Each row shows the sleep window; tapping jumps to that day.
import { DateTime } from 'luxon';
import type { Plan } from '../algorithm/types.ts';
import { DAYLIST } from '../copy.ts';
import { clock, zoneAbbr, zoneAt } from './format.ts';

export interface DayRow {
  iso: string;
  label: string;
  zone: string;
  sleep: string;
  travel: boolean;
  today: boolean;
}

export function dayRows(plan: Plan, now: number): DayRow[] {
  const rows: DayRow[] = [];
  const sleeps = plan.events.filter((e) => e.kind === 'sleep');
  let t = DateTime.fromMillis(plan.planStart, { zone: plan.input.homeZone }).startOf('day');
  while (t.toMillis() < plan.planEnd) {
    const zone = zoneAt(plan, t.toMillis());
    const day = DateTime.fromMillis(t.toMillis(), { zone });
    const dayEnd = day.plus({ days: 1 }).startOf('day');
    const travel = t.toMillis() <= plan.arrive && plan.arrive < dayEnd.toMillis();
    const end = travel
      ? DateTime.fromMillis(plan.arrive, { zone: plan.input.destZone }).plus({ days: 1 }).startOf('day')
      : dayEnd;
    // The night that belongs to a day is the one starting between its noon and the next day's noon.
    const noon = day.plus({ hours: 12 }).toMillis();
    const nextNoon = end.plus({ hours: 12 }).toMillis();
    const night = sleeps.find((s) => s.start >= noon && s.start < nextNoon && s.note !== 'onBoard');
    rows.push({
      iso: day.toISODate() ?? '',
      label: day.setLocale('en-GB').toFormat('ccc d LLL'),
      zone: zoneAbbr(plan, t.toMillis()),
      sleep: night ? `${clock(plan, night.start)} to ${clock(plan, night.end)}` : DAYLIST.noSleep,
      travel,
      today: now >= t.toMillis() && now < end.toMillis(),
    });
    t = end;
  }
  return rows;
}

export function renderDayList(plan: Plan, now: number, onPick: (iso: string) => void): HTMLElement {
  const root = document.createElement('ul');
  root.className = 'day-list';
  for (const row of dayRows(plan, now)) {
    const li = document.createElement('li');
    if (row.today) li.classList.add('today');
    li.innerHTML = `<span class="date">${row.label}<small>${row.zone}</small></span><span class="sleep-pill">${row.sleep}</span>${row.travel ? `<span class="travel">${DAYLIST.travel}</span>` : ''}`;
    li.addEventListener('click', () => onPick(row.iso));
    root.appendChild(li);
  }
  return root;
}
