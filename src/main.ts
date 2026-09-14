import './fonts.css';
import './style.css';
import { DateTime, Settings } from 'luxon';
import { registerSW } from 'virtual:pwa-register';
import { generatePlan } from './algorithm/generate.ts';
import type { Plan, PlanInput } from './algorithm/types.ts';
import { APP_NAME, HEADER } from './copy.ts';
import { dayRows, renderDayList } from './ui/dayList.ts';
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
import { defaultInput, hasPlanInUrl, readInput, rememberPlan, rememberedPlan, writeInput } from './ui/state.ts';
import { renderWalkthrough } from './ui/walkthrough.ts';
import { loadAirports } from './data/airports.ts';
import { syncSubscription } from './ui/notify.ts';
import { applyTheme, currentTheme, renderThemeToggle } from './ui/theme.ts';
import { renderTripCard } from './ui/tripCard.ts';

Settings.defaultLocale = 'en-GB';
applyTheme(currentTheme());

// The service worker updates itself; when a new one takes over, the page reloads so nobody is left
// on a stale build. Returning to the tab or app also checks for a new worker.
const updateSW = registerSW({ immediate: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void updateSW();
});

const SCALE_KEY = 'unlag-px-per-hour';
const MEDIUM = window.matchMedia('(min-width: 900px)');
const WIDE = window.matchMedia('(min-width: 1200px)');

const app = document.getElementById('app')!;
// The installed app relaunches at the bare address, so the plan last shown on this device comes back.
if (!hasPlanInUrl(location.search)) {
  const remembered = rememberedPlan();
  if (remembered) history.replaceState(null, '', remembered);
}
let input: PlanInput = readInput(location.search);
let plan: Plan = generatePlan(input);
if (hasPlanInUrl(location.search)) rememberPlan(writeInput(input));
let selected: FeedItem | null = null;
let editing = false;
// Inputs as they were when editing began, restored by Cancel.
let editSnapshot: PlanInput | null = null;
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

// The feed scrolls in the page beneath the mobile bar or beside the desktop panels.

function feedEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.feed');
}

function topBarHeight(): number {
  return MEDIUM.matches ? 0 : (document.querySelector<HTMLElement>('.top-bar')?.offsetHeight ?? 0);
}

function updateTopBarHeight(): void {
  app.style.setProperty('--top-bar-height', `${topBarHeight()}px`);
}

const topBarObserver = new ResizeObserver(updateTopBarHeight);

function feedTop(): number {
  const feed = feedEl();
  return feed ? feed.getBoundingClientRect().top + window.scrollY : 0;
}

function focusLine(): number {
  return topBarHeight() + (window.innerHeight - topBarHeight()) * 0.3;
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

function setScale(next: number, anchorTime: number, anchorClientY: number, persist = true): void {
  const clamped = Math.min(MAX_PX_PER_HOUR, Math.max(MIN_PX_PER_HOUR, next));
  const top = feedTop() + yOf(plan, anchorTime, clamped) - anchorClientY;
  if (clamped !== pxPerHour) {
    pxPerHour = clamped;
    refreshFeed();
    if (persist) saveScale();
  }
  window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
}

function zoomBy(factor: number): void {
  setScale(pxPerHour * factor, timeAtFocus(), focusLine());
}

// Pinches share one layout update per frame and keep the drawing's touch targets attached.
function attachZoom(feed: HTMLElement): void {
  let active = false;
  let startDist = 0;
  let startPx = 0;
  let ratio = 1;
  let anchorTime = 0;
  let anchorY = 0;
  let fingers = '';
  let pending = 0;
  const ids = (list: TouchList) =>
    [...list]
      .map((t) => t.identifier)
      .sort()
      .join(',');
  const apply = () => {
    pending = 0;
    if (active && feed.isConnected) setScale(startPx * ratio, anchorTime, anchorY, false);
  };
  const flush = () => {
    if (!pending) return;
    cancelAnimationFrame(pending);
    apply();
  };
  const finish = () => {
    if (!active) return;
    flush();
    active = false;
    saveScale();
  };
  const begin = (a: { clientY: number }, b: { clientY: number }, distance: number) => {
    finish();
    if (!Number.isFinite(distance) || distance <= 0) return;
    active = true;
    startDist = distance;
    startPx = pxPerHour;
    ratio = 1;
    anchorY = (a.clientY + b.clientY) / 2;
    anchorTime = timeAt(plan, anchorY + window.scrollY - feedTop(), pxPerHour);
  };
  const change = (scale: number) => {
    if (!active || !Number.isFinite(scale) || scale <= 0) return;
    ratio = scale;
    if (!pending) pending = requestAnimationFrame(apply);
  };
  if ('GestureEvent' in window) {
    feed.addEventListener('gesturestart', (ev) => {
      ev.preventDefault();
      const g = ev as unknown as { clientY: number };
      begin(g, g, 1);
    });
    feed.addEventListener('gesturechange', (ev) => {
      ev.preventDefault();
      const g = ev as unknown as { scale: number; clientY: number };
      if (Number.isFinite(g.clientY)) anchorY = g.clientY;
      change(g.scale);
    });
    feed.addEventListener('gestureend', (ev) => {
      ev.preventDefault();
      finish();
    });
    feed.addEventListener('touchcancel', finish);
  } else {
    const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const startPair = (touches: TouchList) => {
      fingers = ids(touches);
      begin(touches[0], touches[1], distance(touches[0], touches[1]));
    };
    feed.addEventListener(
      'touchstart',
      (ev) => {
        if (ev.touches.length === 2) startPair(ev.touches);
        else if (ev.touches.length > 2) finish();
      },
      { passive: true },
    );
    feed.addEventListener(
      'touchmove',
      (ev) => {
        if (!active || ev.touches.length !== 2) return;
        ev.preventDefault();
        if (ids(ev.touches) !== fingers) {
          startPair(ev.touches);
          return;
        }
        anchorY = (ev.touches[0].clientY + ev.touches[1].clientY) / 2;
        change(distance(ev.touches[0], ev.touches[1]) / startDist);
      },
      { passive: false },
    );
    feed.addEventListener('touchend', (ev) => {
      if (ev.touches.length === 2) startPair(ev.touches);
      else finish();
    });
    feed.addEventListener('touchcancel', finish);
  }
  feed.addEventListener(
    'wheel',
    (ev) => {
      if (!ev.ctrlKey) return;
      ev.preventDefault();
      finish();
      const t = timeAt(plan, ev.clientY + window.scrollY - feedTop(), pxPerHour);
      setScale(pxPerHour * Math.exp(-ev.deltaY / 300), t, ev.clientY);
    },
    { passive: false },
  );
}

function clearSelection(): void {
  selected = null;
  document.querySelectorAll('g.item.selected').forEach((g) => g.classList.remove('selected'));
  document.querySelector('.headline')?.replaceWith(renderHeadline(plan, Date.now(), null, clearSelection));
}

// Hour labels within a label's height of the now line give way to it.
function hideLabelsUnderNow(): void {
  const nowY = yOf(plan, Date.now(), pxPerHour);
  for (const label of document.querySelectorAll<SVGTextElement>('.feed text.hour-label:not(.other)')) {
    const yy = Number(label.dataset.y);
    label.style.visibility = Math.abs(yy - nowY) < 14 ? 'hidden' : '';
  }
}

function buildFeed(existing?: HTMLElement): HTMLElement {
  const host = document.querySelector<HTMLElement>('.feed-host');
  const width = host ? host.clientWidth : Math.min(window.innerWidth, 640);
  const feed = renderFeed(
    plan,
    {
      pxPerHour,
      width,
      now: Date.now(),
      selected,
      onSelect: (item) => {
        selected = item;
        document.querySelector('.headline')?.replaceWith(renderHeadline(plan, Date.now(), selected, clearSelection));
      },
    },
    existing,
  );
  if (!existing) attachZoom(feed);
  requestAnimationFrame(hideLabelsUnderNow);
  return feed;
}

function refreshFeed(): void {
  const old = feedEl();
  if (old) buildFeed(old);
}

// Pieces shared by the layouts.

function tripCard(): HTMLElement {
  return renderTripCard(plan, input, {
    editing,
    onEdit: () => {
      editing = true;
      editSnapshot = JSON.parse(JSON.stringify(input));
      tab = 'trip';
      rerenderKeepingSheet('trip-sheet');
    },
    onCancel: () => {
      if (editSnapshot) applyInput(editSnapshot);
      editing = false;
      editSnapshot = null;
      rerenderKeepingSheet('trip-sheet');
    },
    onDone: () => {
      editing = false;
      editSnapshot = null;
      // A device already following this plan keeps following the edited version.
      void syncSubscription(writeInput(input)).catch(() => undefined);
      rerenderKeepingSheet('trip-sheet');
    },
    onChange: (next) => {
      applyInput(next);
      rerenderKeepingSheet('trip-sheet');
    },
  });
}

// Edits replace the current history entry; a new plan from the walkthrough adds one.
function applyInput(next: PlanInput, mode: 'replace' | 'push' = 'replace'): void {
  input = next;
  plan = generatePlan(input);
  if (mode === 'push') history.pushState(null, '', writeInput(input));
  else history.replaceState(null, '', writeInput(input));
  rememberPlan(writeInput(input));
  selected = null;
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

function updateInView(): void {
  const t = timeAtFocus();
  const row = dayRows(plan, Date.now()).find((r) => t >= r.start && t < r.end);
  for (const li of document.querySelectorAll<HTMLElement>('.day-list li')) {
    li.classList.toggle('in-view', !!row && li.dataset.day === row.iso);
  }
}

// The tags switch when the landing break scrolls past the top of the feed's sticky chrome.
function updateZoneTags(): void {
  const breakY = feedTop() + yOf(plan, plan.arrive, pxPerHour) - window.scrollY;
  const chrome = MEDIUM.matches
    ? (document.querySelector<HTMLElement>('.toolbar')?.getBoundingClientRect().bottom ?? 0)
    : topBarHeight();
  const t = breakY <= chrome ? plan.arrive : plan.arrive - 1;
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
  // A tap on the backdrop lands on the dialog itself, outside its box.
  dialog.addEventListener('click', (ev) => {
    const r = dialog.getBoundingClientRect();
    const outside = ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom;
    if (ev.target === dialog && outside) dialog.close();
  });
  return dialog;
}

function brand(): HTMLElement {
  const b = document.createElement('span');
  b.className = 'brand';
  b.textContent = APP_NAME;
  return b;
}

function newTripButton(cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `text-button new-trip ${cls}`.trim();
  b.innerHTML = `${ICONS.planeTakeoff}<span>${HEADER.newTrip}</span>`;
  b.addEventListener('click', () => startNewTrip());
  return b;
}

// Brand on the left, theme toggle and New trip on the right, at the top of a side panel.
function panelHead(): HTMLElement {
  const head = document.createElement('div');
  head.className = 'panel-head';
  const tools = document.createElement('div');
  tools.className = 'tools';
  tools.append(renderThemeToggle(), newTripButton());
  head.append(brand(), tools);
  return head;
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
  if (!hasPlanInUrl(location.search)) return;
  const now = Date.now();
  const scrollY = window.scrollY;
  topBarObserver.disconnect();
  app.replaceChildren();

  if (WIDE.matches) {
    app.className = 'wide';
    const layout = document.createElement('div');
    layout.className = 'layout three';
    const left = document.createElement('aside');
    left.className = 'panel';
    left.append(panelHead(), renderHeadline(plan, now, selected, clearSelection), daysBlock(now));
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
    aside.append(
      panelHead(),
      renderHeadline(plan, now, selected, clearSelection),
      tabs(),
      tab === 'plan' ? daysBlock(now) : tripCard(),
    );
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
    const brandCell = document.createElement('span');
    brandCell.className = 'brand-cell';
    brandCell.append(brand(), zoneTags());
    header.append(brandCell, dayButton, tripButton);
    const topBar = document.createElement('div');
    topBar.className = 'top-bar';
    topBar.append(header, renderHeadline(plan, now, selected, clearSelection));
    app.appendChild(topBar);
    updateTopBarHeight();
    topBarObserver.observe(topBar);
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
    const sheetBody = document.createElement('div');
    const sheetTools = document.createElement('div');
    sheetTools.className = 'sheet-tools';
    sheetTools.append(newTripButton('in-sheet'), renderThemeToggle());
    sheetBody.append(sheetTools, tripCard());
    const tripSheet = sheet(HEADER.trip, sheetBody, 'trip-sheet');
    app.append(daySheet, tripSheet);
    dayButton.addEventListener('click', () => daySheet.showModal());
    tripButton.addEventListener('click', () => tripSheet.showModal());
  }
  window.scrollTo({ top: scrollY, behavior: 'instant' });
  requestAnimationFrame(() => {
    const name = document.querySelector('.day-name');
    if (name) name.textContent = currentDayLabel();
    updateZoneTags();
    updateInView();
  });
}

// Without a plan in the URL the page opens on the walkthrough.
function renderWalkthroughPage(): void {
  topBarObserver.disconnect();
  app.replaceChildren();
  app.className = 'walk';
  app.appendChild(
    renderWalkthrough({
      base: defaultInput(),
      onFinish: (next) => {
        applyInput(next, 'push');
        render();
        scrollToNow(false);
      },
      onExample: () => {
        applyInput(defaultInput(), 'push');
        render();
        scrollToNow(false);
      },
      onCode: (search) => {
        applyInput(readInput(search), 'push');
        render();
        scrollToNow(false);
      },
    }),
  );
}

// Airport names are part of the first paint, so the list loads before the first render.
loadAirports()
  .catch(() => null)
  .then(() => {
    if (hasPlanInUrl(location.search)) {
      render();
      scrollToNow(false);
    } else {
      renderWalkthroughPage();
    }
  });

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && selected) clearSelection();
});

// Back and forward: the URL is the state, so re-read it and show whichever view it describes.
window.addEventListener('popstate', () => {
  selected = null;
  editing = false;
  if (hasPlanInUrl(location.search)) {
    input = readInput(location.search);
    plan = generatePlan(input);
    rememberPlan(writeInput(input));
    render();
    scrollToNow(false);
  } else {
    renderWalkthroughPage();
  }
});

// A new trip is one click from any plan: clear the URL and open the walkthrough. The old plan stays
// remembered until the new one is finished.
function startNewTrip(): void {
  history.pushState(null, '', location.pathname);
  renderWalkthroughPage();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
MEDIUM.addEventListener('change', render);
WIDE.addEventListener('change', render);
let resizeTimer = 0;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const t = timeAtFocus();
    refreshFeed();
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
    updateInView();
    ticking = false;
  });
});

// Headline, now line, active segment and today's row, without touching the scroll position.
// Timers are throttled or suspended while the tab is hidden, so the tick compares against the
// last tick rather than assuming a minute has passed, and runs again when the page comes back.
let lastTick = Date.now();
function tick(): void {
  const now = Date.now();
  const since = lastTick;
  lastTick = now;
  if (!selected) document.querySelector('.headline')?.replaceWith(renderHeadline(plan, now, null));
  // The feed only needs rebuilding when something that depends on the time has changed: an
  // event starting or ending, or the now line entering or leaving the axis.
  const crossed = (t: number) => since < t && t <= now;
  const edges = [axisStart(plan), plan.planEnd, ...plan.events.flatMap((e) => [e.start, e.end])];
  if (edges.some(crossed)) {
    refreshFeed();
  } else {
    const line = document.getElementById('now');
    if (line) {
      line.style.top = `${yOf(plan, now, pxPerHour)}px`;
      line.querySelector('span')!.textContent = DateTime.fromMillis(now, { zone: zoneAt(plan, now) }).toFormat('HH:mm');
    }
    hideLabelsUnderNow();
  }
  const today = dayRows(plan, now).find((r) => r.today)?.iso;
  for (const li of document.querySelectorAll<HTMLElement>('.day-list li'))
    li.classList.toggle('today', li.dataset.day === today);
}
setInterval(tick, 60_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tick();
});
