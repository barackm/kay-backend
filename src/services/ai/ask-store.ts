import db from "../database/database.js";
import type { AskServiceContext } from "./ask-service.js";

const CONFIRMATION_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export interface InteractiveSession {
  session_id: string;
  account_id: string;
  context: AskServiceContext;
  history: Array<{ role: string; content: string }>;
  createdAt: number;
  updatedAt: number;
}

export interface PendingConfirmation {
  confirmation_token: string;
  account_id: string;
  context: AskServiceContext;
  expiresAt: number;
  createdAt: number;
}

export function storeInteractiveSession(
  sessionId: string,
  accountId: string,
  context: AskServiceContext,
  history: Array<{ role: string; content: string }> = []
): void {
  const now = Date.now();
  db.prepare(
    `INSERT OR REPLACE INTO interactive_sessions 
     (session_id, account_id, context_data, history, created_at, updated_at)
     VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM interactive_sessions WHERE session_id = ?), ?), ?)`
  ).run(
    sessionId,
    accountId,
    JSON.stringify(context),
    JSON.stringify(history),
    sessionId,
    now,
    now
  );
}

export function getInteractiveSession(
  sessionId: string
): InteractiveSession | undefined {
  const row = db
    .prepare(
      `SELECT session_id, account_id, context_data, history, created_at, updated_at
       FROM interactive_sessions WHERE session_id = ?`
    )
    .get(sessionId) as
    | {
        session_id: string;
        account_id: string;
        context_data: string;
        history: string;
        created_at: number;
        updated_at: number;
      }
    | undefined;

  if (!row) return undefined;

  try {
    return {
      session_id: row.session_id,
      account_id: row.account_id,
      context: JSON.parse(row.context_data) as AskServiceContext,
      history: JSON.parse(row.history) as Array<{
        role: string;
        content: string;
      }>,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    return undefined;
  }
}

export function updateInteractiveSessionHistory(
  sessionId: string,
  history: Array<{ role: string; content: string }>
): void {
  db.prepare(
    `UPDATE interactive_sessions SET history = ?, updated_at = ? WHERE session_id = ?`
  ).run(JSON.stringify(history), Date.now(), sessionId);
}

export function deleteInteractiveSession(sessionId: string): void {
  db.prepare(`DELETE FROM interactive_sessions WHERE session_id = ?`).run(
    sessionId
  );
}

export function storePendingConfirmation(
  token: string,
  accountId: string,
  context: AskServiceContext
): void {
  const now = Date.now();
  db.prepare(
    `INSERT OR REPLACE INTO pending_confirmations 
     (confirmation_token, account_id, request_data, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    token,
    accountId,
    JSON.stringify(context),
    now + CONFIRMATION_EXPIRY_MS,
    now
  );
}

export function getPendingConfirmation(
  token: string
): PendingConfirmation | undefined {
  const row = db
    .prepare(
      `SELECT confirmation_token, account_id, request_data, expires_at, created_at
       FROM pending_confirmations WHERE confirmation_token = ?`
    )
    .get(token) as
    | {
        confirmation_token: string;
        account_id: string;
        request_data: string;
        expires_at: number;
        created_at: number;
      }
    | undefined;

  if (!row) return undefined;

  // Check if expired
  if (Date.now() > row.expires_at) {
    deletePendingConfirmation(token);
    return undefined;
  }

  try {
    return {
      confirmation_token: row.confirmation_token,
      account_id: row.account_id,
      context: JSON.parse(row.request_data) as AskServiceContext,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  } catch {
    return undefined;
  }
}

export function deletePendingConfirmation(token: string): void {
  db.prepare(
    `DELETE FROM pending_confirmations WHERE confirmation_token = ?`
  ).run(token);
}

export function cleanupExpiredConfirmations(): void {
  const now = Date.now();
  db.prepare(`DELETE FROM pending_confirmations WHERE expires_at < ?`).run(now);
}

export function deleteInteractiveSessionsByAccount(accountId: string): void {
  db.prepare(`DELETE FROM interactive_sessions WHERE account_id = ?`).run(
    accountId
  );
}

// Clean up expired confirmations every 5 minutes
setInterval(cleanupExpiredConfirmations, 5 * 60 * 1000);
