# Unlag

A jet lag planner in the style of Timeshifter. Give it a flight and your usual
sleep times and it produces a day by day schedule of sleep, light, caffeine and
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

All constants are in `src/config.ts` and all text in `src/copy.ts`.

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

## Development

```
pnpm install
pnpm dev        # local server
pnpm test       # vitest, includes a snapshot of the default plan
pnpm lint       # eslint and prettier
pnpm plan       # print the default plan as a table
pnpm build      # dist/
```

Deployed to Netlify from `dist/` with `netlify.toml`. The service worker
caches the app so it works offline after the first load.

## Layout

- `src/algorithm/` pure plan generation in UTC
- `src/ui/` header, timeline, text list, form, URL state, calendar export
- `src/config.ts`, `src/copy.ts` constants and copy
- `tests/` unit and rendering tests
- `scripts/print-plan.ts` command line plan printer
- `analysis/simulate.py` circadian model check
