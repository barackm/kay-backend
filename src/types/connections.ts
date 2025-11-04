export type ServiceName = "jira" | "confluence" | "bitbucket" | "kyg";

export interface ConnectionMetadata {
  account_id?: string;
  workspace_id?: string;
  url?: string;
  [key: string]: unknown;
}

export interface Connection {
  id: string;
  kay_session_id: string;
  service_name: ServiceName;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  metadata: ConnectionMetadata;
  created_at: number;
  updated_at: number;
}

export interface ConnectionStatus {
  [service: string]: boolean;
}

