const UNIT_TO_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export function parseDurationToMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value.trim());

  if (!match) {
    throw new Error(
      `Invalid duration "${value}". Use formats like 15m, 7d, 1h.`,
    );
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid duration "${value}".`);
  }

  return amount * UNIT_TO_MS[unit];
}
