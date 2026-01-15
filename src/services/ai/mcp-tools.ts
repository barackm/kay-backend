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
          if (credential.server.name === "kyg-kmesh") {
            console.log(
              `[getAvailableTools:kyg-kmesh] Found ${result.tools.length} tools for ${credential.server.name}`
            );
          }
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
              if (credential.server.name === "kyg-kmesh") {
                console.log(
                  `[getAvailableTools:kyg-kmesh] Tool: ${credential.server.name}.${toolObj.name}`
                );
              }
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
            }
          }
        }
      } catch (error) {
        if (credential.server.name === "kyg-kmesh") {
          console.error(
            `[getAvailableTools:kyg-kmesh] Error fetching tools for ${credential.server.name}:`,
            error instanceof Error ? error.message : String(error)
          );
          if (error instanceof Error && error.stack) {
            console.error(
              `[getAvailableTools:kyg-kmesh] Error stack:`,
              error.stack
            );
          }
        }
        // Continue to next server instead of failing entirely
      }
    } catch (error) {
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
  if (serverName === "kyg-kmesh") {
    console.log(
      `[callMcpTool:kyg-kmesh] Calling ${serverName}.${toolName} for user ${userId}`
    );
    console.log(
      `[callMcpTool:kyg-kmesh] Tool arguments:`,
      JSON.stringify(args, null, 2)
    );
  }

  const server = await prisma.mcpServer.findUnique({
    where: { name: serverName },
  });

  if (!server) {
    if (serverName === "kyg-kmesh") {
      console.error(
        `[callMcpTool:kyg-kmesh] Server ${serverName} not found in database`
      );
    }
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
    if (serverName === "kyg-kmesh") {
      console.error(
        `[callMcpTool:kyg-kmesh] No credentials found for ${serverName} and user ${userId}`
      );
    }
    throw new Error(
      `Credentials not found for ${serverName}. Please connect to ${serverName} first using /mcp/connect/${serverName}`
    );
  }

  const envVars = JSON.parse(decrypt(credential.encryptedEnvVars));
  const envKeys = Object.keys(envVars);
  if (serverName === "kyg-kmesh") {
    console.log(
      `[callMcpTool:kyg-kmesh] Found credentials with env vars: ${envKeys.join(
        ", "
      )}`
    );
    console.log(
      `[callMcpTool:kyg-kmesh] Env var values (masked):`,
      envKeys.reduce((acc, key) => {
        const value = envVars[key];
        if (typeof value === "string") {
          acc[key] = value.length > 4 ? `${value.substring(0, 9)}***` : "***";
        }
        return acc;
      }, {} as Record<string, string>)
    );
  }

  const bearerTokenWasAdded = !envVars.BEARER_TOKEN;
  if (!envVars.BEARER_TOKEN) {
    envVars.BEARER_TOKEN = userToken;
    if (serverName === "kyg-kmesh") {
      console.log(`[callMcpTool:kyg-kmesh] Using user token as BEARER_TOKEN`);
    }
  }

  const serverPath = server.npmPackage || server.localPath;
  if (!serverPath) {
    if (serverName === "kyg-kmesh") {
      console.error(
        `[callMcpTool:kyg-kmesh] No server path configured for ${serverName}`
      );
    }
    throw new Error(`Server path not configured for ${serverName}`);
  }

  if (bearerTokenWasAdded && registry.isConnected(userId, serverName)) {
    if (serverName === "kyg-kmesh") {
      console.log(
        `[callMcpTool:kyg-kmesh] BEARER_TOKEN was added, disconnecting and reconnecting ${serverName} to use new env vars`
      );
    }
    await registry.disconnect(userId, serverName);
  }

  if (serverName === "kyg-kmesh") {
    console.log(
      `[callMcpTool:kyg-kmesh] Ensuring connection to ${serverName}...`
    );
  }
  const client = await registry.ensureConnected(userId, {
    name: serverName,
    path: serverPath,
    env: envVars,
  });

  try {
    if (serverName === "kyg-kmesh") {
      console.log(
        `[callMcpTool:kyg-kmesh] Calling tool ${toolName} with args:`,
        Object.keys(args)
      );
    }
    const result = await client.callTool(toolName, args);
    if (serverName === "kyg-kmesh") {
      console.log(
        `[callMcpTool:kyg-kmesh] Tool ${toolName} completed successfully. Result type:`,
        typeof result
      );
      if (typeof result === "object" && result !== null) {
        const resultStr = JSON.stringify(result);
        console.log(
          `[callMcpTool:kyg-kmesh] Result preview (first 500 chars):`,
          resultStr.substring(0, 500)
        );
      }
    }
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (serverName === "kyg-kmesh") {
      console.error(
        `[callMcpTool:kyg-kmesh] Error calling ${serverName}.${toolName}:`,
        errorMessage
      );
      console.error(`[callMcpTool:kyg-kmesh] Error details:`, {
        serverName,
        toolName,
        userId,
        errorMessage,
        hasCredentials: !!credential,
        envVarKeys: envKeys,
        errorStack: error instanceof Error ? error.stack : undefined,
      });
    }

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
