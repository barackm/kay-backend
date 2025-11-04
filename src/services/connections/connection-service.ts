import { prisma } from "../../db/client.js";
import type {
  Connection,
  ConnectionMetadata,
  ConnectionStatus,
  ServiceConnectionInfo,
} from "../../types/connections.js";
import { ServiceName } from "../../types/connections.js";
import { handleOAuthCallback } from "../oauth/oauth.js";
import type { StoredToken } from "../../types/oauth.js";
import { ENV } from "../../config/env.js";

export async function getKaySessionById(kaySessionId: string): Promise<{
  id: string;
} | null> {
  const kaySession = await prisma.kaySession.findUnique({
    where: { id: kaySessionId },
    select: { id: true },
  });

  return kaySession;
}

export async function createKaySession(deviceInfo?: string): Promise<string> {
  const kaySessionId = `kaysession_${Date.now()}_${Math.random()
    .toString(36)
    .substring(7)}`;

  const kaySession = await prisma.kaySession.create({
    data: {
      id: kaySessionId,
      deviceInfo: deviceInfo || null,
    },
  });

  return kaySession.id;
}

export async function storeConnection(
  kaySessionId: string,
  serviceName: ServiceName,
  accessToken: string,
  refreshToken: string | undefined,
  expiresAt: number | undefined,
  metadata: ConnectionMetadata
): Promise<Connection> {
  const expiresAtDate = expiresAt ? new Date(expiresAt) : null;
  const connectionId = `conn_${Date.now()}_${Math.random()
    .toString(36)
    .substring(7)}`;

  const connection = await prisma.connection.upsert({
    where: {
      kaySessionId_serviceName: {
        kaySessionId,
        serviceName,
      },
    },
    create: {
      id: connectionId,
      kaySessionId,
      serviceName,
      accessToken,
      refreshToken: refreshToken || null,
      expiresAt: expiresAtDate,
      metadata: metadata as any,
      status: "active",
    },
    update: {
      accessToken,
      refreshToken: refreshToken || null,
      expiresAt: expiresAtDate,
      metadata: metadata as any,
      status: "active",
      updatedAt: new Date(),
    },
  });

  const result: Connection = {
    id: connection.id,
    kay_session_id: connection.kaySessionId,
    service_name: connection.serviceName as ServiceName,
    access_token: connection.accessToken,
    metadata: connection.metadata as ConnectionMetadata,
    created_at: connection.createdAt.getTime(),
    updated_at: connection.updatedAt.getTime(),
  };

  if (connection.refreshToken) {
    result.refresh_token = connection.refreshToken;
  }

  if (connection.expiresAt) {
    result.expires_at = connection.expiresAt.getTime();
  }

  return result;
}

export async function getConnection(
  kaySessionId: string,
  serviceName: ServiceName
): Promise<Connection | undefined> {
  const connection = await prisma.connection.findUnique({
    where: {
      kaySessionId_serviceName: {
        kaySessionId,
        serviceName,
      },
    },
  });

  if (!connection) {
    return undefined;
  }

  const result: Connection = {
    id: connection.id,
    kay_session_id: connection.kaySessionId,
    service_name: connection.serviceName as ServiceName,
    access_token: connection.accessToken,
    metadata: connection.metadata as ConnectionMetadata,
    created_at: connection.createdAt.getTime(),
    updated_at: connection.updatedAt.getTime(),
  };

  if (connection.refreshToken) {
    result.refresh_token = connection.refreshToken;
  }

  if (connection.expiresAt) {
    result.expires_at = connection.expiresAt.getTime();
  }

  return result;
}

export async function deleteConnection(
  kaySessionId: string,
  serviceName: ServiceName
): Promise<boolean> {
  const result = await prisma.connection.deleteMany({
    where: {
      kaySessionId,
      serviceName,
    },
  });

  return result.count > 0;
}

export async function getConnectionStatus(
  kaySessionId: string
): Promise<ConnectionStatus> {
  const connections = await prisma.connection.findMany({
    where: { kaySessionId },
    select: {
      serviceName: true,
      metadata: true,
    },
  });

  const status: ConnectionStatus = {
    [ServiceName.KYG]: { connected: false },
    [ServiceName.JIRA]: { connected: false },
    [ServiceName.CONFLUENCE]: { connected: false },
    [ServiceName.BITBUCKET]: { connected: false },
  };

  for (const connection of connections) {
    const serviceName = connection.serviceName as ServiceName;
    const metadata = connection.metadata as ConnectionMetadata;

    const serviceInfo: ServiceConnectionInfo = {
      connected: true,
    };

    if (metadata.url || metadata.workspace_id) {
      serviceInfo.metadata = {};
      if (metadata.url) {
        serviceInfo.metadata.url = metadata.url;
      }
      if (metadata.workspace_id) {
        serviceInfo.metadata.workspace_id = metadata.workspace_id;
      }
    }

    if (
      serviceName === ServiceName.JIRA ||
      serviceName === ServiceName.CONFLUENCE
    ) {
      if (metadata.user_data) {
        const userData = metadata.user_data as {
          account_id: string;
          name: string;
          email: string;
          picture: string;
          account_type: string;
          account_status: string;
        };
        serviceInfo.user = {
          account_id: userData.account_id,
          name: userData.name,
          email: userData.email,
          picture: userData.picture,
          account_type: userData.account_type,
          account_status: userData.account_status,
        };
      }
    } else if (serviceName === ServiceName.BITBUCKET) {
      const user: ServiceConnectionInfo["user"] = {};
      if (metadata.account_id) user.account_id = metadata.account_id as string;
      if (metadata.username) user.username = metadata.username as string;
      if (metadata.email) user.email = metadata.email as string;
      if (metadata.display_name) {
        user.display_name = metadata.display_name as string;
        user.name = metadata.display_name as string;
      }
      if (metadata.avatar_url) user.avatar_url = metadata.avatar_url as string;
      if (Object.keys(user).length > 0) {
        serviceInfo.user = user;
      }
    } else if (serviceName === ServiceName.KYG) {
      const user: ServiceConnectionInfo["user"] = {};
      if (metadata.account_id) user.account_id = metadata.account_id as string;
      if (metadata.email) user.email = metadata.email as string;
      const fullName = `${metadata.first_name || ""} ${
        metadata.last_name || ""
      }`.trim();
      if (fullName) user.name = fullName;
      if (metadata.first_name) user.first_name = metadata.first_name as string;
      if (metadata.last_name) user.last_name = metadata.last_name as string;
      if (metadata.user_id) user.user_id = metadata.user_id as number;
      if (metadata.company_id) user.company_id = metadata.company_id as number;
      if (metadata.company_name)
        user.company_name = metadata.company_name as string;
      if (Object.keys(user).length > 0) {
        serviceInfo.user = user;
      }
    }

    status[serviceName] = serviceInfo;
  }

  return status;
}

// ... existing code for OAuth flows ...
export async function connectAtlassianService(
  kaySessionId: string,
  code: string,
  state: string
): Promise<{
  connection: Connection;
  accountId: string;
}> {
  const kaySession = await getKaySessionById(kaySessionId);
  if (!kaySession) {
    throw new Error("Invalid kay_session_id");
  }

  try {
    // Get service name from state
    const { getStateServiceName } = await import("./state-store.js");
    const serviceName = (await getStateServiceName(state)) as ServiceName;
    if (
      !serviceName ||
      (serviceName !== ServiceName.JIRA &&
        serviceName !== ServiceName.CONFLUENCE)
    ) {
      throw new Error("Invalid service name from state");
    }

    const result = await handleOAuthCallback(code);

    const accountId = result.user.account_id;
    const accessToken = result.tokens.access_token;
    const refreshToken = result.tokens.refresh_token || "";
    const expiresIn = result.tokens.expires_in;
    const expiresAt = Date.now() + expiresIn * 1000;

    const metadata: ConnectionMetadata = {
      account_id: accountId,
      user_data: result.user,
    };

    if (result.resources[0]?.url) {
      metadata.url = result.resources[0].url;
    }

    if (result.resources[0]?.id) {
      metadata.workspace_id = result.resources[0].id;
    }

    const connection = await storeConnection(
      kaySessionId,
      serviceName,
      accessToken,
      refreshToken,
      expiresAt,
      metadata
    );

    if (serviceName === ServiceName.JIRA) {
      await storeConnection(
        kaySessionId,
        ServiceName.CONFLUENCE,
        accessToken,
        refreshToken,
        expiresAt,
        metadata
      );
    } else if (serviceName === ServiceName.CONFLUENCE) {
      await storeConnection(
        kaySessionId,
        ServiceName.JIRA,
        accessToken,
        refreshToken,
        expiresAt,
        metadata
      );
    }

    return {
      connection,
      accountId,
    };
  } catch (error) {
    throw error;
  }
}

export async function connectBitbucketService(
  kaySessionId: string,
  email: string,
  apiToken: string
): Promise<{
  connection: Connection;
  accountId: string;
}> {
  const kaySession = await getKaySessionById(kaySessionId);
  if (!kaySession) {
    throw new Error("Invalid kay_session_id");
  }

  const existingConnection = await getConnection(
    kaySessionId,
    ServiceName.BITBUCKET
  );

  let user;
  try {
    user = await verifyBitbucketCredentials(email, apiToken);
  } catch (error) {
    if (existingConnection) {
      await deleteConnection(kaySessionId, ServiceName.BITBUCKET);
    }
    throw error;
  }

  const accountId = `bitbucket_${user.uuid}`;

  const credentials = Buffer.from(`${email}:${apiToken}`).toString("base64");

  const metadata: ConnectionMetadata = {
    account_id: accountId,
    uuid: user.uuid,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    email: user.email,
    user_data: user,
  };

  const connection = await storeConnection(
    kaySessionId,
    ServiceName.BITBUCKET,
    credentials,
    undefined,
    undefined,
    metadata
  );

  return {
    connection,
    accountId,
  };
}

async function verifyBitbucketCredentials(
  email: string,
  apiToken: string
): Promise<{
  uuid: string;
  username: string;
  display_name: string;
  email: string;
  avatar_url: string;
}> {
  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
  const response = await fetch("https://api.bitbucket.org/2.0/user", {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Bitbucket API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const user = await response.json();
  return {
    uuid: user.uuid,
    username: user.username,
    display_name: user.display_name || user.username,
    email: user.email || email,
    avatar_url: user.links?.avatar?.href || "",
  };
}

export async function connectKygService(
  kaySessionId: string,
  apiKey?: string,
  email?: string,
  password?: string
): Promise<{
  connection: Connection;
  accountId: string;
}> {
  const kaySession = await getKaySessionById(kaySessionId);
  if (!kaySession) {
    throw new Error("Invalid kay_session_id");
  }

  if (!apiKey && email && password) {
    const loginResponse = await fetch(
      `${ENV.KYG_CORE_BASE_URL}/authentication/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      }
    );

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      throw new Error(
        `KYG login failed: ${loginResponse.status} ${loginResponse.statusText} - ${errorText}`
      );
    }

    const loginData = await loginResponse.json();
    const token =
      loginData.token || loginData.api_key || loginData.access_token;
    const userData = loginData.user || loginData;

    if (!token) {
      throw new Error("KYG login response did not contain an API key/token");
    }

    if (!userData) {
      throw new Error("KYG login response did not contain user data");
    }

    const accountId = `kyg_${userData.user_id}`;

    const metadata: ConnectionMetadata = {
      account_id: accountId,
      user_id: userData.user_id,
      email: userData.email,
      first_name: userData.first_name,
      last_name: userData.last_name,
      company_id: userData.company_id,
      company_name: userData.company_name,
      user_data: userData,
    };

    const connection = await storeConnection(
      kaySessionId,
      ServiceName.KYG,
      token,
      undefined,
      undefined,
      metadata
    );

    return {
      connection,
      accountId,
    };
  }

  if (!apiKey) {
    throw new Error("KYG requires either api_key or email/password");
  }

  try {
    const response = await fetch(
      `${ENV.KYG_CORE_BASE_URL}/api/v1/auth/verify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `KYG API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const userData = await response.json();

    const accountId = `kyg_${userData.user_id}`;

    const metadata: ConnectionMetadata = {
      account_id: accountId,
      user_id: userData.user_id,
      email: userData.email,
      first_name: userData.first_name,
      last_name: userData.last_name,
      company_id: userData.company_id,
      company_name: userData.company_name,
      user_data: userData,
    };

    const connection = await storeConnection(
      kaySessionId,
      ServiceName.KYG,
      apiKey,
      undefined,
      undefined,
      metadata
    );

    return {
      connection,
      accountId,
    };
  } catch (error) {
    throw error;
  }
}

export function getAtlassianTokensFromConnection(
  connection: Connection
): StoredToken | null {
  const metadata = connection.metadata;
  const accountId = metadata.account_id as string | undefined;

  if (!accountId) {
    return null;
  }

  // Tokens are stored in Connection, not in a separate table
  // Return null as we need to refactor this to extract from connection metadata
  return null;
}
