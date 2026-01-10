#!/usr/bin/env node
import { MCPServerRegistry } from "./services/mcp/server-registry.js";
import { prisma } from "./db/client.js";
import { decrypt } from "./services/encryption.js";

async function testTool(
  userId: string,
  serverName: string,
  toolName: string,
  args: any
) {
  try {
    const server = await prisma.mcpServer.findUnique({
      where: { name: serverName },
    });

    if (!server) {
      console.error(`❌ Server '${serverName}' not found in database`);
      console.log(
        "\n💡 Available servers: jira, bitbucket, confluence, kyg-kmesh"
      );
      process.exit(1);
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
        `❌ No credentials found for user ${userId} and server '${serverName}'`
      );
      console.log(
        "\n💡 Tip: User must connect to this server first via POST /mcp/connect/{serverName}"
      );
      process.exit(1);
    }

    const envVars = JSON.parse(decrypt(credential.encryptedEnvVars));

    const serverPath = server.npmPackage || server.localPath;
    if (!serverPath) {
      console.error(`❌ Server path not configured for '${serverName}'`);
      process.exit(1);
    }

    const registry = new MCPServerRegistry();
    const client = await registry.ensureConnected(userId, {
      name: serverName,
      path: serverPath,
      env: envVars,
    });

    console.log(`🔧 Testing tool: ${serverName}.${toolName}`);
    console.log(`📝 Arguments:`, JSON.stringify(args, null, 2));
    console.log("\n⏳ Calling tool...\n");

    const result = await client.callTool(toolName, args);

    console.log("✅ Result:");
    console.log(JSON.stringify(result, null, 2));

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error(
      "❌ Error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    await prisma.$disconnect();
    process.exit(1);
  }
}

const [userId, serverName, toolName, argsJson] = process.argv.slice(2);

if (!userId || !serverName || !toolName) {
  console.log(`
Usage: npx tsx src/test-tools.ts <userId> <serverName> <toolName> <argsJson>

Examples:
  npx tsx src/test-tools.ts user-uuid-123 jira get_issue '{"issueKey":"PROJ-123"}'
  npx tsx src/test-tools.ts user-uuid-123 confluence get_page '{"pageId":"12345"}'
  npx tsx src/test-tools.ts user-uuid-123 bitbucket get_repository '{"workspace":"myworkspace","repo":"myrepo"}'

Available servers: jira, bitbucket, confluence, kyg-kmesh

Note: The user must have connected to the server first (via POST /mcp/connect/{serverName})
      to save their credentials before testing tools.
  `);
  process.exit(1);
}

const args = argsJson ? JSON.parse(argsJson) : {};
await testTool(userId, serverName, toolName, args);
