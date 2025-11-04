export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface ServiceStatus {
  status: HealthStatus | "disabled";
  message?: string;
}

export interface MCPStatus extends ServiceStatus {
  enabled: boolean;
  connected?: boolean;
  initialized?: boolean;
  toolCount?: number;
  tools?: Array<{ name: string; description?: string }>;
}

export interface ConfluenceStatus extends ServiceStatus {
  accessible: boolean;
  spaceCount?: number;
  tools?: Array<{ name: string; description?: string }>;
}

export interface HealthReport {
  status: HealthStatus;
  timestamp: string;
  services: {
    database: ServiceStatus;
    openai: ServiceStatus & { configured: boolean };
    mcp_jira: MCPStatus;
    mcp_bitbucket: MCPStatus;
    confluence: ConfluenceStatus;
  };
}
