// Chromium delivers real touch input; Safari's accompanying gesture events are simulated.
/* global window, document, location, requestAnimationFrame */
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:5173' },
    playwright: { type: 'string', default: 'playwright' },
    chromium: { type: 'string' },
    check: { type: 'boolean', default: false },
  },
});
const { chromium } = await import(values.playwright);
const browser = await chromium.launch({ executablePath: values.chromium, headless: true });
const results = [];
try {
  for (const safari of [false, true]) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
    });
    if (safari)
      await page.addInitScript(() => {
        window.GestureEvent = class {};
        let pinching = false;
        for (const type of ['touchstart', 'touchmove', 'touchend']) {
          window.addEventListener(
            type,
            (event) => {
              const pair = event.touches.length === 2;
              const kind = pair ? (pinching ? 'change' : 'start') : pinching ? 'end' : null;
              pinching = pair;
              if (!kind) return;
              const gesture = new Event(`gesture${kind}`, { bubbles: true, cancelable: true });
              // Deliberately disagree with the touches to check which input owns the anchor.
              Object.assign(gesture, {
                scale: pair ? Math.abs(event.touches[0].clientY - event.touches[1].clientY) / 100 : 1,
                clientY: 0,
              });
              event.target.dispatchEvent(gesture);
            },
            { capture: true, passive: true },
          );
        }
      });
    await page.goto(values.url);
    await page.evaluate(async () => {
      const { defaultInput, writeInput } = await import('/src/ui/state.ts');
      location.search = writeInput(defaultInput());
    });
    await page.waitForSelector('.feed');
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo({ top: 3000, behavior: 'instant' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.pinchTrace = [];
      const record = (row) => {
        if (window.pinchTrace.length < 500) window.pinchTrace.push({ ms: performance.now(), ...row });
      };
      const scrollTo = window.scrollTo.bind(window);
      window.scrollTo = (...args) => {
        scrollTo(...args);
        record({
          type: 'scroll-write',
          requested: typeof args[0] === 'object' ? args[0].top : args[1],
          actual: window.scrollY,
          height: document.documentElement.scrollHeight,
        });
      };
      for (const type of [
        'touchstart',
        'touchmove',
        'touchend',
        'gesturestart',
        'gesturechange',
        'gestureend',
        'scroll',
        'resize',
      ]) {
        window.addEventListener(
          type,
          (event) => {
            record({
              type,
              prevented: event.defaultPrevented,
              trusted: event.isTrusted,
              scroll: window.scrollY,
              height: document.documentElement.scrollHeight,
              gestureY: event.clientY,
              touches: event.touches ? [...event.touches].map((t) => ({ id: t.identifier, y: t.clientY })) : undefined,
            });
          },
          { passive: true },
        );
      }
    });
    const cdp = await page.context().newCDPSession(page);
    const send = (type, points) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, y]) => ({ id, x: 195, y })) });
    const samples = [];
    const initial = await page.evaluate(() => ({
      scroll: window.scrollY,
      height: parseFloat(document.querySelector('.feed').style.height),
      top: document.querySelector('.feed').getBoundingClientRect().top + window.scrollY,
    }));
    await send('touchStart', [
      [0, 350],
      [1, 450],
    ]);
    for (let i = 1; i <= 8; i++) {
      const centre = 400 - i * 10;
      const factor = 1 + i / 10;
      await send('touchMove', [
        [0, centre - 50 * factor],
        [1, centre + 50 * factor],
      ]);
      samples.push(
        await page.evaluate(
          async ({ initial, centre, factor }) => {
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const { FEED_PAD_TOP } = await import('/src/ui/feed.ts');
            const feed = document.querySelector('.feed');
            const ratio = (parseFloat(feed.style.height) - FEED_PAD_TOP) / (initial.height - FEED_PAD_TOP);
            const anchor = initial.scroll + 400 - initial.top - FEED_PAD_TOP;
            return { factor, ratio, error: feed.getBoundingClientRect().top + FEED_PAD_TOP + anchor * ratio - centre };
          },
          { initial, centre, factor },
        ),
      );
    }
    await send('touchEnd', []);
    const release = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(200);
    const settled = await page.evaluate(() => window.scrollY);
    // A fresh one-finger gesture must retain browser scrolling.
    await send('touchStart', [[0, 500]]);
    for (let i = 1; i <= 8; i++) {
      await send('touchMove', [[0, 500 - i * 15]]);
      await page.waitForTimeout(25);
    }
    await send('touchEnd', []);
    await page.waitForTimeout(200);
    const row = await page.evaluate(
      ({ safari, samples, release, settled }) => ({
        safariBranch: safari,
        samples,
        releaseDrift: settled - release,
        oneFingerScroll: window.scrollY - settled,
        trace: window.pinchTrace,
      }),
      { safari, samples, release, settled },
    );
    row.guards = {
      trustedInput: row.trace.some((t) => t.type === 'touchmove' && t.trusted && t.touches.length === 2),
      scale: samples.every((s) => Math.abs(s.ratio - s.factor) < 0.001),
      anchor: samples.every((s) => Math.abs(s.error) <= 1),
      secondTouchCancelled: row.trace
        .filter((t) => t.type === 'touchstart' && t.touches.length === 2)
        .every((t) => t.prevented),
      pinchMovesCancelled: row.trace
        .filter((t) => t.type === 'touchmove' && t.touches.length === 2)
        .every((t) => t.prevented),
      release: Math.abs(row.releaseDrift) <= 1,
      singleFinger: row.oneFingerScroll > 50,
    };
    results.push(row);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
if (values.check)
  for (const row of results)
    assert.ok(
      Object.values(row.guards).every(Boolean),
      JSON.stringify({ safari: row.safariBranch, guards: row.guards }),
    );
