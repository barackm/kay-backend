import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding MCP servers...");

  await prisma.mcpServer.upsert({
    where: { name: "jira" },
    update: {
      npmPackage: "@orengrinker/jira-mcp-server",
      localPath: null,
      requiredEnvVars: ["JIRA_HOST", "JIRA_EMAIL", "JIRA_API_TOKEN"],
    },
    create: {
      name: "jira",
      npmPackage: "@orengrinker/jira-mcp-server",
      localPath: null,
      requiredEnvVars: ["JIRA_HOST", "JIRA_EMAIL", "JIRA_API_TOKEN"],
    },
  });

  await prisma.mcpServer.upsert({
    where: { name: "bitbucket" },
    update: {
      npmPackage: "bitbucket-mcp",
      localPath: null,
      requiredEnvVars: ["BITBUCKET_USERNAME", "BITBUCKET_APP_PASSWORD"],
    },
    create: {
      name: "bitbucket",
      npmPackage: "bitbucket-mcp",
      localPath: null,
      requiredEnvVars: ["BITBUCKET_USERNAME", "BITBUCKET_APP_PASSWORD"],
    },
  });

  await prisma.mcpServer.upsert({
    where: { name: "confluence" },
    update: {
      npmPackage: "confluence-mcp",
      localPath: null,
      requiredEnvVars: [
        "CONFLUENCE_URL",
        "CONFLUENCE_USERNAME",
        "CONFLUENCE_API_TOKEN",
      ],
    },
    create: {
      name: "confluence",
      npmPackage: "confluence-mcp",
      localPath: null,
      requiredEnvVars: [
        "CONFLUENCE_URL",
        "CONFLUENCE_USERNAME",
        "CONFLUENCE_API_TOKEN",
      ],
    },
  });

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
