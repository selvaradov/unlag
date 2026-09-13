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
        ? 'Optional, as a sleep aid. The plan does not count on it moving your clock at this hour.'
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
  travelWakeUsual: 'Wake as usual on the travel day, or four hours before the flight if that is earlier',
  travelWakeHint: 'Untick to set the alarm yourself, for an early car or a long way to the airport.',
  preflightDays: 'Days to prepare before the flight',
  preflightHint: 'Bedtime moves up to an hour a day, so more than three days gains little.',
  postDays: 'Days to show after arrival',
  postHint: 'Most trips are adapted within a week.',
  caffeine: 'Caffeine',
  caffeineOptions: { none: 'Not a regular user', regular: 'Regular user', off: 'Do not suggest' },
  melatonin: 'Melatonin available',
  lightBox: 'Light box available',
  errors: {
    arrivalBeforeDeparture: 'Arrival is before departure. Check the dates and the two local times.',
    sleepZero: 'Bedtime and wake time are the same.',
    flightLength: 'That journey is longer than two days. Check the dates.',
    airport: 'Pick both airports from the list.',
  },
};

export const DOWNLOAD_ICS = 'Calendar file';
export const COPY_LINK = 'Copy link';
export const LINK_COPIED = 'Copied';

export const SOURCE_URL = 'https://github.com/selvaradov/unlag';
export const REFERENCES = {
  burgess:
    'https://www.med.upenn.edu/cbti/assets/user-content/documents/Burgess_UsingBrightLightandMelatonintoReduceJetLag.pdf',
  // Khalsa et al. 2003, a phase response curve to single bright light pulses in human subjects.
  lightPrc: 'https://doi.org/10.1113/jphysiol.2003.040477',
  // Burgess et al. 2010, human phase response curves to three days of daily melatonin.
  melatoninPrc: 'https://doi.org/10.1210/jc.2009-2590',
};
export const FOOTER = `Rules from <a href="${REFERENCES.burgess}">Burgess, Using bright light and melatonin to reduce jet lag</a>, and the <a href="${REFERENCES.lightPrc}">light</a> and <a href="${REFERENCES.melatoninPrc}">melatonin</a> phase response curves. Not medical advice. <a href="${SOURCE_URL}">Source</a>.`;

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
  // Countdown to the end of the current window, by what happens when it ends.
  endsIn: {
    sleep: (d: string) => `Wake in ${d}.`,
    nap: (d: string) => `Up in ${d}.`,
    dark: (d: string) => `Sunglasses off in ${d}.`,
    light: (d: string) => `Light done in ${d}.`,
    flight: (d: string) => `Landing in ${d}.`,
  } as Record<string, (d: string) => string>,
  startsIn: (d: string) => `Starts in ${d}.`,
  caffeineAside: (t: string) => `Caffeine is fine until ${t}.`,
  notStarted: (day: string) => `Your plan starts on ${day}.`,
  over: 'The scheduled days have ended.',
  optional: 'optional',
  close: 'Back to now',
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
  stripTitle: 'Night, on a noon to noon scale',
};

export const HEADER = {
  trip: 'Trip',
  plan: 'Plan',
  close: 'Close',
  cancel: 'Cancel',
  jumpToNow: 'Now',
  pickDay: 'Choose a day',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomHint: 'Double click to reset',
  days: 'Days',
  editTrip: 'Edit trip',
  newTrip: 'New trip',
  doneEditing: 'Done',
  how: 'How this works',
  howLede:
    'Every instruction is placed around the nightly low point of your body clock, moved a little each day by timed light.',
  howHref: 'how',
  back: 'Back to the plan',
  licences: 'Third party notices',
  licencesHref: 'licences.txt',
};

export const DAY_AXIS = {
  caption: 'Local time',
  // Labels for the ticks at 0, 25, 50 and 75 percent of the strip; the closing noon is left unlabelled.
  ticks: ['12:00', '18:00', '00:00', '06:00'],
};

export const SUMMARY = {
  route: (from: string, to: string) => `${from} to ${to}`,
  flight: (day: string, dep: string, arr: string, length: string) => `${day} · ${dep} to ${arr} · ${length}`,
  shift: (hours: number, direction: Direction) =>
    direction === 'delay'
      ? `${hours} h behind. Your clock moves later, which is the easy way.`
      : `${hours} h ahead. Your clock moves earlier, which takes longer.`,
  sleep: (bed: string, wake: string) => `Usual sleep ${bed} to ${wake}`,
  adapted: (day: string) => `Predicted adapted by ${day}`,
  notAdapted: 'Not fully adapted in the days shown',
};

// The methodology, in plain words. Shown under "How this works".
export const METHOD: { title: string; text: string }[] = [
  {
    title: 'One point sets everything',
    text: 'Your body clock has a low point each night, when core temperature is lowest. Call it Tmin. It sits about three hours before your usual wake time, so for a 07:00 riser it is around 04:00. Every instruction is placed relative to Tmin.',
  },
  {
    title: 'Light moves the clock',
    text: 'Bright light in the hours before Tmin pushes the clock later. Light in the hours after Tmin pushes it earlier. Flying west you need later, so you seek light in the evening and wear sunglasses in the early morning. Flying east it is the reverse. Light eight or more hours from Tmin does little either way.',
  },
  {
    title: 'It moves a bit each day',
    text: 'Left alone after landing, a body clock delays about an hour and a half a day and advances about an hour. Well timed light adds roughly half an hour. Before the flight there is no drift, so the only gain comes from moving bedtime and getting light at the right time, worth up to an hour a day for a delay and half that for an advance, less with room light than daylight.',
  },
  {
    title: 'Sleep is protected',
    text: 'Bedtime shifts by up to an hour a day before the flight, but a night is never cut below six and a half hours. If a long day is unavoidable a nap of up to ninety minutes is offered, on the plane where possible, at least eight hours before the next bedtime.',
  },
  {
    title: 'Caffeine and melatonin',
    text: 'Caffeine is a wakefulness tool with a cutoff before bed, six hours for regular users and eight for others. Melatonin taken in the biological afternoon advances the clock, so for eastward trips it is timed to do that. For westward trips the shifting dose would fall in the biological morning, which is impractical, so it is offered only as an optional sleep aid. Its effect on the clock depends on the hour by your body clock, which the plan does not track closely, so no shift is counted on it.',
  },
  {
    title: 'What the prediction means',
    text: 'The adapted date is when Tmin is predicted to reach its normal place on the destination clock under these rules. Checked against two published circadian oscillator models, one agrees and one is slower by about a day. Treat it as a rough guide, not a promise.',
  },
];

export const LOOKUP = {
  label: 'Flight number',
  placeholder: 'UA 900',
  date: 'Date',
  button: 'Look up',
  looking: 'Looking up…',
  found: (from: string, to: string, dep: string, arr: string, length: string, stops: string[]) =>
    `${from} ${dep} to ${to} ${arr}, ${length}${stops.length ? `, via ${stops.join(', ')}` : ''}.`,
  errors: {
    unavailable: 'Lookup is not set up on this site yet. Enter the flight by hand.',
    'bad-request': 'That does not look like a flight number. Try the form UA 900.',
    'not-found': 'No scheduled flight with that number on that date.',
    'unknown-airport': 'Found the flight, but one of its airports is not in the list. Pick the airports by hand.',
    failed: 'The lookup service did not answer. Enter the flight by hand.',
    'rate-limited': 'Too many lookups in the last hour. Try again later or enter the flight by hand.',
    quota: 'The monthly lookup allowance is used up. Enter the flight by hand.',
    forbidden: 'Lookups only work from this site.',
  } as Record<string, string>,
};

export const WALK = {
  title: 'Plan a trip',
  intro: 'Three short steps. Everything stays in the page address, so the plan is yours to bookmark or share.',
  steps: ['Your flight', 'Your sleep', 'Options'],
  flightHint: 'Type the flight number and date, or pick the airports and enter the times yourself.',
  sleepHint: 'Your usual bedtime and wake time at home. The plan shifts them a little each day.',
  optionsHint: 'What you have to hand and how many days to prepare.',
  back: 'Back',
  next: 'Next',
  finish: 'Make my plan',
  example: 'Or see an example plan',
};

export const NOTIFY = {
  off: 'Notify me',
  on: 'Notifications on',
  switchTo: 'Notify me for this plan',
  otherHint: 'This device follows a different plan. Tap to switch it to this one.',
  offHint: 'A notification on this device as each instruction starts.',
  onHint: 'This device will be told as each instruction starts. Tap to turn off.',
  justOn: 'Done. The first notification comes with the next instruction.',
  checking: 'Checking…',
  unsupported: 'This browser cannot show push notifications. The calendar file gives the same alerts.',
  install: 'On iPhone and iPad, notifications only work once Unlag is on the home screen.',
  addToHome: 'Add to home screen',
  addToHomeSteps: 'In the share sheet, scroll to Add to Home Screen. Then open Unlag from there and tap Notify me.',
  errors: {
    denied: 'Notifications are blocked for this site. Allow them in the browser settings and try again.',
    unavailable: 'Notifications are not set up on this site yet.',
    failed: 'Could not turn notifications on. Try again in a moment.',
  } as Record<string, string>,
};

export const THEME = {
  label: 'Appearance',
  light: 'Light',
  auto: 'Follow the system',
  dark: 'Dark',
  // Page grounds, matching the tokens in style.css, for the browser chrome colour.
  lightGround: '#fafaf7',
  darkGround: '#14151a',
};

export const PICKER = {
  noMatch: 'No airport matches. Try the code, such as SFO.',
};

// A readable place name from an IANA zone such as America/Los_Angeles.
export function zoneCity(zone: string): string {
  const last = zone.split('/').pop() ?? zone;
  return last.replace(/_/g, ' ');
}
