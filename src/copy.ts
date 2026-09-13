// Every user facing string. Instruction text for an event is built here from its kind and context.
import type { Direction, EventKind, PlanEvent } from './algorithm/types.ts';

export const APP_NAME = 'Unlag';
export const TAGLINE = 'A jet lag schedule from your flight and your sleep.';

export const KIND_LABEL: Record<EventKind, string> = {
  sleep: 'sleep',
  nap: 'nap',
  light: 'get bright light',
  dark: 'avoid bright light',
  caffeine: 'caffeine is fine',
  caffeineDose: 'caffeine',
  melatonin: 'melatonin',
  flight: 'flight',
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
      return e.note === 'onBoard' ? 'sleep on the plane' : 'sleep';
    case 'nap':
      return 'nap if you can';
    case 'caffeineDose':
      return `caffeine, ${e.note}`;
    case 'melatonin':
      return `melatonin, ${e.note}`;
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

export const FORM = {
  homeAirport: 'From',
  destAirport: 'To',
  airportPlaceholder: 'Airport code or city',
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

export const DOWNLOAD_ICS = 'Calendar file';
export const COPY_LINK = 'Copy link';
export const LINK_COPIED = 'Copied';

export const FOOTER =
  'Rules from Burgess, Using bright light and melatonin to reduce jet lag, and the light and melatonin phase response curves. Not medical advice.';

export const HEADLINE = {
  nowSleep: (until: string) => `sleep until ${until}`,
  nowSleepOnBoard: (until: string) => `sleep on the plane until ${until}`,
  nowNap: (until: string) => `nap if you can, until ${until}`,
  nowSunglasses: (until: string) => `sunglasses on until ${until}`,
  nowDim: (until: string) => `keep the lights low until ${until}`,
  nowOutside: (until: string) => `get outside in the light until ${until}`,
  nowBright: (until: string) => `bright light until ${until}`,
  nowFlying: (until: string) => `in the air until ${until}`,
  at: (t: string) => ` at ${t}`,
  nextBed: (at: string) => `then bed${at}`,
  nextSleepOnBoard: (at: string) => `then sleep on the plane${at}`,
  nextNap: (at: string) => `then a nap${at}`,
  nextSunglasses: (at: string) => `then sunglasses on${at}`,
  nextDim: (at: string) => `then lights low${at}`,
  nextBright: (at: string) => `then bright light${at}`,
  nextFlight: (at: string) => `then the flight${at}`,
  nextMelatonin: (at: string) => `then melatonin${at}`,
  nextCaffeine: (at: string) => `then caffeine${at}`,
  nothingUntil: (t: string) => `nothing until ${t}`,
  toGo: (d: string) => `${d} to go.`,
  caffeineAside: (t: string) => `Caffeine is fine until ${t}.`,
  notStarted: (day: string) => `your plan starts on ${day}.`,
  over: 'your plan is over. You should be adapted.',
  optional: 'optional',
};

export const FEED = {
  until: (t: string) => `until ${t}`,
  optional: '· optional',
  noCaffeineTitle: 'no more caffeine',
  noCaffeineDetail: "Anything now would cut into tonight's sleep.",
  caffeineFine: 'caffeine is fine',
  landed: (t: string) => `landed ${t}`,
  clocksChange: (hours: number, direction: Direction) =>
    `clocks ${direction === 'delay' ? 'back' : 'forward'} ${hours} h`,
};

export const DAYLIST = {
  noSleep: 'no night',
  depart: 'depart',
  arrive: 'arrive',
};

export const HEADER = {
  trip: 'Trip',
  plan: 'Plan',
  close: 'Close',
  jumpToNow: 'Now',
  pickDay: 'Choose a day',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  days: 'Days',
  editTrip: 'Edit trip',
  doneEditing: 'Done',
};

export const SUMMARY = {
  route: (from: string, to: string) => `${from} to ${to}`,
  flight: (day: string, dep: string, arr: string, length: string) => `${day} · ${dep} to ${arr} · ${length}`,
  shift: (hours: number, direction: Direction) =>
    direction === 'delay'
      ? `${hours} h behind. Your clock moves later, which is the easy way.`
      : `${hours} h ahead. Your clock moves earlier, which takes longer.`,
  sleep: (bed: string, wake: string) => `Usual sleep ${bed} to ${wake}`,
  adapted: (day: string) => `Adapted by ${day}`,
  notAdapted: 'Not fully adapted in the days shown',
};

// A readable place name from an IANA zone such as America/Los_Angeles.
export function zoneCity(zone: string): string {
  const last = zone.split('/').pop() ?? zone;
  return last.replace(/_/g, ' ');
}

export const PICKER = {
  noMatch: 'No large airport matches. Try the code, such as SFO.',
};
