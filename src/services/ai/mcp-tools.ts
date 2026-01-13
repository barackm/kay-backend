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
            }
          }
        }
      } catch (error) {
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
  const server = await prisma.mcpServer.findUnique({
    where: { name: serverName },
  });

  if (!server) {
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
    throw new Error(
      `Credentials not found for ${serverName}. Please connect to ${serverName} first using /mcp/connect/${serverName}`
    );
  }

  const envVars = JSON.parse(decrypt(credential.encryptedEnvVars));

  if (!envVars.BEARER_TOKEN) {
    envVars.BEARER_TOKEN = userToken;
  }

  const serverPath = server.npmPackage || server.localPath;
  if (!serverPath) {
    throw new Error(`Server path not configured for ${serverName}`);
  }

  const client = await registry.ensureConnected(userId, {
    name: serverName,
    path: serverPath,
    env: envVars,
  });

  try {
    const result = await client.callTool(toolName, args);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

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
