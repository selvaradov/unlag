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

## Touch input and scrolling

Phone pinches use the distance and midpoint of the actual touches. Two-finger touchstart and
touchmove cancel native scrolling. GestureEvent input is ignored while fingers remain down;
it is available for trackpads. A fresh one-finger gesture retains native scrolling.
Safari sends both touch and gesture events, with separate default behaviour for scrolling and
browser zoom ([Apple event documentation](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/HandlingEvents/HandlingEvents.html)).

`analysis/pinch-input.mjs --check` uses Chromium's browser input protocol to deliver touches.
It repeats the same input with accompanying simulated Safari gesture events whose centre
deliberately disagrees with the touch midpoint. This checks which input controls the anchor;
it does not claim to reproduce the coordinates supplied by an iPhone.

Against `abc36a7`, the mixed-input case has a maximum anchor error of 399.8 px and uncancelled
pinch touch events. With touch ownership, maximum error is 0.4 px, pinch events are cancelled,
and release drift is zero. Fresh one-finger scrolling passes in both cases. These are controlled
regression measurements, not measurements of the reported installed-iOS jitter.

The same layout benchmark measures median input-to-layout latency of 51 ms in WebKit and
52.0 ms in Chromium with 4× CPU throttle for `abc36a7`. With touch ownership, the corresponding
values are 52.5 ms and 53.5 ms. Explicit touch mode measures 52 ms and 56.9 ms. The renderer
is unchanged; these single-run timings show no speed improvement and do not measure painting.

```sh
node analysis/pinch-input.mjs --check --playwright <module-path> --chromium <executable>
node analysis/zoom-benchmark.mjs --touch --profile --playwright <module-path>
```

The input diagnostic retains at most 500 entries, including touch and gesture coordinates,
requested and actual scroll position, document height and resize events. The full benchmark's
`--touch` mode checks the touch path in both engines, including mixed event ordering and the
transition from two fingers to one.

Installed-iOS live pinching has a reported jitter regression. Touch ownership addresses a
confirmed input-handling gap, but the exact device-level cause and the correction's feel still
require an on-device check. Desktop timings do not establish smoothness or a frame rate on iOS.
