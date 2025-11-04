import { prisma } from "../../db/client.js";
import { isOpenAIConfigured } from "../../services/ai/openai-service.js";
import type { HealthReport, ServiceStatus } from "../../types/health.js";

export function createHealthReport(): HealthReport {
  return {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      database: { status: "healthy" },
      openai: { status: "healthy", configured: isOpenAIConfigured() },
      mcp_jira: { status: "disabled", enabled: true },
      mcp_bitbucket: { status: "disabled", enabled: true },
      confluence: { status: "healthy", accessible: false },
    },
  };
}

export function handleError<T extends ServiceStatus>(
  service: T,
  error: unknown
): T {
  return {
    ...service,
    status: "unhealthy",
    message: error instanceof Error ? error.message : "Unknown error",
  } as T;
}

export async function checkDatabase(health: HealthReport) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.services.database.status = "healthy";
  } catch (error) {
    health.services.database = handleError(health.services.database, error);
    throw new Error("Database unreachable");
  }
}

export async function checkOpenAI(health: HealthReport) {
  const configured = isOpenAIConfigured();
  health.services.openai.configured = configured;
  health.services.openai.status = configured ? "healthy" : "unhealthy";
  if (!configured) health.services.openai.message = "OPENAI_API_KEY not set";
}
