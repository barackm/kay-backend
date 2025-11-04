import { ENV } from "../../config/env.js";
import type {
  AtlassianTokenResponse,
  AtlassianUser,
  AccessibleResource,
  BitbucketTokenResponse,
  BitbucketUser,
} from "../../types/oauth.js";

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
      redirect_uri: ENV.ATLASSIAN_CALLBACK_URL,
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

  const resources = await response.json();
  return resources;
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

  const mergedResources = new Map<string, AccessibleResource>();

  for (const resource of resources) {
    const existing = mergedResources.get(resource.id);
    if (existing) {
      const mergedScopes = new Set([...existing.scopes, ...resource.scopes]);
      mergedResources.set(resource.id, {
        ...existing,
        scopes: Array.from(mergedScopes),
      });
    } else {
      mergedResources.set(resource.id, resource);
    }
  }

  const finalResources = Array.from(mergedResources.values());

  return {
    tokens,
    user,
    resources: finalResources,
  };
}

async function exchangeBitbucketCodeForTokens(
  code: string,
  callbackUrl: string
): Promise<BitbucketTokenResponse> {
  const credentials = Buffer.from(
    `${ENV.BITBUCKET_CLIENT_ID}:${ENV.BITBUCKET_CLIENT_SECRET}`
  ).toString("base64");

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
  });

  const response = await fetch(
    "https://bitbucket.org/site/oauth2/access_token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to exchange Bitbucket code for tokens: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
}

async function fetchBitbucketUser(accessToken: string): Promise<BitbucketUser> {
  const response = await fetch("https://api.bitbucket.org/2.0/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch Bitbucket user: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
}

export async function handleBitbucketCallback(
  code: string,
  callbackUrl: string
): Promise<{
  tokens: BitbucketTokenResponse;
  user: BitbucketUser;
}> {
  const tokens = await exchangeBitbucketCodeForTokens(code, callbackUrl);
  const user = await fetchBitbucketUser(tokens.access_token);

  return {
    tokens,
    user,
  };
}
