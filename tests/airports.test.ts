import { describe, expect, it } from 'vitest';
import rows from '../src/data/airports.json';
import { type Airport, findAirport, searchAirports } from '../src/data/airports.ts';

const list: Airport[] = (rows as [string, string, string, string, string, number][]).map(
  ([code, city, name, tz, country, large]) => ({ code, city, name: name || city, tz, country, large: large === 1 }),
);

describe('airports', () => {
  it('has the airports for the default trip with their zones', () => {
    expect(findAirport(list, 'lhr')?.tz).toBe('Europe/London');
    expect(findAirport(list, 'SFO')?.city).toBe('San Francisco');
  });

  it('finds an airport by code, city, initials and name', () => {
    expect(searchAirports(list, 'sfo')[0].code).toBe('SFO');
    expect(searchAirports(list, 'san fr')[0].code).toBe('SFO');
    expect(searchAirports(list, 'SF').map((a) => a.code)).toContain('SFO');
    expect(searchAirports(list, 'heathrow')[0].code).toBe('LHR');
    expect(searchAirports(list, 'lon').map((a) => a.code)).toContain('LHR');
  });

  it('includes regional airports with scheduled service', () => {
    expect(findAirport(list, 'BRS')?.city).toBe('Bristol');
    expect(findAirport(list, 'EXT')?.city).toBe('Exeter');
  });

  it('prefers code matches over city matches', () => {
    expect(searchAirports(list, 'LON')[0].city).toBe('London');
    expect(searchAirports(list, 'jfk')[0].code).toBe('JFK');
  });
});
