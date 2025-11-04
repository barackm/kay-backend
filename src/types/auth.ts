export interface JiraCredentials {
  email: string;
  apiToken: string;
  baseUrl: string;
}

export interface JwtPayload extends JiraCredentials {
  iat?: number;
  exp?: number;
}

export interface CliSessionPayload {
  kay_session_id: string;
  iat?: number;
  exp?: number;
}

export interface JiraProject {
  key: string;
  name: string;
}

export interface ConfluenceSpace {
  key: string;
  name: string;
}

export interface UserContext {
  accountId: string;
  displayName: string;
  email: string;
  baseUrl: string;
  projects: JiraProject[];
  confluenceSpaces: ConfluenceSpace[];
  permissions: string[];
}
