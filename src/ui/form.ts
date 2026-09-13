import type { CaffeineHabit, PlanInput } from '../algorithm/types.ts';
import { FORM } from '../copy.ts';

function zoneOptions(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['Europe/London', 'America/Los_Angeles', 'America/New_York', 'Asia/Tokyo', 'Australia/Sydney'];
  }
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const l = document.createElement('label');
  const span = document.createElement('span');
  span.textContent = label;
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
  const details = document.createElement('details');
  details.className = 'trip-form';
  const summary = document.createElement('summary');
  summary.textContent = FORM.title;
  details.appendChild(summary);
  const form = document.createElement('form');
  form.addEventListener('submit', (ev) => ev.preventDefault());

  const list = document.createElement('datalist');
  list.id = 'zones';
  for (const z of zoneOptions()) {
    const o = document.createElement('option');
    o.value = z;
    list.appendChild(o);
  }
  form.appendChild(list);

  const homeZone = text(input.homeZone, { list: 'zones', autocomplete: 'off' });
  const destZone = text(input.destZone, { list: 'zones', autocomplete: 'off' });
  const depart = text(input.flight.depart, { type: 'datetime-local' });
  const arrive = text(input.flight.arrive, { type: 'datetime-local' });
  const bed = text(input.habitualBed, { type: 'time' });
  const wake = text(input.habitualWake, { type: 'time' });
  const travelWake = text(input.travelDayWake ?? '', { type: 'time' });
  const pre = text(String(input.preflightDays), { type: 'number', min: '0', max: '3' });
  const post = text(String(input.postDays), { type: 'number', min: '1', max: '10' });
  const caffeine = document.createElement('select');
  for (const [value, label] of Object.entries(FORM.caffeineOptions)) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    o.selected = value === input.caffeine;
    caffeine.appendChild(o);
  }
  const melatonin = text('', { type: 'checkbox' });
  melatonin.checked = input.melatonin;
  const lightBox = text('', { type: 'checkbox' });
  lightBox.checked = input.lightBox;

  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.append(
    field(FORM.homeZone, homeZone),
    field(FORM.destZone, destZone),
    field(FORM.depart, depart),
    field(FORM.arrive, arrive),
    field(FORM.bed, bed),
    field(FORM.wake, wake),
    field(FORM.travelWake, travelWake),
    field(FORM.preflightDays, pre),
    field(FORM.postDays, post),
    field(FORM.caffeine, caffeine),
  );
  const checks = document.createElement('div');
  checks.className = 'checks';
  const melLabel = document.createElement('label');
  melLabel.append(melatonin, document.createTextNode(FORM.melatonin));
  const boxLabel = document.createElement('label');
  boxLabel.append(lightBox, document.createTextNode(FORM.lightBox));
  checks.append(melLabel, boxLabel);
  form.append(grid, checks);
  details.appendChild(form);

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
  return details;
}
