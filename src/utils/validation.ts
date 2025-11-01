import { parseDurationToMs } from "./time.js";

const MAX_REFRESH_TOKEN_DAYS = 30;
const MAX_REFRESH_TOKEN_MS = MAX_REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;

export function validateRefreshTokenExpiration(duration: string): number {
  const ms = parseDurationToMs(duration);

  if (ms > MAX_REFRESH_TOKEN_MS) {
    throw new Error(
      `Refresh token expiration cannot exceed ${MAX_REFRESH_TOKEN_DAYS} days`
    );
  }

  return ms;
}
