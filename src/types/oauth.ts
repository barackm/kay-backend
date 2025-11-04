export interface AtlassianTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface AtlassianUser {
  account_id: string;
  name: string;
  email: string;
  picture: string;
  account_type: string;
  account_status: string;
}

export interface AccessibleResource {
  id: string;
  url: string;
  name: string;
  scopes: string[];
  avatarUrl: string;
}

export interface BitbucketTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scopes: string;
}

export interface BitbucketUser {
  uuid: string;
  username: string;
  display_name: string;
  account_id: string;
  links: {
    avatar: {
      href: string;
    };
  };
  created_on: string;
  [key: string]: unknown;
}

export interface StoredToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  account_id: string;
  resources: AccessibleResource[];
  user: AtlassianUser;
}
