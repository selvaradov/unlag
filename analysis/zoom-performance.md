# Pinch zoom performance

Measured on 15 September 2026 with `analysis/zoom-benchmark.mjs --profile`.
The full-drawing baseline is commit `6208bd5`. Viewport drawing is isolated in
`c64befb`; the final implementation also reads day boundaries from the rendered list.
The pre-live-layout implementation is retained in `b9ac512`.

## Method

Both versions run the same browser script against separate local development servers, with a
390 × 844 viewport and the default plan. Each browser measures eight gestures, with four
updates per gesture, at two starting scroll positions. Browser instances are fresh; tests and
builds do not run concurrently. Setup scrolls are instantaneous. The full script also checks
buttons, layout changes, scrolling, keyboard focus and gesture cancellation.

Input-to-layout latency includes waiting for requestAnimationFrame and the synchronous update.
It excludes subsequent painting. Release timings follow a completed frame; releasing with a
queued update applies that update synchronously. Values below are medians of this run, not
frame-rate guarantees or timing assertions.

## Results

| Browser                   | Full drawing | Optimised drawing | Reduction | Release, optimised |
| ------------------------- | -----------: | ----------------: | --------: | -----------------: |
| Desktop WebKit            |      71.5 ms |             49 ms |       31% |               0 ms |
| Chromium, 4× CPU throttle |     103.5 ms |           53.4 ms |       48% |             0.7 ms |

## Measured work

Profiling instruments development responses in Playwright, without adding production logging.
Phase medians cover feed updates during the gesture scenarios. Columns show baseline → final.

| Browser                   | SVG parsing   | DOM updates    | Day summaries per scroll |
| ------------------------- | ------------- | -------------- | ------------------------ |
| Desktop WebKit            | 4 → 1 ms      | 10 → 4 ms      | 6 ms → no calls          |
| Chromium, 4× CPU throttle | 11.2 → 4.3 ms | 33.5 → 15.5 ms | 12.8 ms → no calls       |

SVG string construction remains about 2 ms in WebKit and 5 ms in throttled Chromium. Detailed
viewport drawing targets parsing, DOM updates and rendering work. Day highlighting uses the
stored start and end of each rendered day, avoiding summary construction during scrolling.

## Behaviour guards

- In-place drawings match fresh drawings across zoom levels while keeping touch targets attached.
- Viewport labels match full-plan positions; all event groups retain keyboard access.
- Browser checks verify continuous scale and font updates, undistorted text, anchor preservation,
  scrolling, focus, day highlighting, header resizing and repeated zoom-button presses.
- Cancellation, rapid release, restarts, changed finger pairs and movement at a zoom limit are checked.
- Lint, TypeScript, all 80 unit tests and the production build pass.

## Reproduction

Serve the chosen revision locally, then run the benchmark with an installed Playwright module:

```sh
node analysis/zoom-benchmark.mjs --profile --url http://127.0.0.1:5173 --playwright <module-path>
```

Optional `--webkit <executable>` and `--chromium <executable>` arguments select installed browser builds.
Keep the benchmark script identical for both revisions. The JSON output includes individual
samples, phase measurements and behaviour results.

Desktop WebKit is not the installed iOS runtime. The phone still needs a check for interaction
feel and painting; these timings do not establish smoothness or a frame rate on iOS.
