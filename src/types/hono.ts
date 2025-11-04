import type { UserContext } from "./auth.js";
import type { StoredToken } from "./oauth.js";
import type { CliSessionPayload } from "./auth.js";

declare module "hono" {
  interface ContextVariableMap {
    user: UserContext;
    account_id: string | null; // legacy, no longer set
    session_id?: string; // new canonical identifier for Kay session
    atlassian_tokens: StoredToken;
    session_token: string;
    session_payload?: CliSessionPayload;
    jira_projects?: Array<{ key: string; name: string }>;
    confluence_spaces?: Array<{ key: string; name: string }>;
  }
}
