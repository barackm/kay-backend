import { config } from "dotenv";

config();

export const ENV = {
  PORT: Number(process.env.PORT) || 4000,
  JWT_SECRET: process.env.JWT_SECRET || "your-secret-key-change-in-production",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  CLI_SESSION_EXPIRES_IN: process.env.CLI_SESSION_EXPIRES_IN || "30m",
  CLI_REFRESH_TOKEN_EXPIRES_IN:
    process.env.CLI_REFRESH_TOKEN_EXPIRES_IN || "7d",
  ATLASSIAN_CLIENT_ID: process.env.ATLASSIAN_CLIENT_ID || "",
  ATLASSIAN_CLIENT_SECRET: process.env.ATLASSIAN_CLIENT_SECRET || "",
  ATLASSIAN_CALLBACK_URL:
    process.env.ATLASSIAN_CALLBACK_URL ||
    "http://localhost:4000/connections/oauth/callback",
  BITBUCKET_CALLBACK_URL:
    process.env.BITBUCKET_CALLBACK_URL ||
    "http://localhost:4000/connections/oauth/callback",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
  OPENAI_MAX_TOKENS: Number(process.env.OPENAI_MAX_TOKENS) || 2000,
  OPENAI_TEMPERATURE: Number(process.env.OPENAI_TEMPERATURE) || 0.7,
  MCP_JIRA_ENABLED: process.env.MCP_JIRA_ENABLED === "true",
  MCP_JIRA_COMMAND: process.env.MCP_JIRA_COMMAND || "docker",
  MCP_JIRA_ARGS: process.env.MCP_JIRA_ARGS
    ? process.env.MCP_JIRA_ARGS.split(",")
    : ["run", "--rm", "-i", "ghcr.io/sooperset/mcp-atlassian:latest"],
  MCP_JIRA_DISABLED_TOOLS: process.env.MCP_JIRA_DISABLED_TOOLS
    ? process.env.MCP_JIRA_DISABLED_TOOLS.split(",").map((t) => t.trim())
    : undefined,
  KYG_CORE_BASE_URL: process.env.KYG_CORE_BASE_URL || "",
};
