// The sentence at the top, written like a note to self: what now, until when, then what.
import type { Plan, PlanEvent } from '../algorithm/types.ts';
import { MINUTE } from '../algorithm/time.ts';
import { HEADLINE } from '../copy.ts';
import type { FeedItem } from './feed.ts';
import { clock, duration, isPoint, overlapsDaylight, shortDay, zoneAbbr } from './format.ts';

const ORDER: PlanEvent['kind'][] = ['sleep', 'nap', 'dark', 'light', 'flight', 'melatonin', 'caffeineDose', 'caffeine'];

function nowPhrase(plan: Plan, e: PlanEvent): string | null {
  const until = clock(plan, e.end);
  switch (e.kind) {
    case 'sleep':
      return e.note === 'onBoard' ? HEADLINE.nowSleepOnBoard(until) : HEADLINE.nowSleep(until);
    case 'nap':
      return HEADLINE.nowNap(until);
    case 'dark':
      return overlapsDaylight(plan, e) ? HEADLINE.nowSunglasses(until) : HEADLINE.nowDim(until);
    case 'light':
      return overlapsDaylight(plan, e) ? HEADLINE.nowOutside(until) : HEADLINE.nowBright(until);
    case 'flight':
      return HEADLINE.nowFlying(`${until} ${zoneAbbr(plan, e.end)}`);
    default:
      return null;
  }
}

function nextPhrase(plan: Plan, e: PlanEvent, withTime: boolean): string {
  const at = withTime ? HEADLINE.at(clock(plan, e.start)) : '';
  switch (e.kind) {
    case 'sleep':
      return e.note === 'onBoard' ? HEADLINE.nextSleepOnBoard(at) : HEADLINE.nextBed(at);
    case 'nap':
      return HEADLINE.nextNap(at);
    case 'dark':
      return overlapsDaylight(plan, e) ? HEADLINE.nextSunglasses(at) : HEADLINE.nextDim(at);
    case 'light':
      return HEADLINE.nextBright(at);
    case 'flight':
      return HEADLINE.nextFlight(at);
    case 'melatonin':
      return HEADLINE.nextMelatonin(at);
    case 'caffeineDose':
      return HEADLINE.nextCaffeine(at);
    case 'caffeine':
      return '';
  }
}

export function composeHeadline(plan: Plan, now: number): { text: string; sub: string } {
  if (now < plan.planStart) return { text: HEADLINE.notStarted(shortDay(plan, plan.planStart)), sub: '' };
  if (now > plan.planEnd) return { text: HEADLINE.over, sub: '' };

  const active = plan.events
    .filter((e) => !isPoint(e) && e.start <= now && now < e.end)
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const upcoming = plan.events.filter((e) => e.start > now && e.kind !== 'caffeine').sort((a, b) => a.start - b.start);
  const next = upcoming[0];
  const main = active.map((e) => ({ e, p: nowPhrase(plan, e) })).find((x) => x.p !== null);
  const caffeine = active.find((e) => e.kind === 'caffeine');
  const asleep = active.some((e) => e.kind === 'sleep');

  let text: string;
  if (main) {
    // Skip a "then" that only restates the end of the current window.
    const then =
      next && next.start - main.e.end > 5 * MINUTE
        ? nextPhrase(plan, next, true)
        : next
          ? nextPhrase(plan, next, false)
          : '';
    text = then ? `${main.p}, ${then}.` : `${main.p}.`;
  } else if (next) {
    text = `${HEADLINE.nothingUntil(clock(plan, next.start))}, ${nextPhrase(plan, next, false)}.`;
  } else {
    text = HEADLINE.over;
  }

  const parts: string[] = [];
  if (next) parts.push(HEADLINE.toGo(duration(next.start - now)));
  if (caffeine && !asleep)
    parts.push(HEADLINE.caffeineAside(`${clock(plan, caffeine.end)} ${zoneAbbr(plan, caffeine.end)}`));
  return { text, sub: parts.join(' ') };
}

export function renderHeadline(plan: Plan, now: number, selected: FeedItem | null): HTMLElement {
  const root = document.createElement('section');
  root.className = 'headline';
  if (selected) {
    const e = selected.event;
    const when = isPoint(e)
      ? `${shortDay(plan, e.start)} ${clock(plan, e.start)} ${zoneAbbr(plan, e.start)}`
      : `${shortDay(plan, e.start)} ${clock(plan, e.start)} to ${clock(plan, e.end)} ${zoneAbbr(plan, e.end)}`;
    root.innerHTML = `<h2>${selected.title}${e.optional ? ` <span class="opt">${HEADLINE.optional}</span>` : ''}</h2><p class="sub">${when}</p><p class="detail">${selected.detail}</p>`;
    return root;
  }
  const { text, sub } = composeHeadline(plan, now);
  root.innerHTML = `<h2>${text}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}`;
  return root;
}
