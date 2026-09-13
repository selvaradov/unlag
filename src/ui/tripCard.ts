// The trip at a glance with the calendar and link actions and the method behind the plan.
// While editing, the form takes the card's place with Cancel and Done beneath it.
import type { Plan, PlanInput } from '../algorithm/types.ts';
import { COPY_LINK, DOWNLOAD_ICS, FOOTER, HEADER, LINK_COPIED, SUMMARY, zoneCity } from '../copy.ts';
import { airportsNow, findAirport } from '../data/airports.ts';
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
  onEdit: () => void;
  onCancel: () => void;
  onDone: () => void;
  onChange: (next: PlanInput) => void;
}

// Route title from airport cities when the list is loaded, else from the zones.
export function routeTitle(input: PlanInput, el: HTMLElement): void {
  const list = airportsNow();
  const a = list && input.homeAirport ? findAirport(list, input.homeAirport) : undefined;
  const b = list && input.destAirport ? findAirport(list, input.destAirport) : undefined;
  el.textContent =
    a && b ? SUMMARY.route(a.city, b.city) : SUMMARY.route(zoneCity(input.homeZone), zoneCity(input.destZone));
}

// A short lede and a link to the page that explains the method.
export function renderHowLede(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'how-lede';
  wrap.innerHTML = `${ICONS.info}<p>${HEADER.howLede} <a href="${HEADER.howHref}">${HEADER.how}</a></p><p class="footer">${FOOTER}</p>`;
  return wrap;
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
  card.appendChild(renderHowLede());
  return card;
}
