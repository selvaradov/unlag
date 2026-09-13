// Every user facing string. Instruction text for an event is built here from its kind and context.
import type { Direction, EventKind, PlanEvent } from './algorithm/types.ts';

export const APP_NAME = 'Unlag';
export const TAGLINE = 'A jet lag schedule from your flight and your sleep.';

export const KIND_LABEL: Record<EventKind, string> = {
  sleep: 'Sleep',
  nap: 'Nap',
  light: 'Get bright light',
  dark: 'Avoid bright light',
  caffeine: 'Caffeine is fine',
  caffeineDose: 'Caffeine',
  melatonin: 'Melatonin',
  flight: 'Flight',
};

export interface EventContext {
  direction: Direction;
  // True when any part of the event falls in local daylight hours.
  daylight: boolean;
  // Formatted local end time, for windows that need one in their text.
  endClock: string;
}

export function eventTitle(e: PlanEvent): string {
  switch (e.kind) {
    case 'sleep':
      return e.note === 'onBoard' ? 'Sleep on the plane' : 'Sleep';
    case 'nap':
      return 'Nap if you can, up to 90 min';
    case 'caffeineDose':
      return `Caffeine, ${e.note}`;
    case 'melatonin':
      return `Melatonin, ${e.note}`;
    default:
      return KIND_LABEL[e.kind];
  }
}

export function eventInstruction(e: PlanEvent, ctx: EventContext): string {
  switch (e.kind) {
    case 'sleep':
      return e.note === 'onBoard'
        ? 'This is your body night. Eye mask, earplugs, no screens.'
        : 'Dark room. Phone face down.';
    case 'nap':
      return 'Optional. Eye mask on, alarm set. Keeps the long day bearable without eating into tonight.';
    case 'light':
      return ctx.daylight
        ? 'Get outside without sunglasses if you can. Otherwise the brightest room available, lights on, screens bright.'
        : 'Brightest room you can find, overhead lights on, screens bright. Intermittent is fine.';
    case 'dark':
      return ctx.direction === 'delay'
        ? 'Sunglasses outdoors, dim indoors, screens low. Light now would push your clock earlier, the wrong way.'
        : 'Sunglasses outdoors, dim indoors, screens low. Light now would push your clock later, the wrong way.';
    case 'caffeine':
      return `Last caffeine at ${ctx.endClock}. After that it will cut into tonight's sleep.`;
    case 'caffeineDose':
      return 'A pill or a coffee. Small dose, you are not a regular user.';
    case 'melatonin':
      return ctx.direction === 'delay'
        ? 'Optional, as a sleep aid only. At this time it does not move your clock.'
        : 'Timed to move your clock earlier. Expect a little drowsiness.';
    case 'flight':
      return 'In the air.';
  }
}

export function summary(fromZone: string, toZone: string, direction: Direction, hours: number): string {
  const verb = direction === 'delay' ? 'later' : 'earlier';
  return `${fromZone.replace(/_/g, ' ')} to ${toZone.replace(/_/g, ' ')}. Your clock needs to move ${hours} h ${verb}.`;
}

export function adaptedLine(date: string | null): string {
  return date ? `Predicted adapted by ${date}.` : 'Not fully adapted within the days shown.';
}

export const FORM = {
  homeZone: 'Home time zone',
  destZone: 'Destination time zone',
  depart: 'Departure, local time',
  arrive: 'Arrival, local time',
  bed: 'Usual bedtime',
  wake: 'Usual wake time',
  travelWake: 'Wake time on travel day',
  preflightDays: 'Days to prepare before the flight',
  postDays: 'Days to show after arrival',
  caffeine: 'Caffeine',
  caffeineOptions: { none: 'Not a regular user', regular: 'Regular user', off: 'Do not suggest' },
  melatonin: 'Melatonin available',
  lightBox: 'Light box available',
};

export const DOWNLOAD_ICS = 'Download calendar (.ics)';
export const COPY_LINK = 'Copy link to this plan';
export const LINK_COPIED = 'Link copied';

export const FOOTER =
  'Rules from Burgess, Using bright light and melatonin to reduce jet lag, and the light and melatonin phase response curves. Not medical advice.';

export const HEADLINE = {
  sleep: 'sleep',
  sleepOnBoard: 'sleep on the plane',
  nap: 'nap if you can',
  dark: 'avoid bright light',
  light: 'see bright light',
  caffeine: 'caffeine is fine',
  melatonin: 'take melatonin',
  caffeineDose: 'take caffeine',
  landingSoon: 'get ready to land',
  joiner: ' and ',
  notStarted: 'Your plan has not started yet',
  startsOn: (day: string) => `It starts on ${day}.`,
  over: 'Your plan is over. You should be adapted.',
  nothing: 'Nothing to do right now',
  freeUntil: (t: string) => `Nothing to do until ${t}`,
  caffeineAside: (t: string) => `Caffeine is fine until ${t}.`,
  next: (what: string, when: string, inHow: string) => `Next, ${what.toLowerCase()} at ${when}, in ${inHow}.`,
  optional: 'optional',
};

export const FEED = {
  until: (t: string) => `Until ${t}`,
  flightRail: 'Flight',
  noCaffeineTitle: 'No more caffeine today',
  noCaffeineDetail: "Anything now would cut into tonight's sleep.",
  landed: (t: string, zone: string, hours: number, direction: Direction) =>
    `Landed ${t} ${zone}. Clocks ${direction === 'delay' ? 'go back' : 'go forward'} ${hours} h. Times below are local.`,
};

export const DAYLIST = {
  noSleep: 'no full night',
  travel: 'flight',
};

export const HEADER = {
  trip: 'Trip',
  close: 'Close',
  jumpToNow: 'Now',
  pickDay: 'Choose a day',
};
