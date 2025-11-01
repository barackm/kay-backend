import { ENV } from "../config/env.js";
import type {
  AtlassianTokenResponse,
  AtlassianUser,
  AccessibleResource,
} from "../types/oauth.js";

async function exchangeCodeForTokens(
  code: string
): Promise<AtlassianTokenResponse> {
  const response = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: ENV.ATLASSIAN_CLIENT_ID,
      client_secret: ENV.ATLASSIAN_CLIENT_SECRET,
      code,
      redirect_uri: ENV.ATLASSIAN_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to exchange code for tokens: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
}

async function fetchAtlassianUser(accessToken: string): Promise<AtlassianUser> {
  const response = await fetch("https://api.atlassian.com/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch Atlassian user: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
}

async function fetchAccessibleResources(
  accessToken: string
): Promise<AccessibleResource[]> {
  const response = await fetch(
    "https://api.atlassian.com/oauth/token/accessible-resources",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch accessible resources: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
}

export async function handleOAuthCallback(code: string): Promise<{
  tokens: AtlassianTokenResponse;
  user: AtlassianUser;
  resources: AccessibleResource[];
}> {
  const tokens = await exchangeCodeForTokens(code);
  const [user, resources] = await Promise.all([
    fetchAtlassianUser(tokens.access_token),
    fetchAccessibleResources(tokens.access_token),
  ]);

  return {
    tokens,
    user,
    resources,
  };
}
