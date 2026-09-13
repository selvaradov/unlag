import type { CaffeineHabit, PlanInput } from '../algorithm/types.ts';
import { FORM } from '../copy.ts';
import { ICONS, type IconName } from './icons.ts';

function zoneOptions(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['Europe/London', 'America/Los_Angeles', 'America/New_York', 'Asia/Tokyo', 'Australia/Sydney'];
  }
}

function field(label: string, iconName: IconName, control: HTMLElement): HTMLLabelElement {
  const l = document.createElement('label');
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

  const list = document.createElement('datalist');
  list.id = 'zones';
  for (const z of zoneOptions()) {
    const o = document.createElement('option');
    o.value = z;
    list.appendChild(o);
  }
  form.appendChild(list);

  const homeZone = text(input.homeZone, { list: 'zones', autocomplete: 'off', id: 'f-home' });
  const destZone = text(input.destZone, { list: 'zones', autocomplete: 'off', id: 'f-dest' });
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
    field(FORM.homeZone, 'globe', homeZone),
    field(FORM.destZone, 'globe', destZone),
    field(FORM.depart, 'plane', depart),
    field(FORM.arrive, 'landing', arrive),
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

  const zones = new Set(zoneOptions());
  const read = (): PlanInput | null => {
    if (!zones.has(homeZone.value) || !zones.has(destZone.value)) return null;
    if (!depart.value || !arrive.value || !bed.value || !wake.value) return null;
    return {
      homeZone: homeZone.value,
      destZone: destZone.value,
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
  form.addEventListener('change', () => {
    const next = read();
    if (next) onChange(next);
  });
  return form;
}
