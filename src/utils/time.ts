export function parseDurationToMs(duration: string): number {
  const unit = duration.slice(-1);
  const value = Number.parseInt(duration.slice(0, -1), 10);

  if (Number.isNaN(value)) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  const multiplier = multipliers[unit];
  if (!multiplier) {
    throw new Error(`Unsupported duration unit: ${unit}`);
  }

  return value * multiplier;
}
