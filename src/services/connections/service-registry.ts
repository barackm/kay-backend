import { ServiceName } from "../../types/connections.js";

export type OAuthProvider = "atlassian" | "bitbucket";

export interface ServiceConfig {
  name: ServiceName;
  oauthProvider: OAuthProvider | null;
  requiresOAuth: boolean;
}

const SERVICE_REGISTRY: Record<ServiceName, ServiceConfig> = {
  [ServiceName.JIRA]: {
    name: ServiceName.JIRA,
    oauthProvider: "atlassian",
    requiresOAuth: true,
  },
  [ServiceName.CONFLUENCE]: {
    name: ServiceName.CONFLUENCE,
    oauthProvider: "atlassian",
    requiresOAuth: true,
  },
  [ServiceName.BITBUCKET]: {
    name: ServiceName.BITBUCKET,
    oauthProvider: null,
    requiresOAuth: false,
  },
  [ServiceName.KYG]: {
    name: ServiceName.KYG,
    oauthProvider: null,
    requiresOAuth: false,
  },
};

export function getServiceConfig(serviceName: ServiceName): ServiceConfig {
  const config = SERVICE_REGISTRY[serviceName];
  if (!config) {
    throw new Error(`Unknown service: ${serviceName}`);
  }
  return config;
}

export function getOAuthProvider(
  serviceName: ServiceName
): OAuthProvider | null {
  return SERVICE_REGISTRY[serviceName]?.oauthProvider || null;
}

export function getServicesByProvider(provider: OAuthProvider): ServiceName[] {
  return Object.entries(SERVICE_REGISTRY)
    .filter(([_, config]) => config.oauthProvider === provider)
    .map(([name]) => name as ServiceName);
}

export function isValidService(
  serviceName: string
): serviceName is ServiceName {
  return serviceName in SERVICE_REGISTRY;
}
