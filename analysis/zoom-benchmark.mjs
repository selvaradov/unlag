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
    if (name === 'chromium') {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    const measurements = await page.evaluate(async () => {
      const { DEFAULT_PX_PER_HOUR, MIN_PX_PER_HOUR, MAX_PX_PER_HOUR } = await import('/src/ui/feed.ts');
      const rows = [];
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
          const start = scale();
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
            feed.dispatchEvent(event);
          };
          emit('start', 1);
          for (let step = 1; step <= 4; step++) {
            emit('change', 1 + ((ratio - 1) * step) / 4);
            await wait();
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
      return { nodes, height, rows, badFrames: frames.filter((frame) => frame.top !== 0 || !frame.hit) };
    });
    assert.deepEqual(measurements.badFrames, []);
    for (const row of measurements.rows) assert.ok(Math.abs(row.expected - row.actual) < 0.000001);
    assert.deepEqual(errors, []);
    results.push({ browser: name, cpuThrottle: name === 'chromium' ? 4 : 1, ...measurements });
  } finally {
    await browser.close();
  }
}
console.log(JSON.stringify(results, null, 2));
