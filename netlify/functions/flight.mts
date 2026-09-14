// Looks up a flight's scheduled legs by number and date through FlightAware AeroAPI, keeping
// the key off the page and the spend bounded. GET /api/flight?number=UA900&date=2026-09-16
//
// Guards, so a bot cannot run up the bill:
//   - only requests from this site's own pages are served
//   - a monthly cap on lookups (LOOKUP_MONTHLY_CAP, default 300) and an hourly cap per client
//   - the account's own spend this month, read from AeroAPI at most hourly, must stay under
//     LOOKUP_SPEND_LIMIT dollars (default 4.5, inside the Personal tier's free allowance)
//   - identical queries are cached at the CDN for a day
//   - when the counters or the usage check cannot be read, the lookup is refused
import { getStore } from '@netlify/blobs';
import type { Config, Context } from '@netlify/functions';
import { fromThisSite, json } from '../lib/api.ts';

const MONTHLY_CAP = Number(process.env.LOOKUP_MONTHLY_CAP ?? 300);
const HOURLY_CAP_PER_CLIENT = Number(process.env.LOOKUP_HOURLY_CAP ?? 12);
const SPEND_LIMIT = Number(process.env.LOOKUP_SPEND_LIMIT ?? 4.5);

interface Point {
  code: string;
  // UTC instants; the page turns them into the wall clock at each airport.
  departureUtc?: string;
  arrivalUtc?: string;
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

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Counts in a blob store with conditional writes, so two requests at once cannot both slip under
// the cap. The counter's key carries the period, so old ones simply stop mattering.
async function underCap(key: string, cap: number): Promise<boolean> {
  const store = getStore('lookups');
  for (let attempt = 0; attempt < 6; attempt++) {
    const found = await store.getWithMetadata(key, { type: 'text' });
    const current = Number(found?.data ?? 0);
    if (current >= cap) return false;
    const result = found
      ? await store.set(key, String(current + 1), { onlyIfMatch: found.etag })
      : await store.set(key, '1', { onlyIfNew: true });
    if (result.modified) return true;
  }
  throw new Error('counter contention');
}

// This month's spend according to AeroAPI, remembered for an hour so the check itself stays cheap.
async function spendThisMonth(key: string): Promise<number> {
  const store = getStore('lookups');
  const hour = new Date().toISOString().slice(0, 13);
  const cached = await store.get(`spend/${hour}`);
  if (cached !== null) return Number(cached);
  const res = await fetch('https://aeroapi.flightaware.com/aeroapi/account/usage', {
    headers: { 'x-apikey': key, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`usage ${res.status}`);
  const usage = (await res.json()) as { total_cost?: number };
  const cost = Number(usage.total_cost ?? 0);
  await store.set(`spend/${hour}`, String(cost));
  return cost;
}

interface Leg {
  ident_iata?: string;
  actual_ident_iata?: string | null;
  scheduled_out?: string;
  scheduled_in?: string;
  origin_iata?: string;
  destination_iata?: string;
}

async function aeroApi(key: string, carrier: string, number: string, date: string): Promise<Point[] | null> {
  const q = new URLSearchParams({
    airline: carrier,
    flight_number: number,
    include_codeshares: 'false',
    max_pages: '1',
  });
  const res = await fetch(`https://aeroapi.flightaware.com/aeroapi/schedules/${date}/${nextDay(date)}?${q}`, {
    headers: { 'x-apikey': key, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const data = (await res.json()) as { scheduled?: Leg[] };
  const want = `${carrier}${number}`;
  const legs = (data.scheduled ?? [])
    .filter((l) => l.origin_iata && l.destination_iata && l.scheduled_out && l.scheduled_in)
    .filter((l) => !l.ident_iata || l.ident_iata === want || l.actual_ident_iata === want)
    .sort((a, b) => String(a.scheduled_out).localeCompare(String(b.scheduled_out)));
  if (!legs.length) return null;
  // Legs become a chain of points: each leg's arrival is the next leg's departure.
  const points: Point[] = [];
  for (const leg of legs) {
    const last = points[points.length - 1];
    if (last && last.code === leg.origin_iata) last.departureUtc = leg.scheduled_out;
    else points.push({ code: leg.origin_iata!, departureUtc: leg.scheduled_out });
    points.push({ code: leg.destination_iata!, arrivalUtc: leg.scheduled_in });
  }
  return points;
}

export default async (req: Request, context: Context): Promise<Response> => {
  const key = process.env.AEROAPI_KEY;
  if (!key) return json({ error: 'unavailable' }, 503);
  if (!fromThisSite(req)) return json({ error: 'forbidden' }, 403);

  const url = new URL(req.url);
  const flight = parseFlightNumber(url.searchParams.get('number') ?? '');
  const date = url.searchParams.get('date') ?? '';
  if (!flight || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'bad-request' }, 400);

  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const hour = now.toISOString().slice(0, 13);
  const client = context.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  // The guards fail closed: if the counters or the usage check cannot be read, no lookup is made.
  try {
    if (!(await underCap(`client/${hour}/${client}`, HOURLY_CAP_PER_CLIENT)))
      return json({ error: 'rate-limited' }, 429);
    if (!(await underCap(`month/${month}`, MONTHLY_CAP))) return json({ error: 'quota' }, 429);
    if ((await spendThisMonth(key)) >= SPEND_LIMIT) return json({ error: 'quota' }, 429);
  } catch {
    return json({ error: 'unavailable' }, 503);
  }

  try {
    const points = await aeroApi(key, flight.carrier, flight.number, date);
    if (!points) return json({ error: 'not-found' }, 404, 'public, max-age=3600');
    return json(
      { carrier: flight.carrier, number: flight.number, date, provider: 'aeroapi', points },
      200,
      'public, max-age=86400',
    );
  } catch (err) {
    return json({ error: 'failed', detail: String(err) }, 502);
  }
};

export const config: Config = { path: '/api/flight' };
