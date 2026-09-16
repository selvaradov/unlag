import { DateTime } from 'luxon';
import * as cfg from '../config.ts';
import type { Direction, Plan, PlanEvent, PlanInput, TminPoint } from './types.ts';
import {
  DAY,
  HOUR,
  MINUTE,
  addDays,
  atClock,
  clockHours,
  contains,
  hours,
  intersect,
  localDate,
  localHour,
  offsetMinutes,
  roundTo,
  subtract,
  type Interval,
} from './time.ts';

// Positive number of hours the clock must move later to reach the destination.
function delayHours(depart: number, arrive: number, input: PlanInput): number {
  const diff = (offsetMinutes(depart, input.homeZone) - offsetMinutes(arrive, input.destZone)) / 60;
  return ((diff % 24) + 24) % 24;
}

export function chooseDirection(delay: number): { direction: Direction; total: number } {
  const advance = (24 - delay) % 24;
  if (advance <= cfg.MAX_ADVANCE_HOURS) return { direction: 'advance', total: advance };
  return { direction: 'delay', total: delay };
}

// Bedtime falls on the same date as the day when it is in the afternoon or evening, otherwise after midnight.
function bedInstant(dateISO: string, bed: string, zone: string): number {
  const date = clockHours(bed) >= 12 ? dateISO : addDays(dateISO, 1, zone);
  return atClock(date, bed, zone);
}

interface Sleep extends Interval {
  inFlight?: boolean;
  // The night before the plan starts, used for clipping windows but never shown.
  context?: boolean;
}

function homeNights(input: PlanInput, depart: number, sign: number, total: number): Sleep[] {
  const zone = input.homeZone;
  const travelDate = localDate(depart, zone);
  const nights = Math.max(1, input.preflightDays);
  const startDate = addDays(travelDate, -nights, zone);
  const out: Sleep[] = [];
  let shift = 0;
  for (let i = 0; i < nights; i++) {
    if (input.preflightDays > 0) {
      const step = sign > 0 ? cfg.PREFLIGHT_SLEEP_STEP.delay : cfg.PREFLIGHT_SLEEP_STEP.advance;
      shift = Math.min(Math.abs(shift) + step, total) * sign;
    }
    const date = addDays(startDate, i, zone);
    let bed = bedInstant(date, input.habitualBed, zone) + shift * HOUR;
    let wake = atClock(addDays(date, 1, zone), input.habitualWake, zone) + shift * HOUR;
    if (i === nights - 1) {
      // The travel day wake is the given time, or the shifted habitual wake unless the flight forces it earlier.
      const latest = depart - cfg.DEFAULT_TRAVEL_WAKE_BEFORE_DEPARTURE_HOURS * HOUR;
      wake = input.travelDayWake ? atClock(travelDate, input.travelDayWake, zone) : Math.min(wake, latest);
      if (wake - bed < cfg.MIN_SLEEP_HOURS * HOUR) bed = wake - cfg.MIN_SLEEP_HOURS * HOUR;
    }
    out.push({ start: bed, end: wake });
  }
  return out;
}

function destinationNights(input: PlanInput, arrive: number, lastWake: number): Sleep[] {
  const zone = input.destZone;
  const bedClock = clockHours(input.habitualBed);
  const wakeClock = clockHours(input.habitualWake);
  const landedAt = localHour(arrive, zone);
  // Hours from landing until the next habitual bedtime and wake, on the destination clock.
  const untilBed = (bedClock - landedAt + 24) % 24;
  const untilWake = (wakeClock - landedAt + 24) % 24;
  let bed: number;
  let wake: number;
  const nightLanding =
    untilWake < untilBed && untilWake - cfg.LANDING_TO_BED_HOURS >= cfg.MIN_NIGHT_LANDING_SLEEP_HOURS;
  if (untilBed <= cfg.EVENING_LANDING_HOURS_BEFORE_BED || nightLanding) {
    // Evening or night landing: bed soon after landing, up at the usual time, never a short night.
    bed = arrive + cfg.LANDING_TO_BED_HOURS * HOUR;
    wake = arrive + untilWake * HOUR;
    if (wake - bed < cfg.MIN_SLEEP_HOURS * HOUR) wake = bed + cfg.MIN_SLEEP_HOURS * HOUR;
  } else {
    // Daytime landing: tonight's usual bedtime, a little earlier after a very long day.
    bed = arrive + untilBed * HOUR;
    wake = atClock(addDays(localDate(bed, zone), 1, zone), input.habitualWake, zone);
    if (bed - lastWake > cfg.VERY_LONG_WAKE_HOURS * HOUR) bed -= cfg.EARLY_FIRST_BED_HOURS * HOUR;
  }
  const out: Sleep[] = [{ start: bed, end: wake }];
  let date = localDate(wake, zone);
  for (let i = 1; i < input.postDays; i++) {
    out.push({
      start: bedInstant(date, input.habitualBed, zone),
      end: atClock(addDays(date, 1, zone), input.habitualWake, zone),
    });
    date = addDays(date, 1, zone);
  }
  return out;
}

// Sleep on the plane only when the flight overlaps the body's night.
function inFlightSleep(flight: Interval, tminNearFlight: number): Sleep | null {
  const night = {
    start: tminNearFlight - cfg.BIOLOGICAL_NIGHT_BEFORE_TMIN_HOURS * HOUR,
    end: tminNearFlight + cfg.BIOLOGICAL_NIGHT_AFTER_TMIN_HOURS * HOUR,
  };
  const usable = {
    start: flight.start + cfg.INFLIGHT_SLEEP_MARGIN_MINUTES * MINUTE,
    end: flight.end - cfg.INFLIGHT_SLEEP_MARGIN_MINUTES * MINUTE,
  };
  const overlap = intersect(night, usable);
  if (!overlap || hours(overlap) < cfg.MIN_INFLIGHT_SLEEP_HOURS) return null;
  return { ...roundWithin(overlap, usable, cfg.SLEEP_ROUNDING_MINUTES), inFlight: true };
}

// Round both ends of an interval to the step, kept inside the bounds.
function roundWithin(i: Interval, bounds: Interval, minutes: number): Interval {
  return {
    start: Math.max(bounds.start, roundTo(i.start, minutes)),
    end: Math.min(bounds.end, roundTo(i.end, minutes)),
  };
}

function roundInterval(i: Interval, minutes: number): Interval {
  return { start: roundTo(i.start, minutes), end: roundTo(i.end, minutes) };
}

// Hours of nap for a waking stretch. The nap grows with the stretch, and grows further when the hours
// awake across the whole stretch would otherwise be too many.
export function napHours(awake: number): number {
  const { min, max, ceiling } = cfg.NAP_LENGTH_HOURS;
  const forStretch = Math.min(awake - cfg.NAP_TARGET_WAKE_HOURS, max);
  const forTotal = awake - cfg.MAX_TOTAL_WAKE_HOURS;
  const wanted = Math.min(Math.max(forStretch, forTotal, min), ceiling);
  return Math.round(wanted / (cfg.SLEEP_ROUNDING_MINUTES / 60)) * (cfg.SLEEP_ROUNDING_MINUTES / 60);
}

interface NapSetting {
  wake: number;
  bed: number;
  required: boolean;
  plane: Interval;
  seek: Interval[];
  avoid: Interval[];
  tmins: number[];
}

// Where a nap of the given length goes. It stays at least an hour after wake and eight before bed, never in a
// seek light window, and a required nap tries to keep the time awake on either side of it bounded. Then it
// prefers the plane, an avoid light window, and the easy hours of the body clock, and steers clear of the
// evening hours when sleep is hard.
function placeNap(length: number, n: NapSetting): Interval | null {
  const L = length * HOUR;
  const hard: Interval = {
    start: n.wake + cfg.NAP_EARLIEST_HOURS_AFTER_WAKE * HOUR,
    end: n.bed - cfg.NAP_MIN_HOURS_BEFORE_BED * HOUR,
  };
  let feasible = subtract(hard, n.seek);
  if (n.required) {
    const around = cfg.MAX_WAKE_AROUND_NAP_HOURS * HOUR;
    const bounded = feasible
      .map((f) => intersect(f, { start: n.bed - around - L, end: n.wake + around + L }))
      .filter((f): f is Interval => f !== null && f.end - f.start >= L);
    if (bounded.length) feasible = bounded;
  }
  const easy = n.tmins.map((t) => ({
    start: t + cfg.EASY_SLEEP_HOURS_AFTER_TMIN.start * HOUR,
    end: t + cfg.EASY_SLEEP_HOURS_AFTER_TMIN.end * HOUR,
  }));
  const hardToSleep = n.tmins.map((t) => ({
    start: t - cfg.HARD_SLEEP_HOURS_BEFORE_TMIN.start * HOUR,
    end: t - cfg.HARD_SLEEP_HOURS_BEFORE_TMIN.end * HOUR,
  }));
  const anywhere = [{ start: -Infinity, end: Infinity }];
  const notHard = subtract({ start: n.wake, end: n.bed }, hardToSleep);
  const preferences: { within: Interval[]; startIn: Interval[] }[] = [
    { within: [n.plane], startIn: n.avoid },
    { within: [n.plane], startIn: easy },
    { within: [n.plane], startIn: notHard },
    { within: [n.plane], startIn: anywhere },
    { within: anywhere, startIn: n.avoid },
    { within: anywhere, startIn: easy },
    { within: anywhere, startIn: anywhere },
  ];
  for (const pref of preferences) {
    for (const f of feasible) {
      for (const w of pref.within) {
        const container = intersect(f, w);
        if (!container) continue;
        for (const p of pref.startIn) {
          const slot = intersect(container, p);
          if (!slot || slot.end - slot.start < 30 * MINUTE) continue;
          const nap = fit(slot.start, L, container);
          if (nap) return nap;
        }
      }
    }
  }
  return null;
}

// A nap starting at the given time, pushed earlier when it would overrun the container, then rounded.
function fit(start: number, L: number, container: Interval): Interval | null {
  let s = roundTo(start, cfg.SLEEP_ROUNDING_MINUTES);
  let e = s + L;
  if (e > container.end) {
    e = roundTo(container.end, cfg.SLEEP_ROUNDING_MINUTES);
    if (e > container.end) e -= cfg.SLEEP_ROUNDING_MINUTES * MINUTE;
    s = e - L;
  }
  if (s < container.start) {
    s = roundTo(container.start, cfg.SLEEP_ROUNDING_MINUTES);
    if (s < container.start) s += cfg.SLEEP_ROUNDING_MINUTES * MINUTE;
  }
  return e - s >= 30 * MINUTE ? { start: s, end: e } : null;
}

function zoneAt(t: number, arrive: number, input: PlanInput): string {
  return t < arrive ? input.homeZone : input.destZone;
}

// Weight of a lit interval: daylight counts in full, indoor light less unless there is a light box.
function lightQuality(piece: Interval, arrive: number, input: PlanInput): number {
  if (input.lightBox) return 1;
  const zone = zoneAt(piece.start, arrive, input);
  const samples = 12;
  let lit = 0;
  for (let k = 0; k < samples; k++) {
    const t = piece.start + ((k + 0.5) / samples) * (piece.end - piece.start);
    const h = localHour(t, zone);
    lit += h >= cfg.DAYLIGHT_HOURS.start && h < cfg.DAYLIGHT_HOURS.end ? 1 : cfg.ROOM_LIGHT_FACTOR;
  }
  return lit / samples;
}

interface LightWindows {
  seek: Interval[];
  avoid: Interval[];
  achieved: number;
}

// Seek window is the nearest four waking hours to Tmin on the shifting side; avoid window is the other side,
// reaching back through the evening for an advance.
function lightWindows(
  direction: Direction,
  prev: number,
  next: number,
  sleeps: Interval[],
  arrive: number,
  input: PlanInput,
): LightWindows {
  const w = cfg.LIGHT_WINDOW_HOURS * HOUR;
  const a = cfg.AVOID_WINDOW_HOURS[direction] * HOUR;
  let seek: Interval;
  let avoid: Interval;
  if (direction === 'delay') {
    const s = contains(sleeps, next);
    const end = s ? s.start : next;
    seek = { start: end - w, end };
    avoid = { start: prev, end: prev + a };
  } else {
    const s = contains(sleeps, prev);
    const start = s ? s.end : prev;
    seek = { start, end: start + w };
    avoid = { start: next - a, end: next };
  }
  const seekPieces = subtract(seek, sleeps);
  const avoidPieces = subtract(avoid, sleeps).filter((p) => p.end - p.start >= cfg.MIN_DARK_FRAGMENT_MINUTES * MINUTE);
  const achieved = seekPieces.reduce(
    (acc, p) => acc + (hours(p) / cfg.LIGHT_WINDOW_HOURS) * lightQuality(p, arrive, input),
    0,
  );
  return { seek: seekPieces, avoid: avoidPieces, achieved };
}

function maxRate(direction: Direction, postArrival: boolean, achieved: number): number {
  if (postArrival) return cfg.UNMANAGED_RATE[direction] + cfg.LIGHT_BONUS[direction] * achieved;
  return cfg.PREFLIGHT_MAX_RATE[direction] * achieved;
}

// The flight as instants, and the direction and size of the shift.
function setup(input: PlanInput) {
  const depart = DateTime.fromISO(input.flight.depart, { zone: input.homeZone }).toMillis();
  const arrive = DateTime.fromISO(input.flight.arrive, { zone: input.destZone }).toMillis();
  const { direction, total } = chooseDirection(delayHours(depart, arrive, input));
  const sign = direction === 'delay' ? 1 : -1;
  return { depart, arrive, direction, total, sign };
}

// The travel day wake the plan chooses when none is given, as a home clock time.
export function automaticTravelDayWake(input: PlanInput): string {
  const { depart, sign, total } = setup(input);
  const home = homeNights({ ...input, travelDayWake: undefined }, depart, sign, total);
  return DateTime.fromMillis(home[home.length - 1].end, { zone: input.homeZone }).toFormat('HH:mm');
}

export function generatePlan(input: PlanInput): Plan {
  const { depart, arrive, direction, total, sign } = setup(input);
  const flight: Interval = { start: depart, end: arrive };

  const home = homeNights(input, depart, sign, total);
  const lastHomeWake = home[home.length - 1].end;
  const tminClockOffset = clockHours(input.habitualWake) - cfg.TMIN_HOURS_BEFORE_WAKE;
  const firstDate = addDays(localDate(depart, input.homeZone), -Math.max(1, input.preflightDays), input.homeZone);
  // Tmin on the morning the plan begins, before any shift.
  let tmin = atClock(firstDate, '00:00', input.homeZone) + tminClockOffset * HOUR;
  if (tmin > home[0].start) tmin -= DAY;

  // Provisional Tmin near the flight, used only to decide whether to sleep on board.
  const preflightNights = Math.max(1, input.preflightDays);
  const provisionalRate = input.preflightDays > 0 ? cfg.PREFLIGHT_MAX_RATE[direction] * cfg.ROOM_LIGHT_FACTOR : 0;
  let nearFlight = tmin + preflightNights * DAY + sign * Math.min(total, provisionalRate * preflightNights) * HOUR;
  const mid = flight.start + (flight.end - flight.start) / 2;
  while (Math.abs(nearFlight + DAY - mid) < Math.abs(nearFlight - mid)) nearFlight += DAY;
  const onBoard = inFlightSleep(flight, nearFlight);

  const dest = destinationNights(input, arrive, onBoard ? onBoard.end : lastHomeWake);
  // The plan begins at the habitual wake before the first shifted night.
  const planStart = atClock(firstDate, input.habitualWake, input.homeZone);
  const planEnd = dest[dest.length - 1].end;
  const priorNight: Sleep = {
    start: bedInstant(addDays(firstDate, -1, input.homeZone), input.habitualBed, input.homeZone),
    end: planStart,
    context: true,
  };
  const sleeps: Sleep[] = [priorNight, ...home, ...(onBoard ? [onBoard] : []), ...dest];

  const events: PlanEvent[] = [];
  const tmins: TminPoint[] = [{ at: tmin, earned: 0 }];
  let remaining = total;
  let adaptedAt: number | null = remaining === 0 ? tmin : null;

  // Walk Tmin forward a day at a time, earning shift from the light that the schedule allows.
  while (tmin + DAY < planEnd + DAY && remaining > 0.01) {
    const postArrival = tmin + DAY > arrive;
    const provisional = tmin + DAY + sign * Math.min(remaining, maxRate(direction, postArrival, 1)) * HOUR;
    let windows = lightWindows(direction, tmin, provisional, sleeps, arrive, input);
    const earned = Math.min(remaining, maxRate(direction, postArrival, windows.achieved));
    const next = tmin + DAY + sign * earned * HOUR;
    if (next !== provisional) windows = lightWindows(direction, tmin, next, sleeps, arrive, input);
    remaining -= earned;
    const shown = (pieces: Interval[]) =>
      pieces
        .map((p) => roundInterval(p, cfg.TMIN_ROUNDING_MINUTES))
        .filter((p) => p.end > p.start && p.start < planEnd && p.end > planStart);
    for (const p of shown(windows.seek)) events.push({ kind: 'light', ...p });
    for (const p of shown(windows.avoid)) events.push({ kind: 'dark', ...p });
    if (direction === 'advance' && input.melatonin && remaining > 0.01) {
      const at = roundTo(next - cfg.MELATONIN_ADVANCE_HOURS_BEFORE_TMIN * HOUR, cfg.TMIN_ROUNDING_MINUTES);
      if (!contains(sleeps, at) && at > planStart && at < planEnd) {
        events.push({ kind: 'melatonin', start: at, end: at, note: cfg.MELATONIN_ADVANCE_DOSE });
      }
    }
    tmins.push({ at: next, earned });
    if (adaptedAt === null && remaining < 0.01) adaptedAt = next;
    tmin = next;
  }

  for (const s of sleeps) {
    if (s.context) continue;
    events.push({ kind: 'sleep', start: s.start, end: s.end, note: s.inFlight ? 'onBoard' : undefined });
  }
  events.push({ kind: 'flight', start: depart, end: arrive });

  // Naps for long waking stretches, caffeine windows and doses, melatonin as a sleep aid for delays.
  const darks = events.filter((e) => e.kind === 'dark');
  const lights = events.filter((e) => e.kind === 'light');
  const cutoffHours = input.caffeine === 'off' ? null : cfg.CAFFEINE_CUTOFF_HOURS[input.caffeine];
  const flightUsable: Interval = {
    start: flight.start + cfg.INFLIGHT_SLEEP_MARGIN_MINUTES * MINUTE,
    end: flight.end - cfg.INFLIGHT_SLEEP_MARGIN_MINUTES * MINUTE,
  };
  let destNightIndex = 0;
  for (let i = 0; i < sleeps.length - 1; i++) {
    const wake = sleeps[i].end;
    const bed = sleeps[i + 1].start;
    const awake = (bed - wake) / HOUR;
    let nap: Interval | null = null;
    if (awake > cfg.LONG_WAKE_HOURS) {
      const required = awake > cfg.REQUIRED_NAP_WAKE_HOURS;
      nap = placeNap(napHours(awake), {
        wake,
        bed,
        required,
        plane: flightUsable,
        seek: lights,
        avoid: darks,
        tmins: tmins.map((t) => t.at),
      });
      if (nap) {
        const onBoard = nap.start >= flight.start && nap.end <= flight.end;
        events.push({ kind: 'nap', ...nap, optional: !required, note: onBoard ? 'onBoard' : undefined });
      }
    }
    if (cutoffHours !== null) {
      const start = nap ? nap.end : wake;
      const end = bed - cutoffHours * HOUR;
      if (end > start) {
        events.push({ kind: 'caffeine', start, end });
        if (awake >= cfg.CAFFEINE_DOSE_WAKE_HOURS) {
          const dose = cfg.CAFFEINE_DOSE[input.caffeine as 'none' | 'regular'];
          const at = nap ? nap.end : wake;
          const lastUseful = end - cfg.CAFFEINE_DOSE_MIN_HOURS_BEFORE_CUTOFF * HOUR;
          if (at <= lastUseful) events.push({ kind: 'caffeineDose', start: at, end: at, note: dose, optional: true });
          if (arrive > at + 3 * HOUR && arrive <= lastUseful) {
            events.push({ kind: 'caffeineDose', start: arrive, end: arrive, note: dose, optional: true });
          }
        }
      }
    }
    const nextSleep = sleeps[i + 1];
    if (direction === 'delay' && input.melatonin && nextSleep.start >= arrive && !nextSleep.inFlight) {
      if (destNightIndex < cfg.MELATONIN_NIGHTS) {
        const at = nextSleep.start - cfg.MELATONIN_DELAY_MINUTES_BEFORE_BED * MINUTE;
        events.push({ kind: 'melatonin', start: at, end: at, note: cfg.MELATONIN_DELAY_DOSE, optional: true });
      }
      destNightIndex++;
    }
  }

  events.sort((a, b) => a.start - b.start || a.end - b.end);
  return { input, direction, totalShiftHours: total, depart, arrive, tmins, events, adaptedAt, planStart, planEnd };
}
