// Which instructions fall due in a window, and the words to push for each. Shared by the
// scheduled function and its tests; nothing here touches the DOM.
import type { Plan, PlanEvent } from '../algorithm/types.ts';
import { eventInstruction, eventTitle } from '../copy.ts';
import { clock, contextFor, isPoint, zoneAbbr } from '../ui/format.ts';

export interface PushMessage {
  key: string;
  title: string;
  body: string;
  at: number;
}

// Windows announce themselves when they start; point events when they happen. Caffeine windows
// are announced only when they end, since the start says nothing worth a notification.
export function dueMessages(plan: Plan, from: number, to: number): PushMessage[] {
  const out: PushMessage[] = [];
  for (const e of plan.events) {
    if (e.kind === 'flight') continue;
    const at = e.kind === 'caffeine' ? e.end : e.start;
    if (at <= from || at > to) continue;
    out.push({ key: `${e.kind}-${e.start}`, title: title(e), body: body(plan, e), at });
  }
  return out.sort((a, b) => a.at - b.at);
}

function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function title(e: PlanEvent): string {
  if (e.kind === 'caffeine') return 'Last caffeine for today';
  return sentence(eventTitle(e)) + (e.optional ? ' (optional)' : '');
}

function body(plan: Plan, e: PlanEvent): string {
  const detail = eventInstruction(e, contextFor(plan, e));
  if (e.kind === 'caffeine') return detail;
  if (isPoint(e)) return detail;
  return `Until ${clock(plan, e.end)} ${zoneAbbr(plan, e.end)}. ${detail}`;
}
