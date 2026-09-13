# Unlag

A jet lag planner in the style of Timeshifter. Pick the airports, give it the flight
times and your usual sleep, and it produces a day by day schedule of sleep, light, caffeine and
melatonin. Everything runs in the browser and the plan lives in the URL, so a
link is a plan. Hosted at https://unlag.selvaradov.net.

## How it works

The schedule is rule based, following Burgess, _Using bright light and
melatonin to reduce jet lag_, and the light and melatonin phase response
curves.

- Tmin, the low point of your body clock, is taken as 3 h before habitual wake.
- Westward trips delay the clock, eastward trips advance it, unless the advance
  would exceed 9 h, in which case delaying is shorter.
- To delay, seek bright light in the 4 waking hours before Tmin and avoid it in
  the 4 hours after. To advance, the mirror image.
- Before the flight, bedtime moves 1 h a day later (delay) or 30 min earlier
  (advance) without cutting a night below 6.5 h.
- Each day Tmin moves by what the schedule actually allows: nothing before the
  flight except what timed light earns, and after arrival an unmanaged rate
  plus a bonus for light in the seek window, scaled down for indoor light.
- Long waking days get a nap slot, on the plane when there is one, and caffeine
  is allowed from the end of the nap until a cutoff before bed.
- Melatonin for advances is timed to shift the clock. For delays it is offered
  only as an optional sleep aid, since a dose at bedtime does not move a
  delaying clock.

All constants are in `src/config.ts` and all text in `src/copy.ts`, including
the method explanation served at `/how`. Icons are from Lucide (ISC).

## Checking against a circadian model

`analysis/simulate.py` converts a generated plan into a lux profile and
integrates the Forger99 and Hannay19 oscillator models from the Arcascope
`circadian` package, alongside an unchanged routine for comparison.

```
pnpm simulate
```

For the London to San Francisco default, both models move in the delaying
direction every day and finish ahead of the unchanged routine. Hannay19 reaches
its entrained position about when the rules say; Forger99 is slower and sits
about 2 h short a week after landing, which is a known property of that
model. The rules are kept as published rather than tuned to either.

## Flight lookup

Typing a flight number and date fills in the airports and times. The lookup
runs through a Netlify Function, `netlify/functions/flight.mts`, which holds
the API keys so nothing secret reaches the browser. Two providers are
supported and tried in order when their key is set:

- FlightAware AeroAPI, `AEROAPI_KEY`. Published schedules up to a year ahead.
  The Personal tier is free up to a small monthly allowance and is licensed
  for personal use only. Times come back in UTC and are converted using the
  airport's zone.
- AeroDataBox on RapidAPI, `AERODATABOX_KEY`. The Basic plan is free with no
  card, but its forward window is only a few days, so it suits last minute
  lookups.

```
netlify env:set AEROAPI_KEY <key>
netlify env:set AERODATABOX_KEY <key>
```

Set one or both and redeploy. Without any key the function answers 503 and
the form says lookup is not set up.

## Development

```
pnpm install
pnpm dev        # local server
pnpm test       # vitest, includes a snapshot of the default plan
pnpm lint       # eslint and prettier
pnpm plan       # print the default plan as a table
pnpm build      # dist/
netlify dev     # site plus the lookup function on one local port
```

Deployed to Netlify from `dist/` with `netlify.toml`. The service worker
caches the app and the self hosted IBM Plex fonts so it works offline after
the first load. The hour scale zooms with a two finger pinch, ctrl and wheel,
or the plus and minus buttons.

## Layout

- `src/algorithm/` pure plan generation in UTC
- `src/ui/` metro line feed, headline, day list, trip card, walkthrough, shared trip fields, airport picker, URL state, calendar export
- `netlify/functions/` the flight lookup proxy
- `src/data/` airports with cities and zones, loaded on demand; flight lookup client; rebuild with `uv run scripts/build-airports.py` (OurAirports for type, code and scheduled service, OpenFlights for city and zone)
- `src/config.ts`, `src/copy.ts` constants and copy
- `tests/` unit and rendering tests
- `scripts/print-plan.ts` command line plan printer
- `analysis/simulate.py` circadian model check
