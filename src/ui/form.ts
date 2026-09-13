import type { CaffeineHabit, PlanInput } from '../algorithm/types.ts';
import { FORM } from '../copy.ts';
import type { Airport } from '../data/airports.ts';
import { renderAirportPicker } from './airportPicker.ts';
import { ICONS, type IconName } from './icons.ts';

function field(label: string, iconName: IconName, control: HTMLElement, cls = ''): HTMLLabelElement {
  const l = document.createElement('label');
  if (cls) l.className = cls;
  const span = document.createElement('span');
  span.className = 'field-label';
  span.innerHTML = `${ICONS[iconName]}${label}`;
  l.append(span, control);
  return l;
}

function text(value: string, attrs: Record<string, string> = {}): HTMLInputElement {
  const i = document.createElement('input');
  i.value = value;
  for (const [k, v] of Object.entries(attrs)) i.setAttribute(k, v);
  return i;
}

export function renderForm(input: PlanInput, onChange: (next: PlanInput) => void): HTMLElement {
  const form = document.createElement('form');
  form.className = 'trip-form';
  form.addEventListener('submit', (ev) => ev.preventDefault());

  // Airports picked here; the zones they carry feed the plan.
  let home: Airport | null = null;
  let dest: Airport | null = null;
  const emit = () => {
    const next = read();
    if (next) onChange(next);
  };
  const homePicker = renderAirportPicker({
    id: 'f-home',
    initialText: input.homeAirport ?? '',
    placeholder: FORM.airportPlaceholder,
    onPick: (a) => {
      home = a;
      emit();
    },
  });
  const destPicker = renderAirportPicker({
    id: 'f-dest',
    initialText: input.destAirport ?? '',
    placeholder: FORM.airportPlaceholder,
    onPick: (a) => {
      dest = a;
      emit();
    },
  });
  const depart = text(input.flight.depart, { type: 'datetime-local', id: 'f-depart' });
  const arrive = text(input.flight.arrive, { type: 'datetime-local', id: 'f-arrive' });
  const bed = text(input.habitualBed, { type: 'time', id: 'f-bed' });
  const wake = text(input.habitualWake, { type: 'time', id: 'f-wake' });
  const travelWake = text(input.travelDayWake ?? '', { type: 'time', id: 'f-travel-wake' });
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

  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.append(
    field(FORM.homeAirport, 'plane', homePicker),
    field(FORM.destAirport, 'plane', destPicker),
    field(FORM.depart, 'clock', depart, 'wide-field'),
    field(FORM.arrive, 'clock', arrive, 'wide-field'),
    field(FORM.bed, 'bed', bed),
    field(FORM.wake, 'clock', wake),
    field(FORM.travelWake, 'clock', travelWake),
    field(FORM.preflightDays, 'days', pre),
    field(FORM.postDays, 'days', post),
    field(FORM.caffeine, 'cup', caffeine),
  );
  const checks = document.createElement('div');
  checks.className = 'checks';
  const melLabel = document.createElement('label');
  melLabel.append(melatonin, document.createTextNode(FORM.melatonin));
  melLabel.insertAdjacentHTML('beforeend', ICONS.pill);
  const boxLabel = document.createElement('label');
  boxLabel.append(lightBox, document.createTextNode(FORM.lightBox));
  boxLabel.insertAdjacentHTML('beforeend', ICONS.lamp);
  checks.append(melLabel, boxLabel);
  form.append(grid, checks);

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
      travelDayWake: travelWake.value || undefined,
      preflightDays: Math.max(0, Math.min(3, Number(pre.value) || 0)),
      postDays: Math.max(1, Math.min(10, Number(post.value) || 1)),
      caffeine: caffeine.value as CaffeineHabit,
      melatonin: melatonin.checked,
      lightBox: lightBox.checked,
    };
  };
  form.addEventListener('change', (ev) => {
    if ((ev.target as HTMLElement).closest('.airport-picker')) return;
    emit();
  });
  return form;
}
