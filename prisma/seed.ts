import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding MCP servers...");

  // Jira
  await prisma.mcpServer.upsert({
    where: { name: "jira" },
    update: {},
    create: {
      name: "jira",
      npmPackage: "@aashari/mcp-server-atlassian-jira",
      localPath: null,
      requiredEnvVars: [
        "ATLASSIAN_SITE_NAME",
        "ATLASSIAN_USER_EMAIL",
        "ATLASSIAN_API_TOKEN",
      ],
    },
  });

  // Bitbucket
  await prisma.mcpServer.upsert({
    where: { name: "bitbucket" },
    update: {},
    create: {
      name: "bitbucket",
      npmPackage: "@aashari/mcp-server-atlassian-bitbucket",
      localPath: null,
      requiredEnvVars: ["ATLASSIAN_USER_EMAIL", "ATLASSIAN_API_TOKEN"],
    },
  });

  // Confluence
  await prisma.mcpServer.upsert({
    where: { name: "confluence" },
    update: {},
    create: {
      name: "confluence",
      npmPackage: "@aashari/mcp-server-atlassian-confluence",
      localPath: null,
      requiredEnvVars: [
        "ATLASSIAN_SITE_NAME",
        "ATLASSIAN_USER_EMAIL",
        "ATLASSIAN_API_TOKEN",
      ],
    },
  });

  // Kyg Kmesh (local server)
  await prisma.mcpServer.upsert({
    where: { name: "kyg-kmesh" },
    update: {},
    create: {
      name: "kyg-kmesh",
      npmPackage: null,
      localPath: "../kyg-kmesh-mcp-server",
      requiredEnvVars: ["API_BASE_URL", "BEARER_TOKEN"],
    },
  });

  console.log("✅ Seeding completed!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
