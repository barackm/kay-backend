# Kay Backend API Reference

TypeScript interfaces and endpoint specifications for CLI integration.

## TypeScript Interfaces

```typescript
// Auth Endpoints

export interface LoginResponse {
  message: string;
  authorization_url: string;
  state: string;
}

export interface StatusPendingResponse {
  status: "pending";
  message: string;
}

export interface StatusCompletedResponse {
  status: "completed";
  account_id: string;
  token: string;
  message: string;
}

export type StatusResponse = StatusPendingResponse | StatusCompletedResponse;

export interface UserResource {
  id: string;
  url: string;
  name: string;
  scopes: string[];
  avatarUrl: string;
}

export interface MeResponse {
  message: string;
  data: {
    account_id: string;
    name: string;
    email: string;
    picture: string;
    account_type: string;
    account_status: string;
    resources: UserResource[];
  };
}

export interface LogoutResponse {
  message: string;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}
```

## Endpoints

### 1. GET /auth/login

Initiate OAuth login flow.

**Request:**

```typescript
// No request body
GET / auth / login;
```

**Response (200 OK):**

```typescript
LoginResponse;
```

**Example:**

```json
{
  "message": "Please visit the URL below to authorize",
  "authorization_url": "https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=...&scope=read:me%20read:jira-work%20read:jira-user&redirect_uri=http://localhost:4000/auth/callback&state=abc123...&response_type=code&prompt=consent",
  "state": "abc123def456..."
}
```

---

### 2. GET /auth/status/:state

Poll for OAuth completion status.

**Request:**

```typescript
GET /auth/status/:state
```

**Parameters:**

- `state` (path): The state value received from `/auth/login`

**Response (200 OK):**

```typescript
StatusResponse; // Either StatusPendingResponse or StatusCompletedResponse
```

**While Pending:**

```json
{
  "status": "pending",
  "message": "Authorization not yet completed"
}
```

**When Completed:**

```json
{
  "status": "completed",
  "account_id": "557058:abc123-def456-ghi789",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "message": "Authorization completed successfully. Use the token in Authorization header for future requests."
}
```

**Error (400 Bad Request):**

```json
{
  "error": "Missing state parameter"
}
```

---

### 3. GET /auth/me

Get authenticated user information.

**Request:**

```typescript
GET / auth / me;
Headers: {
  Authorization: "Bearer {token}";
}
```

**Response (200 OK):**

```typescript
MeResponse;
```

**Example:**

```json
{
  "message": "User information",
  "data": {
    "account_id": "557058:abc123-def456-ghi789",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "picture": "https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/...",
    "account_type": "atlassian",
    "account_status": "active",
    "resources": [
      {
        "id": "ari:cloud:platform::site/abc123",
        "url": "https://yourcompany.atlassian.net",
        "name": "Your Company Workspace",
        "scopes": ["read:jira-work", "read:jira-user"],
        "avatarUrl": "https://..."
      }
    ]
  }
}
```

**Error (401 Unauthorized):**

```json
{
  "error": "Unauthorized: Missing or invalid token"
}
```

---

### 4. POST /auth/logout

Logout and revoke session tokens.

**Request:**

```typescript
POST / auth / logout;
Headers: {
  Authorization: "Bearer {token}";
}
```

**Response (200 OK):**

```typescript
LogoutResponse;
```

**Example:**

```json
{
  "message": "Logged out successfully"
}
```

**Error (401 Unauthorized):**

```json
{
  "error": "Unauthorized: Missing or invalid token"
}
```

---

## HTTP Status Codes

- `200 OK` - Request successful
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Missing or invalid authentication token
- `500 Internal Server Error` - Server error

## Authentication

For protected endpoints (`/auth/me`, `/auth/logout`), include the JWT token in
the Authorization header:

```
Authorization: Bearer {token}
```

The token is obtained from the `GET /auth/status/:state` endpoint when
`status === "completed"`.
