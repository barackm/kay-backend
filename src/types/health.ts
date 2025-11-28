export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface ServiceStatus {
  status: HealthStatus | "disabled";
  message?: string;
}

export interface HealthReport {
  status: HealthStatus;
  timestamp: string;
  services: {
    database: ServiceStatus;
    openai: ServiceStatus & { configured: boolean };
  };
}
