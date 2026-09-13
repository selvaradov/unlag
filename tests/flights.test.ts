import { describe, expect, it } from 'vitest';
import rows from '../src/data/airports.json';
import type { Airport } from '../src/data/airports.ts';
import { FlightLookupError, mapLookup, parseFlightNumber } from '../src/data/flights.ts';

const list: Airport[] = (rows as [string, string, string, string, string, number][]).map(
  ([code, city, name, tz, country, large]) => ({ code, city, name: name || city, tz, country, large: large === 1 }),
);

describe('flight numbers', () => {
  it('accepts the usual spellings', () => {
    expect(parseFlightNumber('UA 900')).toEqual({ carrier: 'UA', number: '900' });
    expect(parseFlightNumber('ua900')).toEqual({ carrier: 'UA', number: '900' });
    expect(parseFlightNumber('BA-0287')).toEqual({ carrier: 'BA', number: '287' });
    expect(parseFlightNumber('U2 8501')).toEqual({ carrier: 'U2', number: '8501' });
  });

  it('rejects things that are not flight numbers', () => {
    expect(parseFlightNumber('London')).toBeNull();
    expect(parseFlightNumber('900')).toBeNull();
    expect(parseFlightNumber('')).toBeNull();
  });
});

describe('lookup mapping', () => {
  it('runs from the first departure to the last arrival and names the stops', () => {
    const r = mapLookup(
      {
        carrier: 'UA',
        number: '900',
        date: '2026-09-16',
        points: [
          { code: 'LHR', departure: '2026-09-16T10:35' },
          { code: 'SFO', arrival: '2026-09-16T13:35' },
        ],
      },
      list,
    );
    expect(r.from.code).toBe('LHR');
    expect(r.to.tz).toBe('America/Los_Angeles');
    expect(r.depart).toBe('2026-09-16T10:35');
    expect(r.arrive).toBe('2026-09-16T13:35');
    expect(r.stops).toEqual([]);
    const via = mapLookup(
      {
        carrier: 'BA',
        number: '1',
        date: '2026-09-16',
        points: [
          { code: 'LCY', departure: '2026-09-16T09:00' },
          { code: 'SNN', arrival: '2026-09-16T10:15', departure: '2026-09-16T11:00' },
          { code: 'JFK', arrival: '2026-09-16T13:30' },
        ],
      },
      list,
    );
    expect(via.stops).toEqual(['SNN']);
  });

  it('accepts an airport outside the list when the service supplies its zone', () => {
    const r = mapLookup(
      {
        carrier: 'XX',
        number: '1',
        date: '2026-01-01',
        points: [
          { code: 'ZZZ', city: 'Somewhere', tz: 'Europe/Paris', departure: '2026-01-01T10:00' },
          { code: 'SFO', arrival: '2026-01-01T12:00' },
        ],
      },
      list,
    );
    expect(r.from.city).toBe('Somewhere');
    expect(r.from.tz).toBe('Europe/Paris');
  });

  it('fails clearly when an airport is not in the list', () => {
    expect(() =>
      mapLookup(
        {
          carrier: 'XX',
          number: '1',
          date: '2026-01-01',
          points: [
            { code: 'ZZZ', departure: '2026-01-01T10:00' },
            { code: 'SFO', arrival: '2026-01-01T12:00' },
          ],
        },
        list,
      ),
    ).toThrow(FlightLookupError);
  });
});
