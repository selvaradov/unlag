// The trip inputs as reusable controls, shared by the edit form and the walkthrough.
import { DateTime } from 'luxon';
import type { CaffeineHabit, PlanInput } from '../algorithm/types.ts';
import { BEDTIME_RANGE, TIME_STEP_MINUTES, TRAVEL_WAKE_RANGE, WAKE_RANGE } from '../config.ts';
import { FORM, LOOKUP } from '../copy.ts';
import type { Airport } from '../data/airports.ts';
import { FlightLookupError, lookupFlight } from '../data/flights.ts';
import { renderAirportPicker } from './airportPicker.ts';
import { duration } from './format.ts';
import { ICONS, type IconName } from './icons.ts';

export function field(
  label: string,
  iconName: IconName,
  control: HTMLElement,
  opts: { cls?: string; hint?: string } = {},
): HTMLLabelElement {
  const l = document.createElement('label');
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

// Clock times from `from` to `to` in fixed steps, wrapping past midnight; the current value is kept even off the grid.
export function timeOptions(from: string, to: string, current?: string): string[] {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const fmt = (m: number) =>
    `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const start = toMin(from);
  let end = toMin(to);
  if (end <= start) end += 1440;
  const out: string[] = [];
  for (let m = start; m <= end; m += TIME_STEP_MINUTES) out.push(fmt(m));
  if (current && !out.includes(current)) out.push(current);
  return out;
}

function timeSelect(value: string, range: { from: string; to: string }, id: string): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.id = id;
  for (const t of timeOptions(range.from, range.to, value || undefined)) {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = t;
    o.selected = t === value;
    sel.appendChild(o);
  }
  return sel;
}

function text(value: string, attrs: Record<string, string> = {}): HTMLInputElement {
  const i = document.createElement('input');
  i.value = value;
  for (const [k, v] of Object.entries(attrs)) i.setAttribute(k, v);
  return i;
}

// Checks the inputs make a plan that can be drawn. Returns a message or null.
export function validate(input: PlanInput): string | null {
  const dep = DateTime.fromISO(input.flight.depart, { zone: input.homeZone });
  const arr = DateTime.fromISO(input.flight.arrive, { zone: input.destZone });
  if (!dep.isValid || !arr.isValid || arr <= dep) return FORM.errors.arrivalBeforeDeparture;
  if (input.habitualBed === input.habitualWake) return FORM.errors.sleepZero;
  return null;
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
      onChange();
    },
  });
  const destPicker = renderAirportPicker({
    id: 'f-dest',
    initialText: input.destAirport ?? '',
    placeholder: FORM.airportPlaceholder,
    onPick: (a) => {
      dest = a;
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
  const bed = timeSelect(input.habitualBed, BEDTIME_RANGE, 'f-bed');
  const wake = timeSelect(input.habitualWake, WAKE_RANGE, 'f-wake');
  // Travel day wake: as usual unless the box is unticked, which reveals a time.
  const usualWake = text('', { type: 'checkbox', id: 'f-travel-usual' });
  usualWake.checked = !input.travelDayWake;
  const travelWake = timeSelect(input.travelDayWake ?? '06:00', TRAVEL_WAKE_RANGE, 'f-travel-wake');
  travelWake.hidden = usualWake.checked;
  usualWake.addEventListener('change', () => {
    travelWake.hidden = usualWake.checked;
  });
  const travelWakeBox = document.createElement('div');
  travelWakeBox.className = 'travel-wake';
  const usualLabel = document.createElement('label');
  usualLabel.className = 'check';
  usualLabel.append(usualWake, document.createTextNode(FORM.travelWakeUsual));
  travelWakeBox.append(usualLabel, travelWake);
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
      home = r.from;
      dest = r.to;
      homePicker.querySelector('input')!.value = `${r.from.code} · ${r.from.city}`;
      destPicker.querySelector('input')!.value = `${r.to.code} · ${r.to.city}`;
      depart.value = r.depart;
      lastDepart = r.depart;
      arrive.value = r.arrive;
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

  const read = (): PlanInput | null => {
    if (!depart.value || !arrive.value || !bed.value || !wake.value) return null;
    return {
      homeZone: home?.tz ?? input.homeZone,
      destZone: dest?.tz ?? input.destZone,
      homeAirport: home?.code ?? input.homeAirport,
      destAirport: dest?.code ?? input.destAirport,
      habitualBed: bed.value,
      habitualWake: wake.value,
      flight: { depart: depart.value, arrive: arrive.value },
      travelDayWake: usualWake.checked ? undefined : travelWake.value,
      preflightDays: Math.max(0, Math.min(3, Number(pre.value) || 0)),
      postDays: Math.max(1, Math.min(10, Number(post.value) || 1)),
      caffeine: caffeine.value as CaffeineHabit,
      melatonin: melatonin.checked,
      lightBox: lightBox.checked,
    };
  };
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
      field(FORM.bed, 'bed', bed),
      field(FORM.wake, 'clock', wake),
      field(FORM.travelWake, 'clock', travelWakeBox, { cls: 'wide-field', hint: FORM.travelWakeHint }),
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
  };
}
