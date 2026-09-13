// The sentence at the top: what to do right now, composed from the active windows.
import type { Plan, PlanEvent } from '../algorithm/types.ts';
import { MINUTE } from '../algorithm/time.ts';
import { HEADLINE, eventTitle } from '../copy.ts';
import type { FeedItem } from './feed.ts';
import { clock, duration, isPoint, shortDay, zoneAbbr } from './format.ts';

const ORDER: PlanEvent['kind'][] = ['sleep', 'nap', 'dark', 'light', 'melatonin', 'caffeineDose', 'caffeine', 'flight'];

function phrase(e: PlanEvent, plan: Plan, now: number): string | null {
  switch (e.kind) {
    case 'sleep':
      return e.note === 'onBoard' ? HEADLINE.sleepOnBoard : HEADLINE.sleep;
    case 'nap':
      return HEADLINE.nap;
    case 'dark':
      return HEADLINE.dark;
    case 'light':
      return HEADLINE.light;
    case 'caffeine':
      return HEADLINE.caffeine;
    case 'melatonin':
      return HEADLINE.melatonin;
    case 'caffeineDose':
      return HEADLINE.caffeineDose;
    case 'flight':
      return plan.arrive - now < 60 * MINUTE ? HEADLINE.landingSoon : null;
  }
}

export function composeHeadline(plan: Plan, now: number): { text: string; sub: string } {
  if (now < plan.planStart) {
    return { text: HEADLINE.notStarted, sub: HEADLINE.startsOn(shortDay(plan, plan.planStart)) };
  }
  if (now > plan.planEnd) return { text: HEADLINE.over, sub: '' };

  const active = plan.events
    .filter((e) => (isPoint(e) ? Math.abs(e.start - now) <= 15 * MINUTE : e.start <= now && now < e.end))
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const asleep = active.some((e) => e.kind === 'sleep');
  const phrases = active
    .filter((e) => !(asleep && e.kind === 'caffeine'))
    .map((e) => phrase(e, plan, now))
    .filter((p): p is string => p !== null)
    .slice(0, 2);
  // Caffeine being fine is not worth a headline on its own.
  const onlyCaffeine =
    phrases.length === 1 && active.some((e) => e.kind === 'caffeine') && phrases[0] === HEADLINE.caffeine;

  const upcoming = plan.events.filter((e) => e.start > now && e.kind !== 'caffeine').sort((a, b) => a.start - b.start);
  const next = upcoming[0];
  const sub = next
    ? HEADLINE.next(
        eventTitle(next),
        `${clock(plan, next.start)} ${zoneAbbr(plan, next.start)}`,
        duration(next.start - now),
      )
    : '';

  if (phrases.length === 0 || onlyCaffeine) {
    const freeUntil = next ? HEADLINE.freeUntil(clock(plan, next.start)) : HEADLINE.nothing;
    return {
      text: freeUntil,
      sub: onlyCaffeine
        ? `${HEADLINE.caffeineAside(clock(plan, active.find((e) => e.kind === 'caffeine')!.end))} ${sub}`
        : sub,
    };
  }
  const text = phrases.join(HEADLINE.joiner);
  return { text: text.charAt(0).toUpperCase() + text.slice(1), sub };
}

export function renderHeadline(plan: Plan, now: number, selected: FeedItem | null): HTMLElement {
  const root = document.createElement('section');
  root.className = 'headline';
  if (selected) {
    const e = selected.event;
    const when = isPoint(e)
      ? `${shortDay(plan, e.start)} ${clock(plan, e.start)} ${zoneAbbr(plan, e.start)}`
      : `${shortDay(plan, e.start)} ${clock(plan, e.start)} to ${clock(plan, e.end)} ${zoneAbbr(plan, e.end)}`;
    root.innerHTML = `<h2>${selected.title}${e.optional ? ` <span class="optional-tag">${HEADLINE.optional}</span>` : ''}</h2><p class="sub">${when}</p><p class="detail">${selected.detail}</p>`;
    return root;
  }
  const { text, sub } = composeHeadline(plan, now);
  root.innerHTML = `<h2>${text}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}`;
  return root;
}
