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
  // True when the window runs straight into a scheduled sleep.
  endsAtBed: boolean;
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
    case 'light': {
      const how = ctx.daylight
        ? 'Get outside without sunglasses if you can. Otherwise the brightest room available, lights on, screens bright.'
        : 'Brightest room you can find, overhead lights on, screens bright. Intermittent is fine.';
      return ctx.direction === 'delay' && ctx.endsAtBed
        ? `${how} Keep the lights up until bed (you're pushing bedtime later than usual, so sleep will still come).`
        : how;
    }
    case 'dark':
      return ctx.direction === 'delay'
        ? 'Sunglasses outdoors, dim indoors, screens low. Light now would push your clock earlier, the wrong way.'
        : 'Sunglasses outdoors, dim indoors, screens low. Light now would push your clock later, the wrong way.';
    case 'caffeine':
      return `Last caffeine at ${ctx.endClock}. After that it will cut into tonight's sleep.`;
    case 'caffeineDose':
      return "A pill or a coffee. Small dose, you're not a regular user.";
    case 'melatonin':
      return ctx.direction === 'delay'
        ? "Optional, as a sleep aid. The plan doesn't count on it moving your clock at this hour."
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
  travelWakeAuto: (at: string) => `Automatic (${at})`,
  travelWakeAutoPending: 'Automatic',
  travelWakeAutoHint:
    "Your shifted wake time, or four hours before departure if that's earlier. Pick a time if you need an earlier alarm.",
  travelWakeHint: "The alarm you'll set on the travel day. The night before is kept to at least six and a half hours.",
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
export const FOOTER = `Rules from <a href="${REFERENCES.burgess}">Burgess, Using bright light and melatonin to reduce jet lag</a>, and the <a href="${REFERENCES.lightPrc}">light</a> and <a href="${REFERENCES.melatoninPrc}">melatonin</a> phase response curves. Not medical advice.`;

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
    text: "Your body clock has a low point each night, when core temperature is lowest. Call it Tmin. It sits about three hours before your usual wake time, so for a 07:00 riser it's around 04:00. Every instruction is placed relative to Tmin.",
  },
  {
    title: 'Light moves the clock',
    text: "Bright light in the hours before Tmin pushes the clock later. Light in the hours after Tmin pushes it earlier. Flying west you need later, so you seek light in the evening, right up to bed, and wear sunglasses in the early morning. The light runs to bedtime on purpose. The hours nearest Tmin move the clock most, and a body being kept up late has no trouble falling asleep. Flying east it's the reverse, and the lights stay low through the evening as well, because light in the hours before bed would push the clock the wrong way. Light eight or more hours from Tmin does little either way.",
  },
  {
    title: 'It moves a bit each day',
    text: "Left alone after landing, a body clock delays about an hour and a half a day and advances about an hour. Well timed light adds roughly half an hour. Before the flight there's no drift, so the only gain comes from moving bedtime and getting light at the right time, worth up to an hour a day for a delay and half that for an advance, less with room light than daylight.",
  },
  {
    title: 'Sleep is protected',
    text: 'Bedtime shifts by up to an hour a day before the flight, but a night is never cut below six and a half hours. If a long day is unavoidable a nap of up to ninety minutes is offered, on the plane where possible, at least eight hours before the next bedtime.',
  },
  {
    title: 'Caffeine and melatonin',
    text: "Caffeine is a wakefulness tool with a cutoff before bed, six hours for regular users and eight for others. Melatonin taken in the biological afternoon advances the clock, so for eastward trips it's timed to do that. For westward trips the shifting dose would fall in the biological morning, which is impractical, so it's offered only as an optional sleep aid. Its effect on the clock depends on the hour by your body clock, which the plan doesn't track closely, so no shift is counted on it.",
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
    unavailable: "Lookup isn't set up on this site yet. Enter the flight by hand.",
    'bad-request': "That doesn't look like a flight number. Try the form UA 900.",
    'not-found': 'No scheduled flight with that number on that date.',
    'unknown-airport': "Found the flight, but one of its airports isn't in the list. Pick the airports by hand.",
    failed: "The lookup service didn't answer. Enter the flight by hand.",
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
  unsupported: "This browser can't show push notifications. The calendar file gives the same alerts.",
  install: 'On iPhone and iPad, notifications only work once Unlag is on the home screen.',
  addToHome: 'Add to home screen',
  addToHomeSteps: 'In the share sheet, scroll to Add to Home Screen. Then open Unlag from there and tap Notify me.',
  errors: {
    denied: 'Notifications are blocked for this site. Allow them in the browser settings and try again.',
    unavailable: "Notifications aren't set up on this site yet.",
    failed: "Couldn't turn notifications on. Try again in a moment.",
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

export const CREDIT = `Written by Claude Fable 5.1. Source code <a href="${SOURCE_URL}">here</a>.`;

// The algorithm, step by step, for the method page. Plain words with the shape of code.
export const METHOD_DETAIL = {
  title: 'The algorithm, step by step',
  intro: `This is what <a href="${SOURCE_URL}/blob/main/src/algorithm/generate.ts">the generator</a> does, in the order it does it. Every time is an instant in UTC; only the display turns instants into local clocks.`,
  steps: [
    {
      title: '1. Set up',
      code: `home_tmin_clock = habitual_wake - 3h
delay_hours     = (home_offset - dest_offset) mod 24
advance_hours   = 24 - delay_hours
direction       = advance if advance_hours <= 9 else delay
total_shift     = advance_hours if advance else delay_hours
remaining       = total_shift`,
    },
    {
      title: '2. Home nights before the flight',
      code: `for each of the preflight days (at most 3):
    shift += 1h (delay) or 0.5h (advance), capped at total_shift
    bed  = habitual_bed  + shift
    wake = habitual_wake + shift
on the travel day:
    wake = travel_day_wake if given
           else min(shifted wake, departure - 4h)
    if wake - bed < 6.5h: bed = wake - 6.5h`,
    },
    {
      title: '3. Sleep on the plane',
      code: `tmin_near_flight = the Tmin closest to the middle of the flight
body_night       = [tmin - 5h, tmin + 3h]
overlap          = body_night ∩ flight, less 30 min at each end
if overlap >= 2h: schedule sleep for the overlap`,
    },
    {
      title: '4. First night at the destination',
      code: `until_bed  = hours from landing to the next habitual bedtime, dest clock
until_wake = hours from landing to the next habitual wake
if until_bed <= 3h or until_wake < until_bed:      # evening or night landing
    bed  = landing + 1.5h
    wake = next habitual wake, at least 6.5h later
else:                                              # daytime landing
    bed  = tonight's habitual bedtime
    if awake since last wake > 20h: bed -= 1h
    wake = next habitual wake
then habitual nights for the days shown`,
    },
    {
      title: '5. Walk Tmin forward a day at a time',
      code: `tmin = home_tmin_clock on the first morning
while remaining > 0 and within the plan:
    after_landing = tmin + 24h > landing
    max_rate = (1.5h delay | 1.0h advance) + 0.5h bonus   if after_landing
               1.0h delay | 0.5h advance                  before
    provisional = tmin + 24h ± min(remaining, max_rate)
    windows = light_windows(tmin, provisional)
    earned  = min(remaining, rate given windows.achieved)
    next    = tmin + 24h ± earned, rounded to 5 min
    remaining -= earned
    tmin = next`,
    },
    {
      title: '6. Light windows and what they earn',
      code: `delay:   seek  = the 4 waking hours before next Tmin
         avoid = [prev Tmin, prev Tmin + 4h]
advance: seek  = the 4 waking hours after prev Tmin
         avoid = [next Tmin - 8h, next Tmin]
seek pieces outside sleep are kept; avoid pieces shorter than 45 min are dropped
achieved = Σ over seek pieces of (length / 4h) × quality
quality  = 1.0 in daylight hours (07:00 to 19:00 local) or with a light box
           0.6 under room light
earned   = unmanaged_rate + bonus × achieved   after landing
           preflight_max × achieved            before`,
    },
    {
      title: '7. Naps, caffeine, melatonin',
      code: `for each waking stretch (wake to next bed):
    if stretch > 18h:
        nap = up to 90 min, first choice inside an avoid-light window on the plane,
              then on the plane, then any avoid-light window, then as early as
              allowed; never later than bed - 8h
    caffeine fine from wake (or nap end) until bed - cutoff
        cutoff = 6h for regular users, 8h otherwise
    if stretch >= 18h: suggest a dose at wake or nap end, and on landing,
        never within 1h of the cutoff
melatonin:
    advance: 0.5 mg at next Tmin - 10h, while a shift remains
    delay:   optional 0.5 mg at bed - 30 min, first 3 destination nights`,
    },
    {
      title: '8. Adapted',
      code: `adapted_at = the first Tmin where remaining reaches 0
predicted date shown on the trip card; no light instructions after it`,
    },
  ],
};

export const PICKER = {
  noMatch: 'No airport matches. Try the code, such as SFO.',
};

// A readable place name from an IANA zone such as America/Los_Angeles.
export function zoneCity(zone: string): string {
  const last = zone.split('/').pop() ?? zone;
  return last.replace(/_/g, ' ');
}
