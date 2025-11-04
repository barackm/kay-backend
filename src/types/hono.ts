import type { CliSessionPayload } from "./auth.js";

declare module "hono" {
  interface ContextVariableMap {
    account_id: string | null; // legacy, no longer set
    session_id?: string; // new canonical identifier for Kay session
    session_token: string;
    session_payload?: CliSessionPayload;
  }
}
