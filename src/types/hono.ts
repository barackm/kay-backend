import type { UserContext } from "./auth.js";
import type { StoredToken } from "./oauth.js";

declare module "hono" {
  interface ContextVariableMap {
    user: UserContext;
    account_id: string;
    atlassian_tokens: StoredToken;
    session_token: string;
    jira_projects?: Array<{ key: string; name: string }>;
    confluence_spaces?: Array<{ key: string; name: string }>;
  }
}
