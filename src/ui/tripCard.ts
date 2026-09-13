// The trip at a glance with the calendar and link actions and the method behind the plan.
// While editing, the form takes the card's place with Cancel and Done beneath it.
import type { Plan, PlanInput } from '../algorithm/types.ts';
import { COPY_LINK, DOWNLOAD_ICS, FOOTER, HEADER, LINK_COPIED, METHOD, SUMMARY, zoneCity } from '../copy.ts';
import { findAirport, loadAirports } from '../data/airports.ts';
import { renderForm } from './form.ts';
import { clock, dayLabel, duration, shortDay, zoneAbbr } from './format.ts';
import { ICONS } from './icons.ts';
import { toICS } from './ics.ts';
import { writeInput } from './state.ts';

function download(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function iconButton(iconHtml: string, label: string, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `icon-button ${cls}`.trim();
  b.innerHTML = `${iconHtml}<span>${label}</span>`;
  return b;
}

export interface TripCardOptions {
  editing: boolean;
  // Whether the method section starts open; true where there is room for it.
  howOpen: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onDone: () => void;
  onChange: (next: PlanInput) => void;
}

// Route title from airport cities when known, else from the zones. Fills in once the list has loaded.
export function routeTitle(input: PlanInput, el: HTMLElement): void {
  el.textContent = SUMMARY.route(zoneCity(input.homeZone), zoneCity(input.destZone));
  if (!input.homeAirport || !input.destAirport) return;
  void loadAirports().then((list) => {
    const a = findAirport(list, input.homeAirport!);
    const b = findAirport(list, input.destAirport!);
    if (a && b) el.textContent = SUMMARY.route(a.city, b.city);
  });
}

export function renderHow(open: boolean): HTMLElement {
  const details = document.createElement('details');
  details.className = 'how';
  details.open = open;
  const summary = document.createElement('summary');
  summary.innerHTML = `${ICONS.info}<span>${HEADER.how}</span>`;
  details.appendChild(summary);
  for (const { title, text } of METHOD) {
    const h = document.createElement('h4');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = text;
    details.append(h, p);
  }
  const foot = document.createElement('p');
  foot.className = 'footer';
  foot.textContent = FOOTER;
  details.appendChild(foot);
  return details;
}

export function renderTripCard(plan: Plan, input: PlanInput, opts: TripCardOptions): HTMLElement {
  const card = document.createElement('section');
  card.className = `trip-card${opts.editing ? ' editing' : ''}`;

  if (opts.editing) {
    const h = document.createElement('h2');
    h.textContent = HEADER.editTrip;
    card.appendChild(h);
    card.appendChild(renderForm(input, opts.onChange));
    const row = document.createElement('div');
    row.className = 'actions';
    const cancel = iconButton(ICONS.close, HEADER.cancel);
    cancel.addEventListener('click', () => opts.onCancel());
    const done = iconButton(ICONS.check, HEADER.doneEditing, 'primary');
    done.addEventListener('click', () => opts.onDone());
    row.append(cancel, done);
    card.appendChild(row);
    return card;
  }

  const route = document.createElement('h2');
  routeTitle(input, route);
  card.appendChild(route);
  if (input.homeAirport && input.destAirport) {
    const codes = document.createElement('p');
    codes.className = 'codes';
    codes.textContent = `${input.homeAirport} to ${input.destAirport}`;
    card.appendChild(codes);
  }

  const facts = document.createElement('ul');
  facts.className = 'facts';
  const fact = (iconHtml: string, text: string) => {
    const li = document.createElement('li');
    li.innerHTML = `${iconHtml}<span>${text}</span>`;
    facts.appendChild(li);
  };
  fact(
    ICONS.plane,
    SUMMARY.flight(
      shortDay(plan, plan.depart),
      `${clock(plan, plan.depart)} ${zoneAbbr(plan, plan.depart)}`,
      `${clock(plan, plan.arrive)} ${zoneAbbr(plan, plan.arrive)}`,
      duration(plan.arrive - plan.depart),
    ),
  );
  fact(ICONS.clock, SUMMARY.shift(plan.totalShiftHours, plan.direction));
  fact(ICONS.bed, SUMMARY.sleep(input.habitualBed, input.habitualWake));
  fact(ICONS.check, plan.adaptedAt ? SUMMARY.adapted(dayLabel(plan, plan.adaptedAt)) : SUMMARY.notAdapted);
  card.appendChild(facts);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const ics = iconButton(ICONS.calendar, DOWNLOAD_ICS);
  ics.addEventListener('click', () => download('unlag.ics', toICS(plan), 'text/calendar'));
  const link = iconButton(ICONS.link, COPY_LINK);
  link.addEventListener('click', async () => {
    await navigator.clipboard.writeText(location.origin + location.pathname + writeInput(input));
    // Swap the icon and announce, but keep the label so nothing moves.
    link.innerHTML = `${ICONS.check}<span>${COPY_LINK}</span>`;
    link.setAttribute('aria-label', LINK_COPIED);
    link.classList.add('done');
    setTimeout(() => {
      link.innerHTML = `${ICONS.link}<span>${COPY_LINK}</span>`;
      link.removeAttribute('aria-label');
      link.classList.remove('done');
    }, 1500);
  });
  const edit = iconButton(ICONS.edit, HEADER.editTrip, 'edit-toggle');
  edit.addEventListener('click', () => opts.onEdit());
  actions.append(ics, link, edit);
  card.appendChild(actions);
  card.appendChild(renderHow(opts.howOpen));
  return card;
}
