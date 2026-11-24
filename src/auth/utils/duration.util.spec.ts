import { parseDurationToMs } from './duration.util';

describe('parseDurationToMs', () => {
  it('parses supported units', () => {
    expect(parseDurationToMs('15m')).toBe(15 * 60 * 1000);
    expect(parseDurationToMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseDurationToMs('1h')).toBe(60 * 60 * 1000);
  });

  it('rejects invalid durations', () => {
    expect(() => parseDurationToMs('1d1h')).toThrow();
    expect(() => parseDurationToMs('0m')).toThrow();
    expect(() => parseDurationToMs('15')).toThrow();
  });
});
