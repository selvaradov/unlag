import { DateTime } from 'luxon';
import type { Plan, PlanEvent } from '../algorithm/types.ts';
import { eventTitle } from '../copy.ts';
import { clock, dayLabel, instruction, isPoint, zoneAbbr, zoneAt } from './format.ts';

// Events grouped by the local date in the zone in effect when they start.
export function renderTextList(plan: Plan, now: number): HTMLElement {
  const root = document.createElement('section');
  root.className = 'text-list';
  const groups = new Map<string, PlanEvent[]>();
  for (const e of plan.events) {
    if (e.kind === 'caffeine') continue;
    const key = DateTime.fromMillis(e.start, { zone: zoneAt(plan, e.start) }).toISODate() ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  const caffeine = plan.events.filter((e) => e.kind === 'caffeine');
  for (const [, events] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const first = events[0];
    const h = document.createElement('h3');
    h.textContent = `${dayLabel(plan, first.start)}, ${zoneAbbr(plan, first.start)}`;
    root.appendChild(h);
    const ul = document.createElement('ul');
    for (const e of events) {
      const li = document.createElement('li');
      if (e.end <= now) li.classList.add('past');
      if (e.optional) li.classList.add('optional');
      const when = isPoint(e)
        ? clock(plan, e.start)
        : `${clock(plan, e.start)} to ${clock(plan, e.end)}${zoneAt(plan, e.start) !== zoneAt(plan, e.end) ? ` ${zoneAbbr(plan, e.end)}` : ''}`;
      li.innerHTML = `<span class="when">${when}</span> <strong>${eventTitle(e)}</strong><span class="detail">${instruction(plan, e)}</span>`;
      ul.appendChild(li);
    }
    const dayCaffeine = caffeine.find(
      (c) =>
        DateTime.fromMillis(c.start, { zone: zoneAt(plan, c.start) }).toISODate() ===
        DateTime.fromMillis(first.start, { zone: zoneAt(plan, first.start) }).toISODate(),
    );
    if (dayCaffeine) {
      const li = document.createElement('li');
      li.className = 'caffeine-note';
      li.innerHTML = `<span class="when"></span><span class="detail">${instruction(plan, dayCaffeine)}</span>`;
      ul.appendChild(li);
    }
    root.appendChild(ul);
  }
  return root;
}
