import db from "../database/database.js";

const STATE_EXPIRY_MS = 10 * 60 * 1000;

export function storeState(
  state: string,
  kaySessionId?: string,
  serviceName?: string
): void {
  const now = Date.now();
  const expiresAt = now + STATE_EXPIRY_MS;

  db.prepare(
    `INSERT OR REPLACE INTO oauth_states (state, kay_session_id, service_name, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(state, kaySessionId || null, serviceName || null, now, expiresAt);
}

export function getStateKaySessionId(state: string): string | undefined {
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT kay_session_id, expires_at FROM oauth_states WHERE state = ?`
    )
    .get(state) as { kay_session_id: string | null; expires_at: number } | undefined;

  if (!row) {
    console.log("[getStateKaySessionId] State not found in database:", state);
    return undefined;
  }

  if (now >= row.expires_at) {
    console.log("[getStateKaySessionId] State expired. Now:", now, "Expires:", row.expires_at);
    return undefined;
  }

  console.log("[getStateKaySessionId] Found state with kay_session_id:", row.kay_session_id);
  return row.kay_session_id || undefined;
}

export function getStateServiceName(state: string): string | undefined {
  const row = db
    .prepare(
      `SELECT service_name FROM oauth_states WHERE state = ? AND expires_at > ?`
    )
    .get(state, Date.now()) as { service_name: string | null } | undefined;

  return row?.service_name || undefined;
}

export function validateState(state: string): boolean {
  const row = db
    .prepare(`SELECT expires_at FROM oauth_states WHERE state = ?`)
    .get(state) as { expires_at: number } | undefined;

  if (!row) {
    return false;
  }

  return Date.now() < row.expires_at;
}

export function removeState(state: string): void {
  db.prepare(`DELETE FROM oauth_states WHERE state = ?`).run(state);
}

export function completeState(state: string, accountId: string): void {
  db.prepare(`UPDATE oauth_states SET account_id = ? WHERE state = ?`).run(
    accountId,
    state
  );
}

export function getStateAccountId(state: string): string | undefined {
  const row = db
    .prepare(
      `SELECT account_id FROM oauth_states WHERE state = ? AND expires_at > ?`
    )
    .get(state, Date.now()) as { account_id: string | null } | undefined;

  return row?.account_id || undefined;
}

export function isStateComplete(state: string): boolean {
  const row = db
    .prepare(
      `SELECT account_id FROM oauth_states WHERE state = ? AND expires_at > ?`
    )
    .get(state, Date.now()) as { account_id: string | null } | undefined;

  return !!row?.account_id;
}

export function cleanupExpiredStates(): void {
  db.prepare(`DELETE FROM oauth_states WHERE expires_at < ?`).run(Date.now());
}

setInterval(cleanupExpiredStates, 5 * 60 * 1000);
