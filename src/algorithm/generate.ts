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
  if (untilBed <= cfg.EVENING_LANDING_HOURS_BEFORE_BED || untilWake < untilBed) {
    // Evening or night landing: bed soon after landing, up at the usual time, never a short night.
    bed = arrive + cfg.LANDING_TO_BED_HOURS * HOUR;
    wake = bed + untilWake * HOUR - cfg.LANDING_TO_BED_HOURS * HOUR;
    while (wake <= bed) wake += DAY;
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
  return { ...overlap, inFlight: true };
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

export function generatePlan(input: PlanInput): Plan {
  const depart = DateTime.fromISO(input.flight.depart, { zone: input.homeZone }).toMillis();
  const arrive = DateTime.fromISO(input.flight.arrive, { zone: input.destZone }).toMillis();
  const flight: Interval = { start: depart, end: arrive };
  const { direction, total } = chooseDirection(delayHours(depart, arrive, input));
  const sign = direction === 'delay' ? 1 : -1;

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
    const next = roundTo(tmin + DAY + sign * earned * HOUR, 5);
    if (next !== provisional) windows = lightWindows(direction, tmin, next, sleeps, arrive, input);
    remaining -= earned;
    for (const p of windows.seek) if (p.start < planEnd && p.end > planStart) events.push({ kind: 'light', ...p });
    for (const p of windows.avoid) if (p.start < planEnd && p.end > planStart) events.push({ kind: 'dark', ...p });
    if (direction === 'advance' && input.melatonin && remaining > 0.01) {
      const at = next - cfg.MELATONIN_ADVANCE_HOURS_BEFORE_TMIN * HOUR;
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
      const allowed: Interval = {
        start: wake + cfg.NAP_EARLIEST_HOURS_AFTER_WAKE * HOUR,
        end: bed - cfg.NAP_MIN_HOURS_BEFORE_BED * HOUR,
      };
      // Prefer napping on the plane, in the dark window if it falls there, then any dark window, then as early as allowed.
      const candidates: (Interval | null)[] = [
        ...darks.map((d) => intersect(intersect(d, flightUsable) ?? { start: 0, end: 0 }, allowed)),
        intersect(flightUsable, allowed),
        ...darks.map((d) => intersect(d, allowed)),
        allowed,
      ];
      const pick = candidates.find((c) => c && c.end - c.start >= 30 * MINUTE);
      if (pick) {
        nap = { start: pick.start, end: Math.min(pick.end, pick.start + cfg.NAP_MAX_MINUTES * MINUTE) };
        events.push({ kind: 'nap', ...nap, optional: true });
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
