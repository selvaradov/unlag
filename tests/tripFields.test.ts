import { describe, expect, it } from 'vitest';
import { timeOptions, wakeTimesFor } from '../src/ui/tripFields.ts';

describe('timeOptions', () => {
  it('steps by half hours and wraps past midnight', () => {
    expect(timeOptions('22:00', '01:00')).toEqual(['22:00', '22:30', '23:00', '23:30', '00:00', '00:30', '01:00']);
  });
  it('keeps a current value that is off the grid', () => {
    expect(timeOptions('06:00', '07:00', '06:35')).toContain('06:35');
  });
});

describe('wakeTimesFor', () => {
  it('offers wake times between five and eleven hours after bedtime', () => {
    const times = wakeTimesFor('23:00');
    expect(times[0]).toBe('04:00');
    expect(times[times.length - 1]).toBe('10:00');
  });
  it('follows a late bedtime past midnight', () => {
    const times = wakeTimesFor('01:30');
    expect(times[0]).toBe('06:30');
    expect(times[times.length - 1]).toBe('12:30');
  });
});
