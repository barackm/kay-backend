import { BitbucketMCPClient } from "../mcp/bitbucket-client.js";
import { JiraMCPClient } from "../mcp/jira-client.js";
import { ConfluenceMCPClient } from "../mcp/confluence-client.js";
import { getConnection } from "../connections/connection-service.js";
import { ServiceName } from "../../types/connections.js";

type ClientKey =
  | `${string}:bitbucket`
  | `${string}:jira`
  | `${string}:confluence`;

const bitbucketClients = new Map<`${string}:bitbucket`, BitbucketMCPClient>();
const jiraClients = new Map<`${string}:jira`, JiraMCPClient>();
const confluenceClients = new Map<
  `${string}:confluence`,
  ConfluenceMCPClient
>();

export async function getJiraMCPClient(
  kaySessionId: string
): Promise<JiraMCPClient | null> {
  const key: `${string}:jira` = `${kaySessionId}:jira`;
  const existingClient = jiraClients.get(key);

  if (existingClient && existingClient.isReady()) {
    return existingClient;
  }

  const connection = await getConnection(kaySessionId, ServiceName.JIRA);
  if (!connection) {
    return null;
  }

  const metadata = connection.metadata as {
    email?: string;
    user_data?: {
      email?: string;
    };
    base_url?: string;
    url?: string;
  };

  const email = metadata.email || metadata.user_data?.email;
  const apiToken = connection.access_token;

  if (!email || !apiToken) {
    return null;
  }

  let siteName: string | undefined;
  const baseUrl = metadata.base_url || metadata.url;
  if (baseUrl) {
    const match = baseUrl.match(/https?:\/\/([^.]+)\.atlassian\.net/);
    if (match && match[1]) {
      siteName = match[1];
    }
  }

  const client = new JiraMCPClient();

  try {
    await client.initialize(email, apiToken, siteName);
    jiraClients.set(key, client);
    return client;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[MCP Manager] Failed to initialize Jira client:`,
      errorMessage
    );
    return null;
  }
}

export async function getBitbucketMCPClient(
  kaySessionId: string
): Promise<BitbucketMCPClient | null> {
  const key: `${string}:bitbucket` = `${kaySessionId}:bitbucket`;
  const existingClient = bitbucketClients.get(key);

  if (existingClient && existingClient.isReady()) {
    return existingClient;
  }

  const connection = await getConnection(kaySessionId, ServiceName.BITBUCKET);
  if (!connection) {
    return null;
  }

  const metadata = connection.metadata as {
    email?: string;
    user_email?: string;
  };

  let email = metadata.email || metadata.user_email;
  let apiToken = connection.access_token;

  if (!email && apiToken) {
    try {
      const decoded = Buffer.from(apiToken, "base64").toString("utf-8");
      const [decodedEmail, decodedToken] = decoded.split(":");
      if (decodedEmail && decodedToken) {
        email = decodedEmail;
        apiToken = decodedToken;
      }
    } catch {
      // If decoding fails, use the token as-is
    }
  }

  if (!email || !apiToken) {
    return null;
  }

  const client = new BitbucketMCPClient();

  try {
    await client.initialize(email, apiToken);
    bitbucketClients.set(key, client);
    return client;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[MCP Manager] Failed to initialize Bitbucket client:`,
      errorMessage
    );
    return null;
  }
}

export async function getConfluenceMCPClient(
  kaySessionId: string
): Promise<ConfluenceMCPClient | null> {
  const key: `${string}:confluence` = `${kaySessionId}:confluence`;
  const existingClient = confluenceClients.get(key);

  if (existingClient && existingClient.isReady()) {
    return existingClient;
  }

  const connection = await getConnection(kaySessionId, ServiceName.CONFLUENCE);
  if (!connection) {
    return null;
  }

  const metadata = connection.metadata as {
    email?: string;
    user_data?: {
      email?: string;
    };
    base_url?: string;
    url?: string;
  };

  const email = metadata.email || metadata.user_data?.email;
  const apiToken = connection.access_token;

  if (!email || !apiToken) {
    return null;
  }

  let siteName: string | undefined;
  const baseUrl = metadata.base_url || metadata.url;
  if (baseUrl) {
    const match = baseUrl.match(/https?:\/\/([^.]+)\.atlassian\.net/);
    if (match && match[1]) {
      siteName = match[1];
    }
  }

  const client = new ConfluenceMCPClient();

  try {
    await client.initialize(email, apiToken, siteName);
    confluenceClients.set(key, client);
    return client;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[MCP Manager] Failed to initialize Confluence client:`,
      errorMessage
    );
    return null;
  }
}

export async function getAllMCPTools(kaySessionId: string): Promise<
  Array<{
    serverType: "bitbucket" | "jira" | "confluence";
    tools:
      | ReturnType<BitbucketMCPClient["getTools"]>
      | ReturnType<JiraMCPClient["getTools"]>
      | ReturnType<ConfluenceMCPClient["getTools"]>;
  }>
> {
  const results: Array<{
    serverType: "bitbucket" | "jira" | "confluence";
    tools:
      | ReturnType<BitbucketMCPClient["getTools"]>
      | ReturnType<JiraMCPClient["getTools"]>
      | ReturnType<ConfluenceMCPClient["getTools"]>;
  }> = [];

  const bitbucketClient = await getBitbucketMCPClient(kaySessionId);
  if (bitbucketClient && bitbucketClient.isReady()) {
    results.push({
      serverType: "bitbucket",
      tools: bitbucketClient.getTools(),
    });
  }

  const jiraClient = await getJiraMCPClient(kaySessionId);
  if (jiraClient && jiraClient.isReady()) {
    results.push({
      serverType: "jira",
      tools: jiraClient.getTools(),
    });
  }

  const confluenceClient = await getConfluenceMCPClient(kaySessionId);
  if (confluenceClient && confluenceClient.isReady()) {
    results.push({
      serverType: "confluence",
      tools: confluenceClient.getTools(),
    });
  }

  return results;
}

export async function executeMCPTool(
  kaySessionId: string,
  toolName: string,
  arguments_: Record<string, unknown>
): Promise<string> {
  const bitbucketClient = await getBitbucketMCPClient(kaySessionId);
  if (bitbucketClient && bitbucketClient.isReady()) {
    const tools = bitbucketClient.getTools();
    const tool = tools.find((t) => t.name === toolName);
    if (tool) {
      const result = await bitbucketClient.callTool(toolName, arguments_);
      if (Array.isArray(result)) {
        return result
          .map((item) => {
            if (typeof item === "object" && item !== null && "text" in item) {
              return String(item.text);
            }
            return JSON.stringify(item);
          })
          .join("\n");
      }
      return JSON.stringify(result);
    }
  }

  const jiraClient = await getJiraMCPClient(kaySessionId);
  if (jiraClient && jiraClient.isReady()) {
    const tools = jiraClient.getTools();
    const tool = tools.find((t) => t.name === toolName);
    if (tool) {
      const result = await jiraClient.callTool(toolName, arguments_);
      if (Array.isArray(result)) {
        return result
          .map((item) => {
            if (typeof item === "object" && item !== null && "text" in item) {
              return String(item.text);
            }
            return JSON.stringify(item);
          })
          .join("\n");
      }
      return JSON.stringify(result);
    }
  }

  const confluenceClient = await getConfluenceMCPClient(kaySessionId);
  if (confluenceClient && confluenceClient.isReady()) {
    const tools = confluenceClient.getTools();
    const tool = tools.find((t) => t.name === toolName);
    if (tool) {
      const result = await confluenceClient.callTool(toolName, arguments_);
      if (Array.isArray(result)) {
        return result
          .map((item) => {
            if (typeof item === "object" && item !== null && "text" in item) {
              return String(item.text);
            }
            return JSON.stringify(item);
          })
          .join("\n");
      }
      return JSON.stringify(result);
    }
  }

  throw new Error(`Tool ${toolName} not found in any MCP server`);
}

export async function disconnectMCPClient(kaySessionId: string): Promise<void> {
  const bitbucketKey: `${string}:bitbucket` = `${kaySessionId}:bitbucket`;
  const bitbucketClient = bitbucketClients.get(bitbucketKey);
  if (bitbucketClient) {
    await bitbucketClient.disconnect().catch(() => {});
    bitbucketClients.delete(bitbucketKey);
  }

  const jiraKey: `${string}:jira` = `${kaySessionId}:jira`;
  const jiraClient = jiraClients.get(jiraKey);
  if (jiraClient) {
    await jiraClient.disconnect().catch(() => {});
    jiraClients.delete(jiraKey);
  }

  const confluenceKey: `${string}:confluence` = `${kaySessionId}:confluence`;
  const confluenceClient = confluenceClients.get(confluenceKey);
  if (confluenceClient) {
    await confluenceClient.disconnect().catch(() => {});
    confluenceClients.delete(confluenceKey);
  }
}

export function cleanupMCPClients(): void {
  for (const [, client] of bitbucketClients.entries()) {
    client.disconnect().catch(() => {});
  }
  bitbucketClients.clear();

  for (const [, client] of jiraClients.entries()) {
    client.disconnect().catch(() => {});
  }
  jiraClients.clear();

  for (const [, client] of confluenceClients.entries()) {
    client.disconnect().catch(() => {});
  }
  confluenceClients.clear();
}
