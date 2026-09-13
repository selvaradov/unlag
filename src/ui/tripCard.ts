// The trip at a glance, with the calendar and link actions and a toggle to edit the inputs.
import type { Plan, PlanInput } from '../algorithm/types.ts';
import { COPY_LINK, DOWNLOAD_ICS, FOOTER, HEADER, LINK_COPIED, SUMMARY, zoneCity } from '../copy.ts';
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
  onEditToggle: (editing: boolean) => void;
  onChange: (next: PlanInput) => void;
}

export function renderTripCard(plan: Plan, input: PlanInput, opts: TripCardOptions): HTMLElement {
  const card = document.createElement('section');
  card.className = 'trip-card';

  const route = document.createElement('h2');
  route.textContent = SUMMARY.route(zoneCity(input.homeZone), zoneCity(input.destZone));
  card.appendChild(route);

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
  const edit = iconButton(
    opts.editing ? ICONS.check : ICONS.edit,
    opts.editing ? HEADER.doneEditing : HEADER.editTrip,
    'edit-toggle',
  );
  edit.setAttribute('aria-expanded', String(opts.editing));
  edit.addEventListener('click', () => opts.onEditToggle(!opts.editing));
  actions.append(ics, link, edit);
  card.appendChild(actions);

  if (opts.editing) card.appendChild(renderForm(input, opts.onChange));

  const foot = document.createElement('p');
  foot.className = 'footer';
  foot.textContent = FOOTER;
  card.appendChild(foot);
  return card;
}
