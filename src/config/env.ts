import { config } from "dotenv";

config();

export const ENV = {
  PORT: Number(process.env.PORT) || 4000,
  JWT_SECRET: process.env.JWT_SECRET || "your-secret-key-change-in-production",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  CLI_SESSION_EXPIRES_IN: process.env.CLI_SESSION_EXPIRES_IN || "30d",
  ATLASSIAN_CLIENT_ID: process.env.ATLASSIAN_CLIENT_ID || "",
  ATLASSIAN_CLIENT_SECRET: process.env.ATLASSIAN_CLIENT_SECRET || "",
  ATLASSIAN_REDIRECT_URI: process.env.ATLASSIAN_REDIRECT_URI || "",
};
