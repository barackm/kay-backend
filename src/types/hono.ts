import type { UserContext } from "./auth.js";
import type { StoredToken } from "./oauth.js";

declare module "hono" {
  interface ContextVariableMap {
    user: UserContext;
    account_id: string;
    atlassian_tokens: StoredToken;
    session_token: string;
  }
}
