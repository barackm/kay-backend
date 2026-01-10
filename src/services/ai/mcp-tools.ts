import { MCPServerRegistry } from "../mcp/server-registry.js";
import { prisma } from "../../db/client.js";
import { decrypt } from "../encryption.js";

export interface AvailableTool {
  server: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export async function getAvailableTools(
  userId: string,
  registry: MCPServerRegistry
): Promise<AvailableTool[]> {
  const credentials = await prisma.userServerCredential.findMany({
    where: { userId },
    include: { server: true },
  });

  const tools: AvailableTool[] = [];

  for (const credential of credentials) {
    try {
      const envVars = JSON.parse(decrypt(credential.encryptedEnvVars));
      const serverPath =
        credential.server.npmPackage || credential.server.localPath;

      if (!serverPath) {
        console.log(
          `[getAvailableTools] No path for ${credential.server.name}, skipping`
        );
        continue;
      }

      try {
        const client = await registry.ensureConnected(userId, {
          name: credential.server.name,
          path: serverPath,
          env: envVars,
        });

        const result = await client.listTools();

        if (Array.isArray(result.tools)) {
          console.log(
            `[getAvailableTools] Found ${result.tools.length} tools for ${credential.server.name}`
          );
          for (const tool of result.tools) {
            if (
              typeof tool === "object" &&
              tool !== null &&
              "name" in tool &&
              typeof (tool as { name: unknown }).name === "string"
            ) {
              const toolObj = tool as {
                name: string;
                description?: unknown;
                inputSchema?: unknown;
              };
              const toolEntry: AvailableTool = {
                server: credential.server.name,
                name: toolObj.name,
              };
              if (
                "description" in toolObj &&
                typeof toolObj.description === "string"
              ) {
                toolEntry.description = toolObj.description;
              }
              if ("inputSchema" in toolObj) {
                toolEntry.inputSchema = toolObj.inputSchema;
              }
              tools.push(toolEntry);

              console.log(
                `[getAvailableTools] Tool: ${credential.server.name}.${toolObj.name}`
              );
              console.log(
                `[getAvailableTools] Description: ${
                  typeof toolObj.description === "string"
                    ? toolObj.description.substring(0, 100)
                    : "N/A"
                }`
              );
              console.log(
                `[getAvailableTools] InputSchema:`,
                JSON.stringify(toolObj.inputSchema, null, 2)
              );
            }
          }
        }
      } catch (error) {
        console.error(
          `[getAvailableTools] Error fetching tools for ${credential.server.name}:`,
          error instanceof Error ? error.message : String(error)
        );
        // Continue to next server instead of failing entirely
      }
    } catch (error) {
      console.error(
        `[getAvailableTools] Error processing credentials for server:`,
        error instanceof Error ? error.message : String(error)
      );
      // Continue to next server
    }
  }

  return tools;
}

export async function callMcpTool(
  registry: MCPServerRegistry,
  userId: string,
  userToken: string,
  serverName: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  console.log(
    `[callMcpTool] Calling ${serverName}.${toolName} for user ${userId}`
  );

  const server = await prisma.mcpServer.findUnique({
    where: { name: serverName },
  });

  if (!server) {
    console.error(`[callMcpTool] Server ${serverName} not found in database`);
    throw new Error(`Server ${serverName} not found`);
  }

  const credential = await prisma.userServerCredential.findUnique({
    where: {
      userId_serverId: {
        userId,
        serverId: server.id,
      },
    },
  });

  if (!credential) {
    console.error(
      `[callMcpTool] No credentials found for ${serverName} and user ${userId}`
    );
    throw new Error(
      `Credentials not found for ${serverName}. Please connect to ${serverName} first using /mcp/connect/${serverName}`
    );
  }

  const envVars = JSON.parse(decrypt(credential.encryptedEnvVars));
  const envKeys = Object.keys(envVars);
  console.log(
    `[callMcpTool] Found credentials with env vars: ${envKeys.join(", ")}`
  );
  console.log(
    `[callMcpTool] Env var values (masked):`,
    envKeys.reduce((acc, key) => {
      const value = envVars[key];
      if (typeof value === "string") {
        acc[key] = value.length > 4 ? `${value.substring(0, 9)}***` : "***";
      }
      return acc;
    }, {} as Record<string, string>)
  );

  if (!envVars.BEARER_TOKEN) {
    envVars.BEARER_TOKEN = userToken;
    console.log(`[callMcpTool] Using user token as BEARER_TOKEN`);
  }

  if (serverName === "jira") {
    if (!envVars.JIRA_EMAIL) {
      console.error(`[callMcpTool] Missing JIRA_EMAIL for ${serverName}`);
    }
    if (!envVars.JIRA_API_TOKEN) {
      console.error(`[callMcpTool] Missing JIRA_API_TOKEN for ${serverName}`);
    }
    if (!envVars.JIRA_HOST) {
      console.error(`[callMcpTool] Missing JIRA_HOST for ${serverName}`);
    }
  }

  const serverPath = server.npmPackage || server.localPath;
  if (!serverPath) {
    console.error(`[callMcpTool] No server path configured for ${serverName}`);
    throw new Error(`Server path not configured for ${serverName}`);
  }

  console.log(`[callMcpTool] Ensuring connection to ${serverName}...`);
  const client = await registry.ensureConnected(userId, {
    name: serverName,
    path: serverPath,
    env: envVars,
  });

  try {
    console.log(
      `[callMcpTool] Calling tool ${toolName} with args:`,
      Object.keys(args)
    );
    const result = await client.callTool(toolName, args);
    console.log(`[callMcpTool] Tool ${toolName} completed successfully`);
    return result;
  } catch (error) {
    console.error(
      `[callMcpTool] Error calling ${serverName}.${toolName}:`,
      error
    );
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[callMcpTool] Error details:`, {
      serverName,
      toolName,
      userId,
      errorMessage,
      hasCredentials: !!credential,
      envVarKeys: envKeys,
    });

    if (
      errorMessage.includes("credentials") ||
      errorMessage.includes("authentication") ||
      errorMessage.includes("401") ||
      errorMessage.includes("403")
    ) {
      throw new Error(
        `Authentication failed for ${serverName}. Please verify your credentials are correct. Error: ${errorMessage}`
      );
    }
    throw error;
  }
}
