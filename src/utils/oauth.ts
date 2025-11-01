import { ENV } from "../config/env.js";
import crypto from "crypto";

export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function buildAuthorizationUrl(state: string): string {
  const scopes = [
    "read:me",
    "read:jira-work",
    "read:jira-user",
    "offline_access",
  ].join(" ");

  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: ENV.ATLASSIAN_CLIENT_ID,
    scope: scopes,
    redirect_uri: ENV.ATLASSIAN_REDIRECT_URI,
    state,
    response_type: "code",
    prompt: "consent",
  });

  return `https://auth.atlassian.com/authorize?${params.toString()}`;
}
