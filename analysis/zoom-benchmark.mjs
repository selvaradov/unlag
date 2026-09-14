// Run against pnpm dev with --playwright pointing to an installed Playwright module if needed.
// Synthetic events measure app work and geometry, not the installed iOS app's painting.
/* global document, window, location, requestAnimationFrame, getComputedStyle */
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:5173' },
    playwright: { type: 'string', default: 'playwright' },
    chromium: { type: 'string' },
    webkit: { type: 'string' },
    profile: { type: 'boolean', default: false },
  },
});
const engines = await import(values.playwright);
const results = [];

for (const name of ['webkit', 'chromium']) {
  const browser = await engines[name].launch({ headless: true, executablePath: values[name] });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      serviceWorkers: 'block',
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (values.profile) {
      await page.route('**/src/ui/feed.ts*', async (route) => {
        const response = await route.fetch();
        let body = await response.text();
        body = body.replace(
          /function renderFeed\(plan, opts, existing\) \{/,
          '$&\nconst profileStart = performance.now();',
        );
        body = body.replace(
          /root.innerHTML = svg.join\((['"])\1\);/,
          'const profileBuilt = performance.now();\n$&\nconst profileParsed = performance.now();',
        );
        body = body.replace(
          'const feed = existing ?? root;',
          'const profilePatch = performance.now();\nconst feed = existing ?? root;',
        );
        body = body.replace(
          'return feed;',
          `
          (window.zoomProfile ??= []).push({
            buildMs: profileBuilt - profileStart,
            parseMs: profileParsed - profileBuilt,
            anchorsMs: profilePatch - profileParsed,
            patchMs: performance.now() - profilePatch,
          });
          return feed;`,
        );
        await route.fulfill({ response, body });
      });
    }
    await page.goto(values.url);
    await page.evaluate(async () => {
      const { defaultInput, writeInput } = await import('/src/ui/state.ts');
      location.search = writeInput(defaultInput());
    });
    await page.waitForSelector('.feed');
    await page.evaluate(() => document.fonts.ready);

    const checkHeader = async () => {
      await page.waitForFunction(() => {
        const bar = document.querySelector('.top-bar');
        const feed = document.querySelector('.feed');
        const top = feed.getBoundingClientRect().top + window.scrollY;
        return bar.getBoundingClientRect().top === 0 && Math.abs(top - bar.offsetHeight) < 1;
      });
    };
    const checkZoomButtons = async () => {
      const bounds = await page.evaluate(async () => {
        const { DEFAULT_PX_PER_HOUR, MIN_PX_PER_HOUR, MAX_PX_PER_HOUR } = await import('/src/ui/feed.ts');
        return { default: DEFAULT_PX_PER_HOUR, min: MIN_PX_PER_HOUR, max: MAX_PX_PER_HOUR };
      });
      const scale = () =>
        page.evaluate(
          (fallback) => Number(window.localStorage.getItem('unlag-px-per-hour')) || fallback,
          bounds.default,
        );
      for (const [button, factor, limit] of [
        [1, 1.3, bounds.max],
        [0, 1 / 1.3, bounds.min],
      ]) {
        for (let press = 0; press < 8; press++) {
          const before = await scale();
          await page.locator('.zoom-group button').nth(button).dblclick();
          const expected = Math.min(bounds.max, Math.max(bounds.min, before * factor * factor));
          assert.ok(Math.abs((await scale()) - expected) < 0.000001, 'Rapid presses must take two zoom steps');
        }
        assert.equal(await scale(), limit);
      }
    };
    await checkHeader();
    await checkZoomButtons();
    await page.locator('.feed g.look-light').first().dispatchEvent('click');
    await page.waitForSelector('.headline.selected');
    await checkHeader();
    await page.locator('.close-selected').click();
    await checkHeader();
    await page.locator('.trip-button').click();
    assert.equal(await page.locator('dialog.trip-sheet').evaluate((dialog) => dialog.open), true);
    await page.locator('.trip-sheet .sheet-head button').click();
    await checkHeader();
    for (const width of [1000, 1400, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForFunction(
        (expected) => document.querySelector('#app').className === expected,
        width >= 1200 ? 'wide' : width >= 900 ? 'medium' : 'mobile',
      );
      if (width === 390) await checkHeader();
      else {
        assert.equal(await page.locator('.top-bar').count(), 0);
        assert.equal(await page.locator('.feed-host').evaluate((host) => getComputedStyle(host).paddingTop), '0px');
      }
      await checkZoomButtons();
    }
    // Use the default scale and a fresh page for the gesture measurements.
    await page.evaluate(() => window.localStorage.removeItem('unlag-px-per-hour'));
    await page.reload();
    await page.waitForSelector('.feed');
    await page.evaluate(() => document.fonts.ready);
    await checkHeader();
    await page.evaluate(() => {
      window.zoomProfile = [];
    });
    if (name === 'chromium') {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    const measurements = await page.evaluate(async () => {
      const { DEFAULT_PX_PER_HOUR, MIN_PX_PER_HOUR, MAX_PX_PER_HOUR, FEED_PAD_TOP, metrics } =
        await import('/src/ui/feed.ts');
      const rows = [];
      const layouts = [];
      const frames = [];
      const wait = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const sample = () => {
        const bar = document.querySelector('.top-bar');
        frames.push({
          top: bar.getBoundingClientRect().top,
          hit: !!document.elementFromPoint(window.innerWidth / 2, 25)?.closest('.top-bar'),
        });
      };
      const scale = () => Number(window.localStorage.getItem('unlag-px-per-hour')) || DEFAULT_PX_PER_HOUR;
      const gesture = 'GestureEvent' in window;
      const nodes = document.querySelectorAll('.rail *').length;
      const height = document.querySelector('.feed').offsetHeight;
      for (const position of [0.5, 0.95]) {
        for (const ratio of [1.8, 0.4, 2.5, 0.32]) {
          window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) * position);
          await wait();
          await wait();
          const feed = document.querySelector('.feed');
          const target = feed.querySelector('text.hour-label');
          const rail = feed.querySelector('svg.rail');
          const start = scale();
          const hours = (parseFloat(feed.style.height) - FEED_PAD_TOP) / start;
          const anchor = (400 - feed.getBoundingClientRect().top - FEED_PAD_TOP) / start;
          const emit = (kind, factor) => {
            const type = gesture ? `gesture${kind}` : `touch${{ start: 'start', change: 'move', end: 'end' }[kind]}`;
            const event = new Event(type, { bubbles: true, cancelable: true });
            if (gesture) Object.assign(event, { scale: factor, clientX: 195, clientY: 400 });
            else {
              Object.defineProperty(event, 'touches', {
                value:
                  kind === 'end'
                    ? []
                    : [
                        { identifier: 0, clientX: 195, clientY: 400 - 50 * factor },
                        { identifier: 1, clientX: 195, clientY: 400 + 50 * factor },
                      ],
              });
            }
            target.dispatchEvent(event);
          };
          emit('start', 1);
          for (let step = 1; step <= 4; step++) {
            const factor = 1 + ((ratio - 1) * step) / 4;
            const began = performance.now();
            emit('change', factor);
            await wait();
            const frameMs = performance.now() - began;
            const expected = Math.min(MAX_PX_PER_HOUR, Math.max(MIN_PX_PER_HOUR, start * factor));
            const top = feed.getBoundingClientRect().top + window.scrollY;
            const scroll = Math.min(
              document.documentElement.scrollHeight - window.innerHeight,
              Math.max(0, top + FEED_PAD_TOP + anchor * expected - 400),
            );
            const matrix = rail.getScreenCTM();
            layouts.push({
              position,
              ratio,
              expected,
              scroll,
              actualScroll: window.scrollY,
              frameMs,
              scaleError: Math.abs((parseFloat(feed.style.height) - FEED_PAD_TOP) / hours - expected),
              fontError: Math.abs(
                parseFloat(rail.style.getPropertyValue('--feed-font')) -
                  metrics(expected, rail.width.baseVal.value).font,
              ),
              anchorError: Math.abs(window.scrollY - scroll),
              distortion: Math.abs(matrix.a - matrix.d),
              attached:
                target.isConnected &&
                feed === document.querySelector('.feed') &&
                rail === feed.querySelector('svg.rail'),
            });
            sample();
          }
          const began = performance.now();
          emit('end', ratio);
          const releaseMs = performance.now() - began;
          for (let frame = 0; frame < 3; frame++) {
            await wait();
            sample();
          }
          rows.push({
            position,
            ratio,
            expected: Math.min(MAX_PX_PER_HOUR, Math.max(MIN_PX_PER_HOUR, start * ratio)),
            actual: scale(),
            releaseMs,
          });
        }
      }
      return { nodes, height, rows, layouts, badFrames: frames.filter((frame) => frame.top !== 0 || !frame.hit) };
    });
    assert.deepEqual(measurements.badFrames, []);
    for (const layout of measurements.layouts) {
      assert.ok(layout.attached);
      assert.ok(layout.scaleError < 0.001, `The hour scale must update during the pinch ${JSON.stringify(layout)}`);
      assert.ok(layout.fontError < 0.000001, 'Text must use the current layout font size');
      assert.ok(layout.anchorError <= 1, `The time under the fingers must stay anchored ${JSON.stringify(layout)}`);
      assert.equal(layout.distortion, 0, 'Text must not be stretched');
    }
    for (const row of measurements.rows) assert.ok(Math.abs(row.expected - row.actual) < 0.000001);
    assert.deepEqual(errors, []);
    const profile = values.profile ? await page.evaluate(() => window.zoomProfile) : undefined;
    if (values.profile) assert.ok(profile.length > 0, 'Renderer profiling must record samples');
    results.push({ browser: name, cpuThrottle: name === 'chromium' ? 4 : 1, ...measurements, profile });
  } finally {
    await browser.close();
  }
}
console.log(JSON.stringify(results, null, 2));
