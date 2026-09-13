import './fonts.css';
import './style.css';
import { DateTime, Settings } from 'luxon';
import { generatePlan } from './algorithm/generate.ts';
import type { Plan, PlanInput } from './algorithm/types.ts';
import { HOUR } from './algorithm/time.ts';
import { APP_NAME, COPY_LINK, DOWNLOAD_ICS, FOOTER, HEADER, LINK_COPIED, adaptedLine, summary } from './copy.ts';
import { renderDayList } from './ui/dayList.ts';
import {
  DEFAULT_PX_PER_HOUR,
  MAX_PX_PER_HOUR,
  MIN_PX_PER_HOUR,
  axisStart,
  renderFeed,
  timeAt,
  yOf,
  type FeedItem,
} from './ui/feed.ts';
import { renderForm } from './ui/form.ts';
import { dayLabel, zoneAt } from './ui/format.ts';
import { renderHeadline } from './ui/headline.ts';
import { ICONS } from './ui/icons.ts';
import { toICS } from './ui/ics.ts';
import { readInput, writeInput } from './ui/state.ts';

Settings.defaultLocale = 'en-GB';
const SCALE_KEY = 'unlag-px-per-hour';
const DESKTOP = window.matchMedia('(min-width: 900px)');

const app = document.getElementById('app')!;
let input: PlanInput = readInput(location.search);
let plan: Plan = generatePlan(input);
let selected: FeedItem | null = null;
let pxPerHour = readScale();

function readScale(): number {
  try {
    const v = Number(localStorage.getItem(SCALE_KEY));
    if (Number.isFinite(v) && v >= MIN_PX_PER_HOUR && v <= MAX_PX_PER_HOUR) return v;
  } catch {
    // Storage may be unavailable; the default is fine.
  }
  return DEFAULT_PX_PER_HOUR;
}

function saveScale(): void {
  try {
    localStorage.setItem(SCALE_KEY, String(pxPerHour));
  } catch {
    // Ignore.
  }
}

function download(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// Scrolling. The feed lives in the page; the sticky parts sit above or beside it.

function feedEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.feed');
}

function stickyHeight(): number {
  return DESKTOP.matches ? 0 : (document.querySelector<HTMLElement>('.sticky')?.offsetHeight ?? 0);
}

function feedTop(): number {
  const feed = feedEl();
  return feed ? feed.getBoundingClientRect().top + window.scrollY : 0;
}

function focusLine(): number {
  return stickyHeight() + (window.innerHeight - stickyHeight()) * 0.3;
}

function scrollToTime(t: number, smooth = true): void {
  const top = feedTop() + yOf(plan, t, pxPerHour) - focusLine();
  window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'instant' });
}

function scrollToNow(smooth = true): void {
  const now = Date.now();
  scrollToTime(Math.min(plan.planEnd, Math.max(axisStart(plan), now)), smooth);
}

function scrollToDay(iso: string): void {
  const head = document.querySelector<HTMLElement>(`.day-head[data-day="${iso}"]`);
  if (head) {
    const top = feedTop() + parseFloat(head.style.top) - focusLine() + pxPerHour * 0.5;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }
}

function timeAtFocus(): number {
  const y = window.scrollY + focusLine() - feedTop();
  return Math.min(plan.planEnd, Math.max(axisStart(plan), timeAt(plan, y, pxPerHour)));
}

// Zoom. The hour scale changes around an anchor so the time under the fingers stays put.

function setScale(next: number, anchorTime: number, anchorClientY: number): void {
  const clamped = Math.min(MAX_PX_PER_HOUR, Math.max(MIN_PX_PER_HOUR, next));
  if (clamped === pxPerHour) return;
  pxPerHour = clamped;
  saveScale();
  replaceFeed();
  const top = feedTop() + yOf(plan, anchorTime, pxPerHour) - anchorClientY;
  window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
}

function zoomBy(factor: number): void {
  const anchorY = focusLine();
  setScale(pxPerHour * factor, timeAtFocus(), anchorY);
}

function attachZoom(feed: HTMLElement): void {
  let startDist = 0;
  let startPx = 0;
  let anchorTime = 0;
  let anchorY = 0;
  let pending = false;
  feed.addEventListener(
    'touchstart',
    (ev) => {
      if (ev.touches.length !== 2) return;
      const [a, b] = [ev.touches[0], ev.touches[1]];
      startDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      startPx = pxPerHour;
      anchorY = (a.clientY + b.clientY) / 2;
      anchorTime = timeAt(plan, anchorY + window.scrollY - feedTop(), pxPerHour);
    },
    { passive: true },
  );
  feed.addEventListener(
    'touchmove',
    (ev) => {
      if (ev.touches.length !== 2 || startDist === 0) return;
      ev.preventDefault();
      const [a, b] = [ev.touches[0], ev.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      anchorY = (a.clientY + b.clientY) / 2;
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        setScale(startPx * (dist / startDist), anchorTime, anchorY);
      });
    },
    { passive: false },
  );
  feed.addEventListener('touchend', () => (startDist = 0));
  feed.addEventListener(
    'wheel',
    (ev) => {
      if (!ev.ctrlKey) return;
      ev.preventDefault();
      const t = timeAt(plan, ev.clientY + window.scrollY - feedTop(), pxPerHour);
      setScale(pxPerHour * Math.exp(-ev.deltaY / 300), t, ev.clientY);
    },
    { passive: false },
  );
}

function buildFeed(): HTMLElement {
  const host = document.querySelector<HTMLElement>('.feed-host');
  const width = host ? host.clientWidth : Math.min(window.innerWidth, 640);
  const feed = renderFeed(plan, {
    pxPerHour,
    width,
    now: Date.now(),
    selected,
    onSelect: (item) => {
      selected = item;
      document.querySelector('.headline')?.replaceWith(renderHeadline(plan, Date.now(), selected));
    },
  });
  attachZoom(feed);
  return feed;
}

function replaceFeed(): void {
  const old = feedEl();
  if (old) old.replaceWith(buildFeed());
}

// Panels shared by both layouts.

function tripPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'trip-panel';
  const sum = document.createElement('p');
  sum.className = 'summary';
  sum.textContent = `${summary(input.homeZone, input.destZone, plan.direction, plan.totalShiftHours)} ${adaptedLine(plan.adaptedAt ? dayLabel(plan, plan.adaptedAt) : null)}`;
  panel.appendChild(sum);
  panel.appendChild(
    renderForm(input, (next) => {
      input = next;
      plan = generatePlan(input);
      history.replaceState(null, '', writeInput(input));
      selected = null;
      const open = document.querySelector<HTMLDialogElement>('dialog[open]')?.className;
      render();
      if (open) document.querySelector<HTMLDialogElement>(`dialog.${open.split(' ').join('.')}`)?.showModal();
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
  panel.appendChild(actions);
  const foot = document.createElement('p');
  foot.className = 'footer';
  foot.textContent = FOOTER;
  panel.appendChild(foot);
  return panel;
}

function zoomButtons(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'zoom';
  const out = document.createElement('button');
  out.type = 'button';
  out.textContent = '−';
  out.title = HEADER.zoomOut;
  out.addEventListener('click', () => zoomBy(1 / 1.3));
  const inn = document.createElement('button');
  inn.type = 'button';
  inn.textContent = '+';
  inn.title = HEADER.zoomIn;
  inn.addEventListener('click', () => zoomBy(1.3));
  const now = document.createElement('button');
  now.type = 'button';
  now.className = 'now-button';
  now.textContent = HEADER.jumpToNow;
  now.addEventListener('click', () => scrollToNow());
  wrap.append(out, inn, now);
  return wrap;
}

function sheet(title: string, body: HTMLElement, cls: string): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = `sheet ${cls}`;
  const head = document.createElement('div');
  head.className = 'sheet-head';
  head.innerHTML = `<h2>${title}</h2>`;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'text-button';
  close.textContent = HEADER.close;
  close.addEventListener('click', () => dialog.close());
  head.appendChild(close);
  dialog.append(head, body);
  return dialog;
}

function currentDayLabel(): string {
  const t = timeAtFocus();
  return dayLabel(plan, t, zoneAt(plan, t));
}

function render(): void {
  const now = Date.now();
  const scrollY = window.scrollY;
  app.replaceChildren();
  app.className = DESKTOP.matches ? 'desktop' : 'mobile';

  const brand = document.createElement('span');
  brand.className = 'brand';
  brand.textContent = APP_NAME;

  if (DESKTOP.matches) {
    const layout = document.createElement('div');
    layout.className = 'layout';
    const aside = document.createElement('aside');
    aside.className = 'panel';
    aside.appendChild(brand);
    aside.appendChild(renderHeadline(plan, now, selected));
    aside.appendChild(zoomButtons());
    const daysTitle = document.createElement('h3');
    daysTitle.textContent = HEADER.days;
    aside.appendChild(daysTitle);
    aside.appendChild(renderDayList(plan, now, scrollToDay));
    const tripTitle = document.createElement('h3');
    tripTitle.textContent = HEADER.trip;
    aside.appendChild(tripTitle);
    aside.appendChild(tripPanel());
    const main = document.createElement('main');
    main.className = 'feed-host';
    layout.append(aside, main);
    app.appendChild(layout);
    main.appendChild(buildFeed());
  } else {
    const header = document.createElement('header');
    header.className = 'top';
    const dayButton = document.createElement('button');
    dayButton.type = 'button';
    dayButton.className = 'day-title';
    dayButton.innerHTML = `<span class="day-name">${dayLabel(plan, plan.planStart)}</span>${ICONS.chevron}`;
    const tripButton = document.createElement('button');
    tripButton.type = 'button';
    tripButton.className = 'trip-button';
    tripButton.textContent = HEADER.trip;
    header.append(brand, dayButton, tripButton);
    const sticky = document.createElement('div');
    sticky.className = 'sticky';
    sticky.append(header, renderHeadline(plan, now, selected));
    app.appendChild(sticky);
    const main = document.createElement('main');
    main.className = 'feed-host';
    app.appendChild(main);
    main.appendChild(buildFeed());
    app.appendChild(zoomButtons());
    const daySheet = sheet(
      HEADER.pickDay,
      renderDayList(plan, now, (iso) => {
        daySheet.close();
        scrollToDay(iso);
      }),
      'day-sheet',
    );
    const tripSheet = sheet(HEADER.trip, tripPanel(), 'trip-sheet');
    app.append(daySheet, tripSheet);
    dayButton.addEventListener('click', () => daySheet.showModal());
    tripButton.addEventListener('click', () => tripSheet.showModal());
    requestAnimationFrame(() => {
      const name = document.querySelector('.day-name');
      if (name) name.textContent = currentDayLabel();
    });
  }
  window.scrollTo({ top: scrollY, behavior: 'instant' });
}

render();
scrollToNow(false);

DESKTOP.addEventListener('change', render);
let resizeTimer = 0;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const t = timeAtFocus();
    replaceFeed();
    scrollToTime(t, false);
  }, 150);
});

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

// Every minute: headline, now line and the active segment, without touching the scroll position.
setInterval(() => {
  const now = Date.now();
  if (!selected) document.querySelector('.headline')?.replaceWith(renderHeadline(plan, now, null));
  const line = document.getElementById('now');
  if (line && now <= plan.planEnd) {
    line.style.top = `${yOf(plan, now, pxPerHour)}px`;
    line.querySelector('span')!.textContent = DateTime.fromMillis(now, { zone: zoneAt(plan, now) }).toFormat('HH:mm');
  }
  if (Math.floor(now / HOUR) !== Math.floor((now - 60_000) / HOUR)) replaceFeed();
}, 60_000);
