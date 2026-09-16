// Every tunable number in the planner lives here.

// Extra viewports drawn above and below the visible timeline.
export const FEED_VIEWPORT_MARGIN = 1;

// Core body temperature minimum, hours before habitual wake time.
export const TMIN_HOURS_BEFORE_WAKE = 3;

// Width of the seek-light window next to Tmin.
export const LIGHT_WINDOW_HOURS = 4;

// Width of the avoid-light window on the far side of Tmin. For an advance it reaches back through the
// evening, since light in the hours before bed would delay the clock.
export const AVOID_WINDOW_HOURS = { delay: 4, advance: 8 };

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

// An awake stretch longer than this earns a nap. The nap is optional up to the second figure and required beyond it.
export const LONG_WAKE_HOURS = 18;
export const REQUIRED_NAP_WAKE_HOURS = 20;
// Nap length is the stretch minus the target, between min and max. It grows past max, up to the ceiling,
// when the hours awake across the whole stretch would otherwise exceed MAX_TOTAL_WAKE_HOURS.
export const NAP_TARGET_WAKE_HOURS = 18;
export const NAP_LENGTH_HOURS = { min: 1.5, max: 4, ceiling: 6 };
export const MAX_TOTAL_WAKE_HOURS = 24;
// A required nap tries to keep the time awake on either side of it within this.
export const MAX_WAKE_AROUND_NAP_HOURS = 16;
export const NAP_MIN_HOURS_BEFORE_BED = 8;
export const NAP_EARLIEST_HOURS_AFTER_WAKE = 1;
// Naps at least this long are called sleep.
export const LONG_NAP_IS_SLEEP_HOURS = 4;

// Body clock hours, relative to Tmin, when falling asleep is easy (the early afternoon) and hard (the evening).
export const EASY_SLEEP_HOURS_AFTER_TMIN = { start: 8, end: 12 };
export const HARD_SLEEP_HOURS_BEFORE_TMIN = { start: 8, end: 5 };

// Shown times are rounded. Light windows and melatonin hang off the Tmin estimate; naps and sleep on board are coarser.
export const TMIN_ROUNDING_MINUTES = 15;
export const SLEEP_ROUNDING_MINUTES = 30;

// Landing within this many hours before habitual bedtime, or during the night, means sleeping soon after landing.
// A night landing needs room for at least the minimum sleep before habitual wake, otherwise it is a morning arrival.
export const EVENING_LANDING_HOURS_BEFORE_BED = 3;
export const LANDING_TO_BED_HOURS = 1.5;
export const MIN_NIGHT_LANDING_SLEEP_HOURS = 2;

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

// Time choices offered in the form, hours and minutes as separate fields.
export const TIME_STEP_MINUTES = 30;
export const BEDTIME_RANGE = { from: '19:00', to: '03:00' };
// Wake times offered keep the usual night within this many hours.
export const HABITUAL_SLEEP_HOURS = { min: 5, max: 11 };
export const TRAVEL_WAKE_RANGE = { from: '02:00', to: '12:00' };

// Default inputs shown when the page has no query string.
// Plan codes: letters and digits without look alikes, shown in two groups of three.
export const PLAN_CODE = { alphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', length: 6 } as const;

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
