# Unlag

_All code, and this README, written by Fable 5.1._

A jet lag planner. Pick the airports or type a flight number, give it your usual
sleep, and it produces a day by day schedule of sleep, light, caffeine and
melatonin around the flight. The plan lives in the page address, so a link is a
plan. Hosted at https://unlag.selvaradov.net.

## The science

The schedule is rule based, following Burgess, _Using bright light and
melatonin to reduce jet lag_, and the light and melatonin phase response
curves. Everything hangs off one point.

- **Tmin** is the nightly low of core body temperature, about three hours
  before habitual wake, so 04:00 for a 07:00 riser. Light before Tmin delays
  the clock, light after it advances it, light eight or more hours away does
  little.
- **Direction.** Flying west the clock must delay, flying east advance, unless
  the advance would exceed nine hours, when delaying is shorter.
- **Light rules.** To delay, seek bright light in the four waking hours before
  Tmin and avoid it in the four after; to advance, the mirror image. Sunglasses
  and dim rooms count as avoiding. A seek window that falls in sleep is lost.
- **Rates.** Unmanaged after arrival the clock delays about 1.5 h a day and
  advances about 1 h; well timed light adds about half an hour. Before the
  flight there is no drift, so the shift comes only from moving bedtime and
  getting light at the right time, worth up to 1 h a day for a delay and half
  that for an advance, less with room light than daylight.
- **Sleep.** Bedtime moves by up to an hour a day before the flight and a
  night is never cut below 6.5 h. Landing in the evening or at night means bed
  90 minutes after landing. Waking stretches over 18 h get a nap of up to 90
  minutes, on the plane where possible, at least eight hours before bed.
- **Caffeine** is a wakefulness tool with a cutoff before bed, six hours for
  regular users and eight otherwise, never before a nap, and never within an
  hour of the cutoff.
- **Melatonin** for advances is timed to shift the clock. For delays the
  shifting dose would fall in the biological morning, so it is offered only as
  an optional sleep aid and no shift is counted on it.

Constants are in `src/config.ts`, all text in `src/copy.ts`, including the
method explanation served at `/how`.

### Model check

`analysis/simulate.py` (`pnpm simulate`) turns a generated plan into a lux
profile and integrates the Forger99 and Hannay19 oscillator models from the
Arcascope `circadian` package, alongside an unchanged routine. For the London
to San Francisco example both models move in the delaying direction every day
and finish ahead of the unchanged routine. Hannay19 reaches its entrained
position about when the rules say; Forger99 is slower and sits about 2 h short
a week after landing, a known property of that model. The rules are kept as
published rather than tuned to either.

## The interface

One vertical hour axis runs through the whole plan, local time on the left and
the other zone's time on the right where there is room. Instructions are a
single metro style line: sleep (teal), get bright light (saffron) and avoid
bright light (hollow saffron) are thick segments with a station and icon at
each start, labelled with the action, duration and, when current, the end
time. The flight kinks the line and its span is shaded; the axis breaks at
landing with a dashed rule carrying the zone names. Caffeine (espresso) and
melatonin (plum) run on a thin line to the right, solid while caffeine is fine,
dashed after the cutoff, with a dot per dose. Labels are laid out in a pass that
pushes colliding labels down and drops lines when there is no room. A dashed
red line marks now.

The headline is a note to self composed from the active windows, "Sunglasses
on until 09:45, then the flight at 10:35", with a countdown to the end of the
current window. Tapping a segment shows its details.

The trip card holds the route by city, flight times, the size and direction of
the shift, usual sleep, the predicted adaptation date, calendar and copy link
buttons, Edit trip, Notify me, and a link to the method page. Editing replaces
the card with the form; Cancel restores the inputs. Without a plan in the URL
the page opens on a three step walkthrough.

Layouts: under 900 px a sticky header with the day name (opens a day list) and
a Trip button (opens the card as a sheet), zoom and Now floating; 900 to 1199
px a side panel with Plan and Trip tabs; from 1200 px three columns with the
day list left and the trip card right. The day list draws each day's
instructions on a noon to noon strip. The hour scale zooms by pinch, ctrl and
wheel, or the magnifier buttons, and is remembered.

Theme: paper and ink, IBM Plex Sans and Mono self hosted, icons from Lucide.
Light and dark follow the system by default; a toggle in the panel head (or the
Trip sheet on phones) fixes light or dark, remembered on the device and applied
before the first paint.

## Flight lookup

A flight number and date fill in the airports and times through a Netlify
Function, `netlify/functions/flight.mts`, which calls FlightAware AeroAPI's
schedules endpoint with a key held in the environment. Schedules are published
up to a year ahead; UTC times are converted with the airport's zone. The
Personal tier is free up to a small monthly allowance and licensed for personal
use only. FlightAware offers no account level spending cap, so the function
bounds spend itself: same site requests only, a day of CDN caching, atomic
counters in Netlify Blobs for 12 lookups per client per hour and 300 a month
(`LOOKUP_HOURLY_CAP`, `LOOKUP_MONTHLY_CAP`), and this month's spend read from
the usage endpoint at most hourly with a refusal past `LOOKUP_SPEND_LIMIT`
dollars (default 4.5). When any guard cannot be read the lookup is refused.

```
netlify env:set AEROAPI_KEY <key>
```

## Notifications

Notify me subscribes the device to Web Push for the plan shown. The
subscription and the plan's query string go to Netlify Blobs through
`netlify/functions/push-subscribe.mts`, which validates both. A scheduled
function, `netlify/functions/push-tick.mts`, runs every five minutes,
regenerates each stored plan and pushes what starts since its last delivery:
windows at their start, the caffeine cutoff, doses. Failed deliveries are
retried next run within an hour; gone subscriptions and plans over a week old
are removed. A device following a different plan is offered a switch, and
finishing an edit updates the stored plan. VAPID keys live in
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`. The service
worker in `src/sw.ts` shows the notification, opens the plan on tap, reloads
the page when a new build takes over, and caches the app for offline use. On
iPhone and iPad the site must be added to the home screen first. The calendar
file remains the no server alternative.

## Data

`src/data/airports.json` holds large and medium airports with scheduled
service, with city and IANA zone, built by `uv run scripts/build-airports.py`
from OurAirports (type, code, scheduled service) and OpenFlights (city, zone).
It loads on demand.

## Development

```
pnpm install
pnpm dev        # site; add netlify dev for the functions too
pnpm test       # vitest, includes a snapshot of the example plan
pnpm lint       # eslint and prettier
pnpm plan       # print the example plan as a table
pnpm build      # dist/
```

Deploy with `netlify deploy --prod --dir dist --no-build` from this folder.
The site is a separate Netlify project with the custom domain attached; the
zone is on Netlify DNS.

Layout:

- `src/algorithm/` pure plan generation in UTC, plus input validation
- `src/push/` the messages due in a window
- `src/ui/` feed, headline, day list, trip card, walkthrough, trip fields,
  airport picker, notify, URL state, calendar export
- `src/data/` airports and the flight lookup client
- `netlify/functions/` flight lookup, push subscribe and status, scheduled push
- `analysis/simulate.py` circadian model check
- `scripts/` plan printer and airport list build
- `tests/` unit, rendering and function logic tests

## Decisions worth remembering

- Rule based generation was chosen over an oscillator model because the
  inputs (light in lux) are guesses for someone without a light box and the
  rules are traceable; the model is used once as a check.
- A day's shift is earned from the light the schedule actually allows, not a
  fixed daily step.
- Plans live in the URL; there are no accounts.
- Amadeus was dropped when its self service portal closed; AeroDataBox was
  dropped because its forward window is a few days.
- Timeshifter's vertical time axis and categories are shared as function; the
  expression, a transit line, IBM Plex, teal and saffron, is Unlag's own.

## Licences

Icons from Lucide (ISC) and the IBM Plex fonts (SIL Open Font License 1.1).
The airport list derives from OurAirports (public domain) and OpenFlights
(Open Database License 1.0), so `src/data/airports.json` is available under
the ODbL. Notices are in `public/licences.txt`, linked from the method page,
and the font licence sits beside the fonts.

## Not built

Return trips and multi city plans, a daily check in that re-anchors Tmin,
sunrise and sunset on the timeline, and any collection of outcomes.
