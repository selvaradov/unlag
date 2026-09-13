// Calendar export. Times are UTC so the phone shows them in whatever zone it is in.
import { DateTime } from 'luxon';
import type { Plan, PlanEvent } from '../algorithm/types.ts';
import { APP_NAME, eventTitle } from '../copy.ts';
import { instruction, isPoint } from './format.ts';

const POINT_MINUTES = 15;
const ALARM_MINUTES: Partial<Record<PlanEvent['kind'], number>> = {
  sleep: 30,
  nap: 10,
  light: 10,
  dark: 10,
  melatonin: 10,
  caffeineDose: 5,
};

function stamp(ms: number): string {
  return DateTime.fromMillis(ms, { zone: 'utc' }).toFormat("yyyyMMdd'T'HHmmss'Z'");
}

function escape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = ' ' + rest.slice(73);
  }
  out.push(rest);
  return out.join('\r\n');
}

export function toICS(plan: Plan): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${APP_NAME}//EN`, 'CALSCALE:GREGORIAN'];
  const events = plan.events.filter((e) => e.kind !== 'caffeine');
  const cutoffs = plan.events
    .filter((e) => e.kind === 'caffeine')
    .map((e): PlanEvent => ({ kind: 'caffeineDose', start: e.end, end: e.end, note: 'last of the day' }));
  for (const e of [...events, ...cutoffs].sort((a, b) => a.start - b.start)) {
    const end = isPoint(e) ? e.start + POINT_MINUTES * 60_000 : e.end;
    const summary = e.kind === 'caffeineDose' && e.note === 'last of the day' ? 'Last caffeine' : eventTitle(e);
    const description =
      e.kind === 'caffeineDose' && e.note === 'last of the day'
        ? 'Caffeine after this cuts into sleep.'
        : instruction(plan, e);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.kind}-${e.start}@unlag`);
    lines.push(`DTSTAMP:${stamp(Date.now())}`);
    lines.push(`DTSTART:${stamp(e.start)}`);
    lines.push(`DTEND:${stamp(end)}`);
    lines.push(fold(`SUMMARY:${escape(summary + (e.optional ? ' (optional)' : ''))}`));
    lines.push(fold(`DESCRIPTION:${escape(description)}`));
    const alarm = ALARM_MINUTES[e.kind];
    if (alarm !== undefined) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escape(summary)}`,
        `TRIGGER:-PT${alarm}M`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
