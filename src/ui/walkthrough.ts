// The first run: three steps that build a plan when the page opens without one.
import type { PlanInput } from '../algorithm/types.ts';
import { DEFAULT_INPUT } from '../config.ts';
import { APP_NAME, CODE, CREDIT, TAGLINE, WALK } from '../copy.ts';
import { findAirport, loadAirports } from '../data/airports.ts';
import { PlanCodeError, lookupCode } from './planCode.ts';
import { createTripFields } from './tripFields.ts';
import { ICONS } from './icons.ts';

export interface WalkthroughOptions {
  // A starting point for the fields; the flight and airports are blanked.
  base: PlanInput;
  onFinish: (input: PlanInput) => void;
  onExample: () => void;
  // A plan fetched by code, as a query string.
  onCode: (search: string) => void;
}

export function renderWalkthrough(opts: WalkthroughOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'walkthrough';
  const start: PlanInput = {
    ...opts.base,
    homeAirport: undefined,
    destAirport: undefined,
    flight: { depart: '', arrive: '' },
  };
  const fields = createTripFields(start, () => {
    if (!fields.error.hidden) fields.check();
  });
  let step = 0;

  const header = document.createElement('header');
  header.className = 'walk-header';
  header.innerHTML = `<span class="brand">${APP_NAME}</span><h1>${WALK.title}</h1><p class="lede">${TAGLINE} ${WALK.intro}</p>`;
  root.appendChild(header);
  root.appendChild(codeEntry(opts.onCode));

  const progress = document.createElement('ol');
  progress.className = 'walk-steps';
  progress.innerHTML = WALK.steps.map((s, i) => `<li data-step="${i}">${s}</li>`).join('');
  root.appendChild(progress);

  const panels: HTMLElement[] = [];
  const panel = (hint: string, ...content: HTMLElement[]) => {
    const p = document.createElement('section');
    p.className = 'walk-panel';
    const h = document.createElement('p');
    h.className = 'hint-lede';
    h.textContent = hint;
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.append(...content);
    p.append(h, grid);
    panels.push(p);
    return p;
  };
  const flightPanel = panel(WALK.flightHint, ...fields.flight);
  flightPanel.insertBefore(fields.lookup, flightPanel.querySelector('.grid'));
  if (import.meta.env.DEV) {
    // Saves typing a flight on every check of the walkthrough. Not built for production.
    const fill = document.createElement('button');
    fill.type = 'button';
    fill.className = 'text-button dev-fill';
    fill.textContent = WALK.devFill;
    fill.addEventListener('click', async () => {
      const airports = await loadAirports();
      const from = findAirport(airports, DEFAULT_INPUT.homeAirport);
      const to = findAirport(airports, DEFAULT_INPUT.destAirport);
      if (from && to) fields.setFlight(from, to, DEFAULT_INPUT.flight.depart, DEFAULT_INPUT.flight.arrive);
    });
    flightPanel.insertBefore(fill, flightPanel.querySelector('.grid'));
  }
  panel(WALK.sleepHint, ...fields.sleep);
  const optionsPanel = panel(WALK.optionsHint, ...fields.options);
  optionsPanel.appendChild(fields.checks);
  const form = document.createElement('form');
  form.noValidate = true;
  form.className = 'trip-form walk-form';
  form.addEventListener('submit', (ev) => ev.preventDefault());
  form.append(...panels, fields.error);
  root.appendChild(form);

  const nav = document.createElement('div');
  nav.className = 'walk-nav';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'icon-button';
  back.innerHTML = `${ICONS.chevron}<span>${WALK.back}</span>`;
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'icon-button primary';
  nav.append(back, next);
  root.appendChild(nav);

  const example = document.createElement('button');
  example.type = 'button';
  example.className = 'text-button example';
  example.textContent = WALK.example;
  example.addEventListener('click', () => opts.onExample());
  root.appendChild(example);
  const credit = document.createElement('p');
  credit.className = 'footer credit';
  credit.innerHTML = CREDIT;
  root.appendChild(credit);

  const show = () => {
    panels.forEach((p, i) => (p.hidden = i !== step));
    progress.querySelectorAll('li').forEach((li, i) => {
      li.classList.toggle('current', i === step);
      li.classList.toggle('done', i < step);
    });
    back.hidden = step === 0;
    const last = step === panels.length - 1;
    next.innerHTML = last ? `${ICONS.check}<span>${WALK.finish}</span>` : `<span>${WALK.next}</span>${ICONS.chevron}`;
    fields.error.hidden = true;
  };
  back.addEventListener('click', () => {
    step = Math.max(0, step - 1);
    show();
  });
  next.addEventListener('click', () => {
    if (step === 0) {
      // The flight step must be complete before moving on.
      const draft = fields.read();
      if (!fields.hasAirports() || !draft || !draft.flight.depart || !draft.flight.arrive) {
        fields.check();
        if (fields.error.hidden) fields.error.hidden = false;
        return;
      }
      const good = fields.check();
      if (!good) return;
    }
    if (step < panels.length - 1) {
      step += 1;
      show();
      return;
    }
    const input = fields.check();
    if (input) opts.onFinish(input);
  });
  show();
  return root;
}

// A plan made on another device is one code away, offered before the first step.
function codeEntry(onCode: (search: string) => void): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'code-entry';
  const lede = document.createElement('p');
  lede.className = 'hint-lede';
  lede.textContent = CODE.have;
  const lookup = document.createElement('div');
  lookup.className = 'lookup';
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'f-code';
  input.className = 'code-input';
  input.placeholder = CODE.placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'characters');
  input.maxLength = 8;
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'icon-button';
  go.innerHTML = `<span>${CODE.open}</span>${ICONS.arrowRight}`;
  const status = document.createElement('p');
  status.className = 'lookup-status';
  status.hidden = true;
  const row = document.createElement('div');
  row.className = 'code-row';
  row.append(input, go);
  lookup.append(row, status);
  const say = (msg: string, kind: 'error' | 'busy') => {
    status.hidden = false;
    status.className = `lookup-status ${kind}`;
    status.textContent = msg;
  };
  go.addEventListener('click', async () => {
    say(CODE.looking, 'busy');
    go.disabled = true;
    try {
      onCode(await lookupCode(input.value));
    } catch (err) {
      const kind = err instanceof PlanCodeError ? err.code : 'failed';
      say(CODE.errors[kind] ?? CODE.errors.failed, 'error');
    } finally {
      go.disabled = false;
    }
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      go.click();
    }
  });
  wrap.append(lede, lookup);
  return wrap;
}
