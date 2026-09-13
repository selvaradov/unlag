import { describe, expect, it } from 'vitest';
import { HOUR, atClock, intersect, subtract } from '../src/algorithm/time.ts';

describe('interval arithmetic', () => {
  it('intersects overlapping intervals and rejects disjoint ones', () => {
    expect(intersect({ start: 0, end: 10 }, { start: 5, end: 20 })).toEqual({ start: 5, end: 10 });
    expect(intersect({ start: 0, end: 10 }, { start: 10, end: 20 })).toBeNull();
  });

  it('subtracts cuts leaving the remaining pieces in order', () => {
    const pieces = subtract({ start: 0, end: 100 }, [
      { start: 20, end: 30 },
      { start: 50, end: 60 },
      { start: 90, end: 120 },
    ]);
    expect(pieces).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 50 },
      { start: 60, end: 90 },
    ]);
  });

  it('places a clock time on a local date, honouring the zone offset', () => {
    const london = atClock('2026-09-16', '10:35', 'Europe/London');
    const utc = atClock('2026-09-16', '09:35', 'UTC');
    expect(london).toBe(utc);
    const sf = atClock('2026-09-16', '13:35', 'America/Los_Angeles');
    expect((sf - london) / HOUR).toBe(11);
  });
});
