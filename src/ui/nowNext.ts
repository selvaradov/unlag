import type { Plan, PlanEvent } from '../algorithm/types.ts';
import { NEXT_LABEL, NOTHING_NOW, NOW_LABEL, PLAN_NOT_STARTED, PLAN_OVER, eventTitle } from '../copy.ts';
import { clock, duration, instruction, isPoint, shortDay, zoneAbbr } from './format.ts';

// Lower number wins when several windows are active at once.
const PRIORITY: Record<PlanEvent['kind'], number> = {
  sleep: 0,
  nap: 1,
  dark: 2,
  light: 3,
  flight: 4,
  melatonin: 5,
  caffeineDose: 6,
  caffeine: 7,
};

export function renderNowNext(plan: Plan, now: number): HTMLElement {
  const root = document.createElement('section');
  root.className = 'now-next';

  const active = plan.events
    .filter((e) => !isPoint(e) && e.start <= now && now < e.end)
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
  const upcoming = plan.events
    .filter((e) => e.start > now && e.kind !== 'caffeine')
    .sort((a, b) => a.start - b.start || PRIORITY[a.kind] - PRIORITY[b.kind]);

  const nowEl = document.createElement('div');
  nowEl.className = 'now';
  if (now < plan.planStart) {
    nowEl.innerHTML = `<span class="label">${NOW_LABEL}</span><strong>${PLAN_NOT_STARTED}</strong>`;
  } else if (now > plan.planEnd) {
    nowEl.innerHTML = `<span class="label">${NOW_LABEL}</span><strong>${PLAN_OVER}</strong>`;
  } else if (active.length === 0 || active[0].kind === 'caffeine') {
    nowEl.innerHTML =
      `<span class="label">${NOW_LABEL}</span><strong>${NOTHING_NOW}</strong>` +
      active
        .map((e) => `<p class="also">${eventTitle(e)} until ${clock(plan, e.end)} ${zoneAbbr(plan, e.end)}</p>`)
        .join('');
  } else {
    const main = active[0];
    const rest = active.slice(1);
    nowEl.innerHTML =
      `<span class="label">${NOW_LABEL}</span>` +
      `<strong>${eventTitle(main)}</strong> <span class="until">until ${clock(plan, main.end)} ${zoneAbbr(plan, main.end)}</span>` +
      `<p>${instruction(plan, main)}</p>` +
      rest.map((e) => `<p class="also">${eventTitle(e)} until ${clock(plan, e.end)}</p>`).join('');
  }
  root.appendChild(nowEl);

  const nextEl = document.createElement('div');
  nextEl.className = 'next';
  if (upcoming.length > 0) {
    const n = upcoming[0];
    const sameStart = upcoming.filter((e) => e.start === n.start);
    nextEl.innerHTML =
      `<span class="label">${NEXT_LABEL}</span>` +
      `<strong>${sameStart.map(eventTitle).join(', ')}</strong> ` +
      `<span class="until">${shortDay(plan, n.start)} ${clock(plan, n.start)} ${zoneAbbr(plan, n.start)}, in ${duration(n.start - now)}</span>`;
  }
  root.appendChild(nextEl);
  return root;
}
