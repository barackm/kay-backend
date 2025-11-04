import { ENV } from "../../config/env.js";
import type { ServiceName } from "../../types/connections.js";
import { getOAuthProvider } from "../connections/service-registry.js";
import crypto from "crypto";

export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("hex");
}

function buildAtlassianAuthorizationUrl(
  state: string,
  callbackUrl: string
): string {
  const scopes = [
    "read:me",
    "read:jira-work",
    "read:jira-user",
    "write:jira-work",
    "read:confluence-content.all",
    "write:confluence-content",
    "read:confluence-space.summary",
    "read:confluence-props",
    "read:confluence-content.summary",
    "read:confluence-user",
    "search:confluence",
    "offline_access",
  ].join(" ");

  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: ENV.ATLASSIAN_CLIENT_ID,
    scope: scopes,
    redirect_uri: callbackUrl,
    state,
    response_type: "code",
    prompt: "consent",
  });

  return `https://auth.atlassian.com/authorize?${params.toString()}`;
}

function buildBitbucketAuthorizationUrl(
  state: string,
  callbackUrl: string
): string {
  const params = new URLSearchParams({
    client_id: ENV.BITBUCKET_CLIENT_ID,
    response_type: "code",
    redirect_uri: callbackUrl,
    state,
  });

  return `https://bitbucket.org/site/oauth2/authorize?${params.toString()}`;
}

export function buildServiceAuthorizationUrl(
  serviceName: ServiceName,
  state: string
): string {
  const provider = getOAuthProvider(serviceName);

  if (!provider) {
    throw new Error(`Service ${serviceName} does not support OAuth`);
  }

  let callbackUrl: string;

  switch (provider) {
    case "atlassian":
      callbackUrl = `${ENV.ATLASSIAN_CALLBACK_URL}?service=${serviceName}`;
      return buildAtlassianAuthorizationUrl(state, callbackUrl);
    case "bitbucket":
      callbackUrl = `${ENV.BITBUCKET_CALLBACK_URL}?service=${serviceName}`;
      return buildBitbucketAuthorizationUrl(state, callbackUrl);
    default:
      throw new Error(`OAuth provider ${provider} not supported`);
  }
}
