// The trip inputs as reusable controls, shared by the edit form and the walkthrough.
import { DateTime } from 'luxon';
import type { CaffeineHabit, PlanInput } from '../algorithm/types.ts';
import { automaticTravelDayWake } from '../algorithm/generate.ts';
import { planProblem } from '../algorithm/validate.ts';
import { BEDTIME_RANGE, HABITUAL_SLEEP_HOURS, TIME_STEP_MINUTES, TRAVEL_WAKE_RANGE } from '../config.ts';
import { FORM, LOOKUP } from '../copy.ts';
import type { Airport } from '../data/airports.ts';
import { FlightLookupError, lookupFlight } from '../data/flights.ts';
import { renderAirportPicker } from './airportPicker.ts';
import { duration } from './format.ts';
import { ICONS, type IconName } from './icons.ts';

// A labelled control. A control made of several inputs gets a div rather than a label, which can only point at one.
export function field(
  label: string,
  iconName: IconName,
  control: HTMLElement,
  opts: { cls?: string; hint?: string; composite?: boolean } = {},
): HTMLElement {
  const l = document.createElement(opts.composite ? 'div' : 'label');
  l.className = `field ${opts.cls ?? ''}`.trim();
  const span = document.createElement('span');
  span.className = 'field-label';
  span.innerHTML = `${ICONS[iconName]}${label}`;
  l.append(span, control);
  if (opts.hint) {
    const hint = document.createElement('small');
    hint.className = 'hint';
    hint.textContent = opts.hint;
    l.appendChild(hint);
  }
  return l;
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMinutes = (m: number) => {
  const wrapped = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
};

// Clock times from `from` to `to` in fixed steps, wrapping past midnight; the current value is kept even off the grid.
export function timeOptions(from: string, to: string, current?: string): string[] {
  const start = toMinutes(from);
  let end = toMinutes(to);
  if (end <= start) end += 1440;
  const out: string[] = [];
  for (let m = start; m <= end; m += TIME_STEP_MINUTES) out.push(fromMinutes(m));
  if (current && !out.includes(current)) out.push(current);
  return out;
}

// Wake times that keep the usual night between the shortest and longest habitual sleep.
export function wakeTimesFor(bed: string, current?: string): string[] {
  const b = toMinutes(bed);
  return timeOptions(
    fromMinutes(b + HABITUAL_SLEEP_HOURS.min * 60),
    fromMinutes(b + HABITUAL_SLEEP_HOURS.max * 60),
    current,
  );
}

// Shortest distance between two clock times, going either way round midnight.
function clockDistance(a: string, b: string): number {
  const d = Math.abs(toMinutes(a) - toMinutes(b));
  return Math.min(d, 1440 - d);
}

interface TimeControl {
  root: HTMLElement;
  value: () => string;
  set: (v: string) => void;
  // Replaces the choices, moving the value to the nearest one when it is no longer offered.
  setTimes: (times: string[]) => void;
  setDisabled: (disabled: boolean) => void;
  onChange: (cb: () => void) => void;
}

// A clock time as an hour select and a minute select, offering only the given times.
function timeControl(id: string, times: string[], value: string): TimeControl {
  const root = document.createElement('span');
  root.className = 'hm';
  const hour = document.createElement('select');
  hour.id = id;
  const minute = document.createElement('select');
  minute.id = `${id}-min`;
  const colon = document.createElement('span');
  colon.textContent = ':';
  root.append(hour, colon, minute);
  let allowed = times;
  let current = value;
  const listeners: (() => void)[] = [];

  const fill = (sel: HTMLSelectElement, options: string[], selected: string) => {
    sel.innerHTML = '';
    for (const v of options) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      o.selected = v === selected;
      sel.appendChild(o);
    }
  };
  const render = () => {
    const h = current.slice(0, 2);
    fill(hour, [...new Set(allowed.map((t) => t.slice(0, 2)))], h);
    fill(
      minute,
      allowed.filter((t) => t.startsWith(h)).map((t) => t.slice(3)),
      current.slice(3),
    );
  };
  const nearest = (target: string, from: string[]) =>
    from.reduce((best, t) => (clockDistance(t, target) < clockDistance(best, target) ? t : best), from[0]);
  render();

  hour.addEventListener('change', () => {
    const want = `${hour.value}:${current.slice(3)}`;
    current = nearest(
      want,
      allowed.filter((t) => t.startsWith(hour.value)),
    );
    render();
    for (const cb of listeners) cb();
  });
  minute.addEventListener('change', () => {
    current = `${hour.value}:${minute.value}`;
    for (const cb of listeners) cb();
  });

  return {
    root,
    value: () => current,
    set: (v) => {
      current = v;
      render();
    },
    setTimes: (next) => {
      allowed = next;
      if (!allowed.includes(current)) current = nearest(current, allowed);
      render();
    },
    setDisabled: (disabled) => {
      hour.disabled = disabled;
      minute.disabled = disabled;
    },
    onChange: (cb) => listeners.push(cb),
  };
}

function text(value: string, attrs: Record<string, string> = {}): HTMLInputElement {
  const i = document.createElement('input');
  i.value = value;
  for (const [k, v] of Object.entries(attrs)) i.setAttribute(k, v);
  return i;
}

// Checks the inputs make a plan that can be drawn. Returns a message or null.
export function validate(input: PlanInput): string | null {
  const problem = planProblem(input);
  if (problem === null) return null;
  if (problem === 'sleep') return FORM.errors.sleepZero;
  if (problem === 'order') return FORM.errors.arrivalBeforeDeparture;
  if (problem === 'length') return FORM.errors.flightLength;
  return FORM.errors.arrivalBeforeDeparture;
}

export interface TripFields {
  // Labelled controls, grouped the way the walkthrough steps them.
  lookup: HTMLElement;
  flight: HTMLElement[];
  sleep: HTMLElement[];
  options: HTMLElement[];
  checks: HTMLElement;
  error: HTMLElement;
  // The current inputs, or null while a required value is missing.
  read: () => PlanInput | null;
  // Validates and shows or clears the message; returns the input when it is good.
  check: () => PlanInput | null;
  // Airports are required when the plan has none yet.
  hasAirports: () => boolean;
  // Fills the airports and times, as a lookup does.
  setFlight: (from: Airport, to: Airport, depart: string, arrive: string) => void;
}

export function createTripFields(input: PlanInput, onChange: () => void): TripFields {
  let home: Airport | null = null;
  let dest: Airport | null = null;

  const homePicker = renderAirportPicker({
    id: 'f-home',
    initialText: input.homeAirport ?? '',
    placeholder: FORM.airportPlaceholder,
    onPick: (a) => {
      home = a;
      refreshTravelWake();
      onChange();
    },
  });
  const destPicker = renderAirportPicker({
    id: 'f-dest',
    initialText: input.destAirport ?? '',
    placeholder: FORM.airportPlaceholder,
    onPick: (a) => {
      dest = a;
      refreshTravelWake();
      onChange();
    },
  });
  const depart = text(input.flight.depart, { type: 'datetime-local', id: 'f-depart' });
  const arrive = text(input.flight.arrive, { type: 'datetime-local', id: 'f-arrive' });
  // Moving the departure moves the arrival with it, so the flight keeps its length.
  let lastDepart = input.flight.depart;
  depart.addEventListener('change', () => {
    const before = DateTime.fromISO(lastDepart, { zone: home?.tz ?? input.homeZone });
    const after = DateTime.fromISO(depart.value, { zone: home?.tz ?? input.homeZone });
    const arr = DateTime.fromISO(arrive.value, { zone: dest?.tz ?? input.destZone });
    if (before.isValid && after.isValid && arr.isValid) {
      arrive.value = arr.plus({ milliseconds: after.toMillis() - before.toMillis() }).toFormat("yyyy-MM-dd'T'HH:mm");
    }
    lastDepart = depart.value;
  });
  // Airports and times together, from a lookup or a preset.
  const setFlight = (from: Airport, to: Airport, dep: string, arr: string) => {
    home = from;
    dest = to;
    homePicker.querySelector('input')!.value = `${from.code} · ${from.city}`;
    destPicker.querySelector('input')!.value = `${to.code} · ${to.city}`;
    depart.value = dep;
    lastDepart = dep;
    arrive.value = arr;
  };
  const bed = timeControl(
    'f-bed',
    timeOptions(BEDTIME_RANGE.from, BEDTIME_RANGE.to, input.habitualBed),
    input.habitualBed,
  );
  const wake = timeControl('f-wake', wakeTimesFor(input.habitualBed, input.habitualWake), input.habitualWake);
  // Moving bedtime keeps the wake choices to a plausible night, nudging the wake time if it falls outside.
  bed.onChange(() => wake.setTimes(wakeTimesFor(bed.value())));
  // Travel day wake: the plan's own choice, shown in the fields but greyed, until the switch is unticked.
  const autoWake = text('', { type: 'checkbox', id: 'f-travel-auto' });
  autoWake.checked = !input.travelDayWake;
  const travelWake = timeControl(
    'f-travel-wake',
    timeOptions(TRAVEL_WAKE_RANGE.from, TRAVEL_WAKE_RANGE.to, input.travelDayWake),
    input.travelDayWake ?? input.habitualWake,
  );
  travelWake.setDisabled(autoWake.checked);
  const travelRow = document.createElement('div');
  travelRow.className = 'time-fields';
  const autoLabel = document.createElement('label');
  autoLabel.className = 'auto';
  autoLabel.append(autoWake, document.createTextNode(FORM.travelWakeAuto));
  travelRow.append(travelWake.root, autoLabel);
  const pre = text(String(input.preflightDays), { type: 'number', min: '0', max: '3', id: 'f-pre' });
  const post = text(String(input.postDays), { type: 'number', min: '1', max: '10', id: 'f-post' });
  const caffeine = document.createElement('select');
  caffeine.id = 'f-caffeine';
  for (const [value, label] of Object.entries(FORM.caffeineOptions)) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    o.selected = value === input.caffeine;
    caffeine.appendChild(o);
  }
  const melatonin = text('', { type: 'checkbox', id: 'f-melatonin' });
  melatonin.checked = input.melatonin;
  const lightBox = text('', { type: 'checkbox', id: 'f-lightbox' });
  lightBox.checked = input.lightBox;

  const read = (): PlanInput | null => {
    if (!depart.value || !arrive.value) return null;
    return {
      homeZone: home?.tz ?? input.homeZone,
      destZone: dest?.tz ?? input.destZone,
      homeAirport: home?.code ?? input.homeAirport,
      destAirport: dest?.code ?? input.destAirport,
      habitualBed: bed.value(),
      habitualWake: wake.value(),
      flight: { depart: depart.value, arrive: arrive.value },
      travelDayWake: autoWake.checked ? undefined : travelWake.value(),
      preflightDays: Math.max(0, Math.min(3, Number(pre.value) || 0)),
      postDays: Math.max(1, Math.min(10, Number(post.value) || 1)),
      caffeine: caffeine.value as CaffeineHabit,
      melatonin: melatonin.checked,
      lightBox: lightBox.checked,
    };
  };

  // While automatic, the fields show the time the plan would pick; the hint says which is being chosen.
  const travelField = field(FORM.travelWake, 'clock', travelRow, {
    cls: 'wide-field',
    hint: FORM.travelWakeAutoHint,
    composite: true,
  });
  const travelHint = travelField.querySelector('.hint')!;
  const refreshTravelWake = () => {
    travelHint.textContent = autoWake.checked ? FORM.travelWakeAutoHint : FORM.travelWakeHint;
    if (!autoWake.checked) return;
    const current = read();
    if (!current) return;
    const at = automaticTravelDayWake(current);
    travelWake.setTimes(timeOptions(TRAVEL_WAKE_RANGE.from, TRAVEL_WAKE_RANGE.to, at));
    travelWake.set(at);
  };
  autoWake.addEventListener('change', () => {
    travelWake.setDisabled(autoWake.checked);
    refreshTravelWake();
  });
  bed.onChange(refreshTravelWake);
  wake.onChange(refreshTravelWake);
  for (const el of [depart, arrive, pre]) el.addEventListener('change', refreshTravelWake);
  refreshTravelWake();

  // Flight number lookup fills the airports and times in.
  const lookup = document.createElement('div');
  lookup.className = 'lookup';
  const number = text('', {
    type: 'text',
    id: 'f-flight',
    placeholder: LOOKUP.placeholder,
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const date = text((input.flight.depart.slice(0, 10) || DateTime.now().toISODate()) ?? '', {
    type: 'date',
    id: 'f-flight-date',
  });
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'icon-button';
  go.innerHTML = `${ICONS.planeTakeoff}<span>${LOOKUP.button}</span>`;
  const status = document.createElement('p');
  status.className = 'lookup-status';
  status.hidden = true;
  const row = document.createElement('div');
  row.className = 'lookup-row';
  row.append(field(LOOKUP.label, 'plane', number), field(LOOKUP.date, 'calendar', date), go);
  lookup.append(row, status);
  const say = (msg: string, kind: 'ok' | 'error' | 'busy') => {
    status.hidden = false;
    status.className = `lookup-status ${kind}`;
    status.textContent = msg;
  };
  go.addEventListener('click', async () => {
    say(LOOKUP.looking, 'busy');
    go.disabled = true;
    try {
      const r = await lookupFlight(number.value, date.value);
      setFlight(r.from, r.to, r.depart, r.arrive);
      const dep = DateTime.fromISO(r.depart, { zone: r.from.tz });
      const arr = DateTime.fromISO(r.arrive, { zone: r.to.tz });
      say(
        LOOKUP.found(
          r.from.code,
          r.to.code,
          dep.toFormat('HH:mm'),
          arr.toFormat('HH:mm'),
          duration(arr.toMillis() - dep.toMillis()),
          r.stops,
        ),
        'ok',
      );
      refreshTravelWake();
      onChange();
    } catch (err) {
      const code = err instanceof FlightLookupError ? err.code : 'failed';
      say(LOOKUP.errors[code] ?? LOOKUP.errors.failed, 'error');
    } finally {
      go.disabled = false;
    }
  });
  number.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      go.click();
    }
  });

  const error = document.createElement('p');
  error.className = 'form-error';
  error.hidden = true;

  const hasAirports = () => Boolean((home ?? input.homeAirport) && (dest ?? input.destAirport));
  const check = (): PlanInput | null => {
    const next = read();
    const message = !hasAirports() ? FORM.errors.airport : next ? validate(next) : null;
    error.hidden = message === null;
    error.innerHTML = message ? `${ICONS.alert}<span>${message}</span>` : '';
    return next && message === null ? next : null;
  };

  const checks = document.createElement('div');
  checks.className = 'checks';
  const melLabel = document.createElement('label');
  melLabel.append(melatonin, document.createTextNode(FORM.melatonin));
  melLabel.insertAdjacentHTML('beforeend', ICONS.pill);
  const boxLabel = document.createElement('label');
  boxLabel.append(lightBox, document.createTextNode(FORM.lightBox));
  boxLabel.insertAdjacentHTML('beforeend', ICONS.lamp);
  checks.append(melLabel, boxLabel);

  return {
    lookup,
    flight: [
      field(FORM.homeAirport, 'planeTakeoff', homePicker),
      field(FORM.destAirport, 'planeLanding', destPicker),
      field(FORM.depart, 'clock', depart, { cls: 'wide-field' }),
      field(FORM.arrive, 'clock', arrive, { cls: 'wide-field' }),
    ],
    sleep: [
      field(FORM.bed, 'bed', bed.root, { composite: true }),
      field(FORM.wake, 'clock', wake.root, { composite: true }),
      travelField,
    ],
    options: [
      field(FORM.preflightDays, 'days', pre, { hint: FORM.preflightHint }),
      field(FORM.postDays, 'days', post, { hint: FORM.postHint }),
      field(FORM.caffeine, 'cup', caffeine),
    ],
    checks,
    error,
    read,
    check,
    hasAirports,
    setFlight,
  };
}
