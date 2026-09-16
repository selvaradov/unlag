// The sentence at the top, written like a note to self: what now, until when, then what.
import type { Plan, PlanEvent } from '../algorithm/types.ts';
import { MINUTE } from '../algorithm/time.ts';
import { HEADLINE, napIsSleep } from '../copy.ts';
import type { FeedItem } from './feed.ts';
import { clock, duration, isPoint, overlapsDaylight, shortDay, zoneAbbr } from './format.ts';
import { ICONS } from './icons.ts';

const ORDER: PlanEvent['kind'][] = ['sleep', 'nap', 'dark', 'light', 'flight', 'melatonin', 'caffeineDose', 'caffeine'];

function nowPhrase(plan: Plan, e: PlanEvent): string | null {
  const until = clock(plan, e.end);
  switch (e.kind) {
    case 'sleep':
      return e.note === 'onBoard' ? HEADLINE.nowSleepOnBoard(until) : HEADLINE.nowSleep(until);
    case 'nap':
      if (e.optional) return HEADLINE.nowNap(until);
      if (!napIsSleep(e)) return HEADLINE.nowNapRequired(until);
      return e.note === 'onBoard' ? HEADLINE.nowSleepOnBoard(until) : HEADLINE.nowSleep(until);
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
      if (!napIsSleep(e)) return HEADLINE.nextNap(at);
      return e.note === 'onBoard' ? HEADLINE.nextSleepOnBoard(at) : HEADLINE.nextSleep(at);
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

function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
  const parts: string[] = [];
  if (main) {
    // Skip a "then" that only restates the end of the current window.
    const then =
      next && next.start - main.e.end > 5 * MINUTE
        ? nextPhrase(plan, next, true)
        : next
          ? nextPhrase(plan, next, false)
          : '';
    text = then ? `${main.p}, ${then}.` : `${main.p}.`;
    const endsIn = HEADLINE.endsIn[main.e.kind];
    if (endsIn) parts.push(endsIn(duration(main.e.end - now)));
  } else if (next) {
    text = `${HEADLINE.nothingUntil(clock(plan, next.start))}, ${nextPhrase(plan, next, false)}.`;
    parts.push(HEADLINE.startsIn(duration(next.start - now)));
  } else {
    text = HEADLINE.over;
  }
  if (caffeine && !asleep)
    parts.push(HEADLINE.caffeineAside(`${clock(plan, caffeine.end)} ${zoneAbbr(plan, caffeine.end)}`));
  return { text: sentence(text), sub: parts.join(' ') };
}

export function renderHeadline(plan: Plan, now: number, selected: FeedItem | null, onClose?: () => void): HTMLElement {
  const root = document.createElement('section');
  root.className = 'headline';
  if (selected) {
    const e = selected.event;
    const when = isPoint(e)
      ? `${shortDay(plan, e.start)} ${clock(plan, e.start)} ${zoneAbbr(plan, e.start)}`
      : `${shortDay(plan, e.start)} ${clock(plan, e.start)} to ${clock(plan, e.end)} ${zoneAbbr(plan, e.end)}`;
    root.classList.add('selected');
    root.innerHTML = `<h2>${sentence(selected.title)}${e.optional ? ` <span class="opt">${HEADLINE.optional}</span>` : ''}</h2><p class="sub">${when}</p><p class="detail">${selected.detail}</p>`;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close-selected';
    close.title = HEADLINE.close;
    close.setAttribute('aria-label', HEADLINE.close);
    close.innerHTML = ICONS.close;
    close.addEventListener('click', () => onClose?.());
    root.appendChild(close);
    return root;
  }
  const { text, sub } = composeHeadline(plan, now);
  root.innerHTML = `<h2>${text}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}`;
  return root;
}
