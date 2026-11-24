import { BadRequestException } from '@nestjs/common';

export function assertValidIanaTimezone(timezone: string): void {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    throw new BadRequestException('Invalid timezone');
  }
}

export function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function isPast(date: Date, now = new Date()): boolean {
  return date.getTime() <= now.getTime();
}

export function parseHHmm(value: string): { hour: number; minute: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) throw new BadRequestException('Invalid time format, expected HH:mm');
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function minutesOfDay(h: number, m: number): number {
  return h * 60 + m;
}

export function getZonedParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === '24' ? '00' : map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  for (let i = 0; i < 3; i++) {
    const p = getZonedParts(utc, timeZone);
    const asUtc = Date.UTC(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      p.second,
      0,
    );
    const wantUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const diff = wantUtc - asUtc;
    if (diff === 0) break;
    utc = new Date(utc.getTime() + diff);
  }
  return utc;
}

export function addDaysYmd(y: number, m: number, d: number, days: number) {
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0, 0));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

export function weekdayInZone(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  const dt = new Date(Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0));
  return dt.getUTCDay();
}
