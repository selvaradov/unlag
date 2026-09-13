import './style.css';
import { DateTime, Settings } from 'luxon';
import { generatePlan } from './algorithm/generate.ts';
import type { Plan, PlanInput } from './algorithm/types.ts';
import { APP_NAME, COPY_LINK, DOWNLOAD_ICS, FOOTER, HEADER, LINK_COPIED, adaptedLine, summary } from './copy.ts';
import { renderDayList } from './ui/dayList.ts';
import { PX_PER_HOUR, axisStart, renderFeed, yOf, type FeedItem } from './ui/feed.ts';
import { renderForm } from './ui/form.ts';
import { dayLabel, zoneAt } from './ui/format.ts';
import { renderHeadline } from './ui/headline.ts';
import { ICONS } from './ui/icons.ts';
import { toICS } from './ui/ics.ts';
import { readInput, writeInput } from './ui/state.ts';

Settings.defaultLocale = 'en-GB';
const app = document.getElementById('app')!;
let input: PlanInput = readInput(location.search);
let plan: Plan = generatePlan(input);
let selected: FeedItem | null = null;

function download(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function stickyHeight(): number {
  return document.querySelector<HTMLElement>('.sticky')?.offsetHeight ?? 0;
}

function scrollToY(y: number, smooth = true): void {
  const feed = document.querySelector<HTMLElement>('.feed');
  if (!feed) return;
  const top =
    feed.getBoundingClientRect().top +
    window.scrollY +
    y -
    stickyHeight() -
    (window.innerHeight - stickyHeight()) * 0.3;
  window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
}

function scrollToNow(smooth = true): void {
  const now = Date.now();
  const y = now < axisStart(plan) ? 0 : now > plan.planEnd ? yOf(plan, plan.planEnd) : yOf(plan, now);
  scrollToY(y, smooth);
}

function scrollToDay(iso: string): void {
  const head = document.querySelector<HTMLElement>(`.day-head[data-day="${iso}"]`);
  if (head) scrollToY(parseFloat(head.style.top) + PX_PER_HOUR * 0.5);
}

// The day named in the header follows the scroll position.
function currentDayLabel(): string {
  const feed = document.querySelector<HTMLElement>('.feed');
  if (!feed) return '';
  const y =
    window.scrollY +
    stickyHeight() +
    (window.innerHeight - stickyHeight()) * 0.3 -
    (feed.getBoundingClientRect().top + window.scrollY);
  const t = Math.min(plan.planEnd, Math.max(axisStart(plan), axisStart(plan) + (y / PX_PER_HOUR) * 3_600_000));
  return dayLabel(plan, t, zoneAt(plan, t));
}

function renderTripSheet(): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = 'sheet';
  const head = document.createElement('div');
  head.className = 'sheet-head';
  head.innerHTML = `<h2>${HEADER.trip}</h2>`;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'text-button';
  close.textContent = HEADER.close;
  close.addEventListener('click', () => dialog.close());
  head.appendChild(close);
  dialog.appendChild(head);

  const sum = document.createElement('p');
  sum.className = 'summary';
  sum.textContent = `${summary(input.homeZone, input.destZone, plan.direction, plan.totalShiftHours)} ${adaptedLine(plan.adaptedAt ? dayLabel(plan, plan.adaptedAt) : null)}`;
  dialog.appendChild(sum);

  dialog.appendChild(
    renderForm(input, (next) => {
      input = next;
      plan = generatePlan(input);
      history.replaceState(null, '', writeInput(input));
      selected = null;
      render();
      document.querySelector<HTMLDialogElement>('dialog.sheet')?.showModal();
    }),
  );

  const actions = document.createElement('div');
  actions.className = 'actions';
  const ics = document.createElement('button');
  ics.type = 'button';
  ics.textContent = DOWNLOAD_ICS;
  ics.addEventListener('click', () => download('unlag.ics', toICS(plan), 'text/calendar'));
  const link = document.createElement('button');
  link.type = 'button';
  link.textContent = COPY_LINK;
  link.addEventListener('click', async () => {
    await navigator.clipboard.writeText(location.origin + location.pathname + writeInput(input));
    link.textContent = LINK_COPIED;
    setTimeout(() => (link.textContent = COPY_LINK), 1500);
  });
  actions.append(ics, link);
  dialog.appendChild(actions);

  const foot = document.createElement('p');
  foot.className = 'footer';
  foot.textContent = FOOTER;
  dialog.appendChild(foot);
  return dialog;
}

function renderDaySheet(): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = 'sheet day-sheet';
  const head = document.createElement('div');
  head.className = 'sheet-head';
  head.innerHTML = `<h2>${HEADER.pickDay}</h2>`;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'text-button';
  close.textContent = HEADER.close;
  close.addEventListener('click', () => dialog.close());
  head.appendChild(close);
  dialog.appendChild(head);
  dialog.appendChild(
    renderDayList(plan, Date.now(), (iso) => {
      dialog.close();
      scrollToDay(iso);
    }),
  );
  return dialog;
}

function render(): void {
  const now = Date.now();
  const scrollY = window.scrollY;
  app.replaceChildren();

  const header = document.createElement('header');
  header.className = 'top';
  const brand = document.createElement('span');
  brand.className = 'brand';
  brand.textContent = APP_NAME;
  const dayButton = document.createElement('button');
  dayButton.type = 'button';
  dayButton.className = 'day-title';
  dayButton.innerHTML = `<span class="day-name">${currentDayLabel() || dayLabel(plan, plan.planStart)}</span>${ICONS.chevron}`;
  const tripButton = document.createElement('button');
  tripButton.type = 'button';
  tripButton.className = 'trip-button';
  tripButton.textContent = HEADER.trip;
  header.append(brand, dayButton, tripButton);
  const sticky = document.createElement('div');
  sticky.className = 'sticky';
  sticky.append(header, renderHeadline(plan, now, selected));
  app.appendChild(sticky);

  const feed = renderFeed(plan, now, {
    onSelect: (item) => {
      selected = item;
      const old = document.querySelector('.headline');
      old?.replaceWith(renderHeadline(plan, Date.now(), selected));
    },
  });
  app.appendChild(feed);

  const nowButton = document.createElement('button');
  nowButton.type = 'button';
  nowButton.className = 'now-button';
  nowButton.textContent = HEADER.jumpToNow;
  nowButton.addEventListener('click', () => scrollToNow());
  app.appendChild(nowButton);

  const tripSheet = renderTripSheet();
  const daySheet = renderDaySheet();
  app.append(tripSheet, daySheet);
  tripButton.addEventListener('click', () => tripSheet.showModal());
  dayButton.addEventListener('click', () => daySheet.showModal());

  window.scrollTo({ top: scrollY });
}

render();
scrollToNow(false);

let ticking = false;
window.addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const name = document.querySelector('.day-name');
    if (name) name.textContent = currentDayLabel();
    ticking = false;
  });
});

// Refresh the headline and the now line each minute without disturbing the scroll position.
setInterval(() => {
  const now = Date.now();
  document.querySelector('.headline')?.replaceWith(renderHeadline(plan, now, selected));
  const line = document.getElementById('now');
  if (line) {
    line.style.top = `${yOf(plan, now)}px`;
    line.querySelector('span')!.textContent = DateTime.fromMillis(now, { zone: zoneAt(plan, now) }).toFormat('HH:mm');
  }
  for (const pill of document.querySelectorAll<HTMLElement>('.pill')) pill.classList.remove('active');
}, 60_000);
