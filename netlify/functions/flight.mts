// Looks up a flight's scheduled times by carrier, number and date through Amadeus, so the
// API key never reaches the browser. GET /api/flight?number=UA900&date=2026-09-16
import type { Config } from '@netlify/functions';

const HOSTS = { test: 'https://test.api.amadeus.com', production: 'https://api.amadeus.com' };

interface Point {
  code: string;
  departure?: string;
  arrival?: string;
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

// Amadeus returns wall clock times with an offset; the plan wants the wall clock alone.
function local(value: string | undefined): string | undefined {
  return value?.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/)?.[1];
}

async function token(host: string, id: string, secret: string): Promise<string> {
  const res = await fetch(`${host}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export default async (req: Request): Promise<Response> => {
  const id = process.env.AMADEUS_CLIENT_ID;
  const secret = process.env.AMADEUS_CLIENT_SECRET;
  const host = HOSTS[(process.env.AMADEUS_ENV as keyof typeof HOSTS) ?? 'test'] ?? HOSTS.test;
  if (!id || !secret) return json({ error: 'unavailable' }, 503);

  const url = new URL(req.url);
  const flight = parseFlightNumber(url.searchParams.get('number') ?? '');
  const date = url.searchParams.get('date') ?? '';
  if (!flight || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'bad-request' }, 400);

  try {
    const access = await token(host, id, secret);
    const q = new URLSearchParams({
      carrierCode: flight.carrier,
      flightNumber: flight.number,
      scheduledDepartureDate: date,
    });
    const res = await fetch(`${host}/v2/schedule/flights?${q}`, { headers: { authorization: `Bearer ${access}` } });
    if (!res.ok) return json({ error: 'upstream', status: res.status }, 502);
    const data = (await res.json()) as {
      data?: {
        flightPoints?: {
          iataCode: string;
          departure?: { timings?: { qualifier: string; value: string }[] };
          arrival?: { timings?: { qualifier: string; value: string }[] };
        }[];
      }[];
    };
    const first = data.data?.[0];
    if (!first?.flightPoints?.length) return json({ error: 'not-found' }, 404);
    const points: Point[] = first.flightPoints.map((p) => ({
      code: p.iataCode,
      departure: local(p.departure?.timings?.find((t) => t.qualifier === 'STD')?.value),
      arrival: local(p.arrival?.timings?.find((t) => t.qualifier === 'STA')?.value),
    }));
    return json({ carrier: flight.carrier, number: flight.number, date, points }, 200, 'public, max-age=86400');
  } catch (err) {
    return json({ error: 'failed', detail: String(err) }, 502);
  }
};

export const config: Config = { path: '/api/flight' };
