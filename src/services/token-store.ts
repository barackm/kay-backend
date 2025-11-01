import type {
  StoredToken,
  AccessibleResource,
  AtlassianUser,
} from "../types/oauth.js";

interface TokenStore {
  [accountId: string]: StoredToken;
}

const tokenStore: TokenStore = {};

export function storeTokens(
  accountId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  user: AtlassianUser,
  resources: AccessibleResource[]
): void {
  tokenStore[accountId] = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + expiresIn * 1000,
    account_id: accountId,
    resources,
    user,
  };
}

export function getTokens(accountId: string): StoredToken | undefined {
  return tokenStore[accountId];
}

export function getAllTokens(): StoredToken[] {
  return Object.values(tokenStore);
}

export function deleteTokens(accountId: string): void {
  delete tokenStore[accountId];
}
