import './fonts.css';
import './style.css';
import { DateTime, Settings } from 'luxon';
import { generatePlan } from './algorithm/generate.ts';
import type { Plan, PlanInput } from './algorithm/types.ts';
import { HOUR } from './algorithm/time.ts';
import { APP_NAME, HEADER } from './copy.ts';
import { renderDayList } from './ui/dayList.ts';
import {
  DEFAULT_PX_PER_HOUR,
  MAX_PX_PER_HOUR,
  MIN_PX_PER_HOUR,
  NARROW,
  axisStart,
  renderFeed,
  timeAt,
  yOf,
  type FeedItem,
} from './ui/feed.ts';
import { dayLabel, zoneAbbr, zoneAt } from './ui/format.ts';
import { renderHeadline } from './ui/headline.ts';
import { ICONS } from './ui/icons.ts';
import { readInput, writeInput } from './ui/state.ts';
import { renderTripCard } from './ui/tripCard.ts';

Settings.defaultLocale = 'en-GB';
const SCALE_KEY = 'unlag-px-per-hour';
const MEDIUM = window.matchMedia('(min-width: 900px)');
const WIDE = window.matchMedia('(min-width: 1200px)');

const app = document.getElementById('app')!;
let input: PlanInput = readInput(location.search);
let plan: Plan = generatePlan(input);
let selected: FeedItem | null = null;
let editing = false;
let tab: 'plan' | 'trip' = 'plan';
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

// Scrolling. The feed lives in the page; the sticky parts sit above or beside it.

function feedEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.feed');
}

function stickyHeight(): number {
  return MEDIUM.matches ? 0 : (document.querySelector<HTMLElement>('.sticky')?.offsetHeight ?? 0);
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
  setScale(pxPerHour * factor, timeAtFocus(), focusLine());
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

// Pieces shared by the layouts.

function tripCard(): HTMLElement {
  return renderTripCard(plan, input, {
    editing,
    onEditToggle: (next) => {
      editing = next;
      rerenderKeepingSheet('trip-sheet');
    },
    onChange: (next) => {
      input = next;
      plan = generatePlan(input);
      history.replaceState(null, '', writeInput(input));
      selected = null;
      rerenderKeepingSheet('trip-sheet');
    },
  });
}

function rerenderKeepingSheet(cls: string): void {
  const wasOpen = document.querySelector<HTMLDialogElement>(`dialog.${cls}[open]`) !== null;
  render();
  if (wasOpen) document.querySelector<HTMLDialogElement>(`dialog.${cls}`)?.showModal();
}

function nowButton(): HTMLButtonElement {
  const now = document.createElement('button');
  now.type = 'button';
  now.className = 'now-button';
  now.textContent = HEADER.jumpToNow;
  now.addEventListener('click', () => scrollToNow());
  return now;
}

function zoomGroup(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'zoom-group';
  const out = document.createElement('button');
  out.type = 'button';
  out.innerHTML = ICONS.zoomOut;
  out.title = HEADER.zoomOut;
  out.setAttribute('aria-label', HEADER.zoomOut);
  out.addEventListener('click', () => zoomBy(1 / 1.3));
  const inn = document.createElement('button');
  inn.type = 'button';
  inn.innerHTML = ICONS.zoomIn;
  inn.title = HEADER.zoomIn;
  inn.setAttribute('aria-label', HEADER.zoomIn);
  inn.addEventListener('click', () => zoomBy(1.3));
  wrap.append(out, inn);
  return wrap;
}

// The zone in effect at the focus line on the left, the other zone on the right.
function zoneTags(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'zone-tags';
  row.innerHTML = '<span class="zone-left"></span><span class="zone-right"></span>';
  return row;
}

function updateZoneTags(): void {
  const t = timeAtFocus();
  const zone = zoneAt(plan, t);
  const other = zone === plan.input.homeZone ? plan.input.destZone : plan.input.homeZone;
  const left = document.querySelector('.zone-left');
  const right = document.querySelector<HTMLElement>('.zone-right');
  if (left) left.textContent = zoneAbbr(plan, t, zone);
  if (right) {
    right.textContent = zoneAbbr(plan, t, other);
    const host = document.querySelector<HTMLElement>('.feed-host');
    right.hidden = !!host && host.clientWidth < NARROW;
  }
}

function toolbar(): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'toolbar';
  const controls = document.createElement('div');
  controls.className = 'controls';
  controls.append(nowButton(), zoomGroup());
  bar.append(controls, zoneTags());
  return bar;
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

function brand(): HTMLElement {
  const b = document.createElement('span');
  b.className = 'brand';
  b.textContent = APP_NAME;
  return b;
}

function daysBlock(now: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'days-block';
  const title = document.createElement('h3');
  title.textContent = HEADER.days;
  wrap.append(title, renderDayList(plan, now, scrollToDay));
  return wrap;
}

function tabs(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'tabs';
  wrap.setAttribute('role', 'tablist');
  for (const [key, label] of [
    ['plan', HEADER.plan],
    ['trip', HEADER.trip],
  ] as const) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(tab === key));
    b.textContent = label;
    b.addEventListener('click', () => {
      tab = key;
      render();
    });
    wrap.appendChild(b);
  }
  return wrap;
}

function currentDayLabel(): string {
  const t = timeAtFocus();
  return dayLabel(plan, t, zoneAt(plan, t));
}

function render(): void {
  const now = Date.now();
  const scrollY = window.scrollY;
  app.replaceChildren();

  if (WIDE.matches) {
    app.className = 'wide';
    const layout = document.createElement('div');
    layout.className = 'layout three';
    const left = document.createElement('aside');
    left.className = 'panel';
    left.append(brand(), renderHeadline(plan, now, selected), daysBlock(now));
    const main = document.createElement('main');
    main.className = 'feed-column';
    const host = document.createElement('div');
    host.className = 'feed-host';
    main.append(toolbar(), host);
    const right = document.createElement('aside');
    right.className = 'panel';
    right.appendChild(tripCard());
    layout.append(left, main, right);
    app.appendChild(layout);
    host.appendChild(buildFeed());
  } else if (MEDIUM.matches) {
    app.className = 'medium';
    const layout = document.createElement('div');
    layout.className = 'layout two';
    const aside = document.createElement('aside');
    aside.className = 'panel';
    aside.append(brand(), renderHeadline(plan, now, selected), tabs(), tab === 'plan' ? daysBlock(now) : tripCard());
    const main = document.createElement('main');
    main.className = 'feed-column';
    const host = document.createElement('div');
    host.className = 'feed-host';
    main.append(toolbar(), host);
    layout.append(aside, main);
    app.appendChild(layout);
    host.appendChild(buildFeed());
  } else {
    app.className = 'mobile';
    const header = document.createElement('header');
    header.className = 'top';
    const dayButton = document.createElement('button');
    dayButton.type = 'button';
    dayButton.className = 'day-title';
    dayButton.innerHTML = `<span class="day-name">${dayLabel(plan, plan.planStart)}</span>${ICONS.chevron}`;
    const tripButton = document.createElement('button');
    tripButton.type = 'button';
    tripButton.className = 'trip-button';
    tripButton.innerHTML = `${ICONS.plane}<span>${HEADER.trip}</span>`;
    header.append(brand(), dayButton, tripButton);
    const sticky = document.createElement('div');
    sticky.className = 'sticky';
    sticky.append(header, renderHeadline(plan, now, selected), zoneTags());
    app.appendChild(sticky);
    const host = document.createElement('main');
    host.className = 'feed-host';
    app.appendChild(host);
    host.appendChild(buildFeed());
    const controls = document.createElement('div');
    controls.className = 'float-controls';
    controls.append(zoomGroup(), nowButton());
    app.appendChild(controls);
    const daySheet = sheet(
      HEADER.pickDay,
      renderDayList(plan, now, (iso) => {
        daySheet.close();
        scrollToDay(iso);
      }),
      'day-sheet',
    );
    const tripSheet = sheet(HEADER.trip, tripCard(), 'trip-sheet');
    app.append(daySheet, tripSheet);
    dayButton.addEventListener('click', () => daySheet.showModal());
    tripButton.addEventListener('click', () => tripSheet.showModal());
  }
  window.scrollTo({ top: scrollY, behavior: 'instant' });
  requestAnimationFrame(() => {
    const name = document.querySelector('.day-name');
    if (name) name.textContent = currentDayLabel();
    updateZoneTags();
  });
}

render();
scrollToNow(false);

MEDIUM.addEventListener('change', render);
WIDE.addEventListener('change', render);
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
    updateZoneTags();
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
