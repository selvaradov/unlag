// Looks up a flight's scheduled legs by number and date, keeping the API keys off the page.
// GET /api/flight?number=UA900&date=2026-09-16
//
// Two providers, tried in order when their key is present:
//   AEROAPI_KEY      FlightAware AeroAPI schedules, published up to a year ahead; times in UTC
//   AERODATABOX_KEY  AeroDataBox on RapidAPI, good for dates close to today; times local
import type { Config } from '@netlify/functions';

interface Point {
  code: string;
  city?: string;
  tz?: string;
  // Local wall clock without offset, when the provider gives it.
  departure?: string;
  arrival?: string;
  // UTC instants, when the provider gives those instead.
  departureUtc?: string;
  arrivalUtc?: string;
}

interface Lookup {
  carrier: string;
  number: string;
  date: string;
  provider: string;
  points: Point[];
}

class LookupFailure extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function json(body: unknown, status = 200, cache = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  });
}

// "UA 900", "ua900" and "UA-900" all mean carrier UA, flight 900.
export function parseFlightNumber(raw: string): { carrier: string; number: string } | null {
  const m = raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .match(/^([A-Z][A-Z0-9])(\d{1,4})[A-Z]?$/);
  return m ? { carrier: m[1], number: String(Number(m[2])) } : null;
}

// AeroDataBox gives "2026-09-16 10:35+01:00"; the plan wants the wall clock alone.
function local(value: string | undefined): string | undefined {
  const m = value?.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : undefined;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Legs become a chain of points: each leg's arrival is the next leg's departure.
function chain<T>(legs: T[], dep: (l: T) => Point, arr: (l: T) => Point): Point[] {
  const points: Point[] = [];
  for (const leg of legs) {
    const d = dep(leg);
    const last = points[points.length - 1];
    if (last && last.code === d.code) Object.assign(last, { departure: d.departure, departureUtc: d.departureUtc });
    else points.push(d);
    points.push(arr(leg));
  }
  return points;
}

interface AeroApiLeg {
  ident_iata?: string;
  actual_ident_iata?: string | null;
  scheduled_out?: string;
  scheduled_in?: string;
  origin_iata?: string;
  destination_iata?: string;
}

async function aeroApi(key: string, carrier: string, number: string, date: string): Promise<Point[]> {
  const q = new URLSearchParams({
    airline: carrier,
    flight_number: number,
    include_codeshares: 'false',
    max_pages: '1',
  });
  const res = await fetch(`https://aeroapi.flightaware.com/aeroapi/schedules/${date}/${nextDay(date)}?${q}`, {
    headers: { 'x-apikey': key, accept: 'application/json' },
  });
  if (!res.ok) throw new LookupFailure('upstream', res.status);
  const data = (await res.json()) as { scheduled?: AeroApiLeg[] };
  const want = `${carrier}${number}`;
  const legs = (data.scheduled ?? [])
    .filter((l) => l.origin_iata && l.destination_iata && l.scheduled_out && l.scheduled_in)
    .filter((l) => !l.ident_iata || l.ident_iata === want || l.actual_ident_iata === want)
    .sort((a, b) => String(a.scheduled_out).localeCompare(String(b.scheduled_out)));
  if (!legs.length) throw new LookupFailure('not-found', 404);
  return chain(
    legs,
    (l) => ({ code: l.origin_iata!, departureUtc: l.scheduled_out }),
    (l) => ({ code: l.destination_iata!, arrivalUtc: l.scheduled_in }),
  );
}

interface Movement {
  airport?: { iata?: string; municipalityName?: string; timeZone?: string };
  scheduledTime?: { local?: string; utc?: string };
}

interface AeroDataBoxLeg {
  departure?: Movement;
  arrival?: Movement;
}

async function aeroDataBox(key: string, carrier: string, number: string, date: string): Promise<Point[]> {
  const host = 'aerodatabox.p.rapidapi.com';
  const path = `/flights/number/${carrier}${number}/${date}?dateLocalRole=Departure&withLocation=false`;
  const res = await fetch(`https://${host}${path}`, {
    headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host, accept: 'application/json' },
  });
  if (res.status === 204 || res.status === 404) throw new LookupFailure('not-found', 404);
  if (!res.ok) throw new LookupFailure('upstream', res.status);
  const legs = ((await res.json()) as AeroDataBoxLeg[])
    .filter((l) => l.departure?.airport?.iata && l.arrival?.airport?.iata && l.departure?.scheduledTime?.utc)
    .sort((a, b) => String(a.departure!.scheduledTime!.utc).localeCompare(String(b.departure!.scheduledTime!.utc)));
  if (!legs.length) throw new LookupFailure('not-found', 404);
  const point = (m: Movement, when: 'departure' | 'arrival'): Point => ({
    code: m.airport!.iata!,
    city: m.airport?.municipalityName,
    tz: m.airport?.timeZone,
    [when]: local(m.scheduledTime?.local),
  });
  return chain(
    legs,
    (l) => point(l.departure!, 'departure'),
    (l) => point(l.arrival!, 'arrival'),
  );
}

export default async (req: Request): Promise<Response> => {
  const providers: { name: string; run: (c: string, n: string, d: string) => Promise<Point[]> }[] = [];
  if (process.env.AEROAPI_KEY)
    providers.push({ name: 'aeroapi', run: (c, n, d) => aeroApi(process.env.AEROAPI_KEY!, c, n, d) });
  if (process.env.AERODATABOX_KEY)
    providers.push({ name: 'aerodatabox', run: (c, n, d) => aeroDataBox(process.env.AERODATABOX_KEY!, c, n, d) });
  if (!providers.length) return json({ error: 'unavailable' }, 503);

  const url = new URL(req.url);
  const flight = parseFlightNumber(url.searchParams.get('number') ?? '');
  const date = url.searchParams.get('date') ?? '';
  if (!flight || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'bad-request' }, 400);

  let failure: LookupFailure | null = null;
  for (const p of providers) {
    try {
      const points = await p.run(flight.carrier, flight.number, date);
      const body: Lookup = { carrier: flight.carrier, number: flight.number, date, provider: p.name, points };
      return json(body, 200, 'public, max-age=86400');
    } catch (err) {
      failure = err instanceof LookupFailure ? err : new LookupFailure('failed', 502);
    }
  }
  return json({ error: failure?.code ?? 'failed' }, failure?.status ?? 502);
};

export const config: Config = { path: '/api/flight' };
