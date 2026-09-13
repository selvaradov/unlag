// Large airports with scheduled service: code, city, name, IANA zone, country. Loaded on demand.
export interface Airport {
  code: string;
  city: string;
  name: string;
  tz: string;
  country: string;
  large: boolean;
}

type Row = [string, string, string, string, string, number];

let cache: Airport[] | null = null;

// The list once loaded, or null before then.
export function airportsNow(): Airport[] | null {
  return cache;
}

export async function loadAirports(): Promise<Airport[]> {
  if (cache) return cache;
  const rows = (await import('./airports.json')).default as Row[];
  cache = rows.map(([code, city, name, tz, country, large]) => ({
    code,
    city,
    name: name || city,
    tz,
    country,
    large: large === 1,
  }));
  return cache;
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function initials(s: string): string {
  return s
    .split(/[\s-]+/)
    .map((w) => w[0] ?? '')
    .join('');
}

// Ranks airports for a query: exact code, then code prefix, city prefix, city initials, then any word.
export function searchAirports(list: Airport[], query: string, limit = 8): Airport[] {
  const q = norm(query.trim());
  if (!q) return [];
  const scored: { a: Airport; s: number }[] = [];
  for (const a of list) {
    const code = a.code.toLowerCase();
    const city = norm(a.city);
    const name = norm(a.name);
    // Best of the rules that apply, so a city's initials beat a bare code prefix.
    const rules = [
      code === q ? 100 : 0,
      // A two letter query is more likely a city's initials than the start of a code.
      code.startsWith(q) ? (q.length >= 3 ? 80 : 60) : 0,
      city.startsWith(q) ? 70 : 0,
      initials(city) === q ? 65 : 0,
      city.split(/\s+/).some((w) => w.startsWith(q)) ? 55 : 0,
      name.split(/\s+/).some((w) => w.startsWith(q)) ? 45 : 0,
      city.includes(q) || name.includes(q) ? 30 : 0,
    ];
    // Big airports edge out small ones on an equal match.
    const s = Math.max(...rules) + (a.large ? 2 : 0);
    if (s > 0) scored.push({ a, s });
  }
  scored.sort((x, y) => y.s - x.s || x.a.city.localeCompare(y.a.city));
  return scored.slice(0, limit).map((x) => x.a);
}

export function findAirport(list: Airport[], code: string): Airport | undefined {
  const c = code.toUpperCase();
  return list.find((a) => a.code === c);
}
