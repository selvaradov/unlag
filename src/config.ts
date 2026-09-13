// Every tunable number in the planner lives here.

// Core body temperature minimum, hours before habitual wake time.
export const TMIN_HOURS_BEFORE_WAKE = 3;

// Width of the seek-light and avoid-light windows around Tmin.
export const LIGHT_WINDOW_HOURS = 4;

// Delay instead of advance when the advance would exceed this many hours.
export const MAX_ADVANCE_HOURS = 9;

// Hours of shift per day earned without any light management, after arrival.
export const UNMANAGED_RATE = { delay: 1.5, advance: 1.0 };

// Extra hours per day when the whole seek window is achieved in bright light, after arrival.
export const LIGHT_BONUS = { delay: 0.5, advance: 0.5 };

// Maximum hours per day before the flight, from shifting sleep plus a full seek window.
export const PREFLIGHT_MAX_RATE = { delay: 1.0, advance: 0.5 };

// How much of the light bonus ordinary indoor light earns compared with daylight or a light box.
export const ROOM_LIGHT_FACTOR = 0.6;

// Local clock hours treated as daylight when no sun data is available.
export const DAYLIGHT_HOURS = { start: 7, end: 19 };

// Hours the scheduled sleep window moves each preflight day.
export const PREFLIGHT_SLEEP_STEP = { delay: 1.0, advance: 0.5 };

// Never schedule a night shorter than this.
export const MIN_SLEEP_HOURS = 6.5;

// Default wake on the travel day, hours before departure, when none is given.
export const DEFAULT_TRAVEL_WAKE_BEFORE_DEPARTURE_HOURS = 4;

// An awake stretch longer than this earns a nap slot.
export const LONG_WAKE_HOURS = 18;
export const NAP_MAX_MINUTES = 90;
export const NAP_MIN_HOURS_BEFORE_BED = 8;
export const NAP_EARLIEST_HOURS_AFTER_WAKE = 1;

// A first destination night may start this much earlier than habitual bedtime when the day has been very long.
export const EARLY_FIRST_BED_HOURS = 1;
export const VERY_LONG_WAKE_HOURS = 20;

// In-flight sleep is scheduled when the flight overlaps the body's night by at least this much.
export const BIOLOGICAL_NIGHT_BEFORE_TMIN_HOURS = 5;
export const BIOLOGICAL_NIGHT_AFTER_TMIN_HOURS = 3;
export const MIN_INFLIGHT_SLEEP_HOURS = 2;
export const INFLIGHT_SLEEP_MARGIN_MINUTES = 30;

// Caffeine cutoff before bedtime and suggested dose, by habit.
export const CAFFEINE_CUTOFF_HOURS = { none: 8, regular: 6 };
export const CAFFEINE_DOSE = { none: '50 to 100 mg', regular: '100 to 200 mg' };
// Suggest doses only when the waking stretch is at least this long.
export const CAFFEINE_DOSE_WAKE_HOURS = 18;
// A dose closer than this to the cutoff is pointless and is not suggested.
export const CAFFEINE_DOSE_MIN_HOURS_BEFORE_CUTOFF = 1;

// Melatonin. Advances: a small dose in the biological afternoon. Delays: optional sleep aid at bedtime.
export const MELATONIN_ADVANCE_DOSE = '0.5 mg';
export const MELATONIN_ADVANCE_HOURS_BEFORE_TMIN = 10;
export const MELATONIN_DELAY_DOSE = '0.5 mg';
export const MELATONIN_DELAY_MINUTES_BEFORE_BED = 30;
export const MELATONIN_NIGHTS = 3;

// Ignore avoid-light fragments shorter than this.
export const MIN_DARK_FRAGMENT_MINUTES = 45;

// Default inputs shown when the page has no query string.
export const DEFAULT_INPUT = {
  homeZone: 'Europe/London',
  destZone: 'America/Los_Angeles',
  homeAirport: 'LHR',
  destAirport: 'SFO',
  habitualBed: '23:00',
  habitualWake: '07:00',
  flight: { depart: '2026-09-16T10:35', arrive: '2026-09-16T13:35' },
  travelDayWake: '06:30',
  preflightDays: 3,
  postDays: 5,
  caffeine: 'none',
  melatonin: true,
  lightBox: false,
} as const;
