// The edit form: every trip field on one grid, applying changes as they are made.
import type { PlanInput } from '../algorithm/types.ts';
import { createTripFields } from './tripFields.ts';

export { validate } from './tripFields.ts';

export function renderForm(input: PlanInput, onChange: (next: PlanInput) => void): HTMLElement {
  const form = document.createElement('form');
  form.className = 'trip-form';
  form.noValidate = true;
  form.addEventListener('submit', (ev) => ev.preventDefault());
  const fields = createTripFields(input, () => {
    const next = fields.check();
    if (next) onChange(next);
  });
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.append(...fields.flight, ...fields.sleep, ...fields.options);
  form.append(fields.lookup, grid, fields.checks, fields.error);
  form.addEventListener('change', (ev) => {
    if ((ev.target as HTMLElement).closest('.airport-picker, .lookup')) return;
    const next = fields.check();
    if (next) onChange(next);
  });
  return form;
}
