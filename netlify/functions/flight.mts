// Looks up a flight's scheduled legs by number and date through AeroDataBox on RapidAPI,
// so the API key never reaches the browser. GET /api/flight?number=UA900&date=2026-09-16
import type { Config } from '@netlify/functions';

const HOST = 'aerodatabox.p.rapidapi.com';

interface Point {
  code: string;
  city?: string;
  tz?: string;
  departure?: string;
  arrival?: string;
}

interface Movement {
  airport?: { iata?: string; municipalityName?: string; timeZone?: string };
  scheduledTime?: { local?: string; utc?: string };
}

interface Leg {
  number?: string;
  departure?: Movement;
  arrival?: Movement;
  codeshareStatus?: string;
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

export default async (req: Request): Promise<Response> => {
  const key = process.env.AERODATABOX_KEY;
  if (!key) return json({ error: 'unavailable' }, 503);

  const url = new URL(req.url);
  const flight = parseFlightNumber(url.searchParams.get('number') ?? '');
  const date = url.searchParams.get('date') ?? '';
  if (!flight || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'bad-request' }, 400);

  try {
    const path = `/flights/number/${flight.carrier}${flight.number}/${date}?dateLocalRole=Departure&withLocation=false`;
    const res = await fetch(`https://${HOST}${path}`, {
      headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': HOST, accept: 'application/json' },
    });
    if (res.status === 204 || res.status === 404) return json({ error: 'not-found' }, 404);
    if (!res.ok) return json({ error: 'upstream', status: res.status }, 502);
    const legs = (await res.json()) as Leg[];
    const useful = legs
      .filter((l) => l.departure?.airport?.iata && l.arrival?.airport?.iata && l.departure?.scheduledTime?.utc)
      .sort((a, b) => String(a.departure!.scheduledTime!.utc).localeCompare(String(b.departure!.scheduledTime!.utc)));
    if (!useful.length) return json({ error: 'not-found' }, 404);
    // Legs become a chain of points: each leg's arrival is the next leg's departure.
    const points: Point[] = [];
    for (const leg of useful) {
      const dep = leg.departure!;
      const arr = leg.arrival!;
      const last = points[points.length - 1];
      if (last && last.code === dep.airport!.iata) {
        last.departure = local(dep.scheduledTime?.local);
      } else {
        points.push({
          code: dep.airport!.iata!,
          city: dep.airport?.municipalityName,
          tz: dep.airport?.timeZone,
          departure: local(dep.scheduledTime?.local),
        });
      }
      points.push({
        code: arr.airport!.iata!,
        city: arr.airport?.municipalityName,
        tz: arr.airport?.timeZone,
        arrival: local(arr.scheduledTime?.local),
      });
    }
    return json({ carrier: flight.carrier, number: flight.number, date, points }, 200, 'public, max-age=86400');
  } catch (err) {
    return json({ error: 'failed', detail: String(err) }, 502);
  }
};

export const config: Config = { path: '/api/flight' };
