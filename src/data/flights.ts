// Flight lookup through the site's own function, mapped onto the plan's inputs.
import { DateTime } from 'luxon';
import { type Airport, findAirport, loadAirports } from './airports.ts';

export interface FlightPoint {
  code: string;
  // City and zone from the lookup service, used when the airport is not in our own list.
  city?: string;
  tz?: string;
  departure?: string;
  arrival?: string;
  // UTC instants from providers that do not give local times.
  departureUtc?: string;
  arrivalUtc?: string;
}

export interface FlightLookup {
  carrier: string;
  number: string;
  date: string;
  provider?: string;
  points: FlightPoint[];
}

export interface FlightResult {
  from: Airport;
  to: Airport;
  // Local wall clock times, ISO without offset.
  depart: string;
  arrive: string;
  stops: string[];
}

export type LookupError =
  'unavailable' | 'bad-request' | 'not-found' | 'failed' | 'unknown-airport' | 'rate-limited' | 'quota' | 'forbidden';

export class FlightLookupError extends Error {
  readonly code: LookupError;
  constructor(code: LookupError) {
    super(code);
    this.code = code;
  }
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

// An airport from our list, or one built from what the lookup service said about it.
function resolve(point: FlightPoint, airports: Airport[]): Airport | undefined {
  const known = findAirport(airports, point.code);
  if (known) return known;
  if (!point.tz) return undefined;
  const city = point.city || point.code;
  return { code: point.code.toUpperCase(), city, name: city, tz: point.tz, country: '', large: false };
}

// The journey runs from the first departure to the last arrival; intermediate points are stops.
export function mapLookup(lookup: FlightLookup, airports: Airport[]): FlightResult {
  const points = lookup.points;
  const first = points[0];
  const last = points[points.length - 1];
  const from = first && resolve(first, airports);
  const to = last && resolve(last, airports);
  // A UTC instant becomes the wall clock at that airport.
  const wall = (localTime: string | undefined, utc: string | undefined, airport: Airport | undefined) => {
    if (localTime) return localTime;
    if (!utc || !airport) return undefined;
    const t = DateTime.fromISO(utc, { zone: airport.tz });
    return t.isValid ? t.toFormat("yyyy-MM-dd'T'HH:mm") : undefined;
  };
  const depart = wall(first?.departure, first?.departureUtc, from);
  const arrive = wall(last?.arrival, last?.arrivalUtc, to);
  if (!from || !to || !depart || !arrive) throw new FlightLookupError('unknown-airport');
  return {
    from,
    to,
    depart,
    arrive,
    stops: points.slice(1, -1).map((p) => p.code),
  };
}

export async function lookupFlight(number: string, date: string): Promise<FlightResult> {
  const parsed = parseFlightNumber(number);
  if (!parsed) throw new FlightLookupError('bad-request');
  const q = new URLSearchParams({ number: `${parsed.carrier}${parsed.number}`, date });
  const res = await fetch(`/api/flight?${q}`);
  if (!res.ok) {
    let code: LookupError = 'failed';
    try {
      code = ((await res.json()) as { error?: LookupError }).error ?? 'failed';
    } catch {
      // Not JSON, keep the generic code.
    }
    throw new FlightLookupError(code);
  }
  const lookup = (await res.json()) as FlightLookup;
  return mapLookup(lookup, await loadAirports());
}
