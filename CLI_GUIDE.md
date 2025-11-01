# CLI Integration Guide for Kay Backend

Complete guide for integrating the CLI with Kay Backend authentication system.

## Overview

The Kay Backend uses a **session token + refresh token** authentication system:

- **Session Token:** JWT that expires in 30 minutes (short-lived for security)
- **Refresh Token:** Random hex string that expires in 7 days (max 30 days)

## Authentication Flow

### Step 1: Initiate Login

**Endpoint:** `GET /auth/login`

```bash
curl http://localhost:4000/auth/login
```

**Response:**

```json
{
  "message": "Please visit the URL below to authorize",
  "authorization_url": "https://auth.atlassian.com/authorize?...",
  "state": "abc123def456..."
}
```

**Actions:**

1. Extract `authorization_url` and `state`
2. Open `authorization_url` in user's browser
3. Display "Waiting for authorization..." message

### Step 2: Poll for Completion

**Endpoint:** `GET /auth/status/:state`

Poll every 2-3 seconds until completion.

**Pending Response:**

```json
{
  "status": "pending",
  "message": "Authorization not yet completed"
}
```

**Completed Response:**

```json
{
  "status": "completed",
  "account_id": "557058:abc123-def456-ghi789",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "a1b2c3d4e5f6...",
  "message": "Authorization completed successfully..."
}
```

**Actions:**

1. Store both `token` and `refresh_token` securely
2. Store `account_id` for reference
3. Stop polling

### Step 3: Token Refresh (When Session Expires)

**Endpoint:** `POST /auth/refresh`

Called automatically when session token expires (401 response).

**Request:**

```json
{
  "refresh_token": "a1b2c3d4e5f6..."
}
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "f6e5d4c3b2a1...",
  "message": "Token refreshed successfully"
}
```

**Important:** Always save the new `refresh_token` (token rotation).

## API Endpoints

### GET /auth/me

Get authenticated user information.

**Request:**

```
Authorization: Bearer {token}
```

**Response:**

```json
{
  "message": "User information",
  "data": {
    "account_id": "557058:abc123-def456-ghi789",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "picture": "https://...",
    "account_type": "atlassian",
    "account_status": "active",
    "resources": [...]
  }
}
```

### POST /auth/logout

Logout and revoke session.

**Request:**

```
Authorization: Bearer {token}
```

**Response:**

```json
{
  "message": "Logged out successfully"
}
```

## Implementation

### TypeScript Types

```typescript
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
  refresh_token: string;
  message: string;
}

export type StatusResponse = StatusPendingResponse | StatusCompletedResponse;

export interface RefreshTokenResponse {
  token: string;
  refresh_token: string;
  message: string;
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
    resources: Array<{
      id: string;
      url: string;
      name: string;
      scopes: string[];
      avatarUrl: string;
    }>;
  };
}
```

### Complete Implementation Example

```typescript
class KayAuth {
  private config: Config;
  private baseUrl = "http://localhost:4000";

  async login(): Promise<void> {
    // Step 1: Get authorization URL
    const loginResponse = await fetch(`${this.baseUrl}/auth/login`);
    const { authorization_url, state } = await loginResponse.json();

    // Step 2: Open browser
    openBrowser(authorization_url);

    // Step 3: Poll for completion
    while (true) {
      const statusResponse = await fetch(
        `${this.baseUrl}/auth/status/${state}`
      );
      const status = await statusResponse.json();

      if (status.status === "completed") {
        // Store both tokens
        this.config.set("token", status.token);
        this.config.set("refresh_token", status.refresh_token);
        this.config.set("account_id", status.account_id);
        break;
      }

      await sleep(2000);
    }
  }

  async refreshToken(): Promise<boolean> {
    const refreshToken = this.config.get("refresh_token");
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) return false;

      const { token, refresh_token } = await response.json();
      // Always save new refresh_token (token rotation)
      this.config.set("token", token);
      this.config.set("refresh_token", refresh_token);
      return true;
    } catch {
      return false;
    }
  }

  async makeAuthenticatedRequest(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    let token = this.config.get("token");

    let response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });

    // Auto-refresh on 401
    if (response.status === 401) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        token = this.config.get("token");
        // Retry request with new token
        response = await fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${token}`,
          },
        });
      } else {
        throw new Error("Session expired. Please login again: kay login");
      }
    }

    return response;
  }
}
```

## Token Management

### Storage

**Where to store:**

- Store tokens in a local config file (e.g., `~/.kay/config.json` or
  `~/.config/kay/tokens.json`)
- Use platform-appropriate directories:
  - **macOS/Linux:** `~/.config/kay/` or `~/.kay/`
  - **Windows:** `%APPDATA%\kay\` or `%USERPROFILE%\.kay\`

**File structure example:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "a1b2c3d4e5f6...",
  "account_id": "557058:abc123-def456-ghi789",
  "expires_at": 1709876543000
}
```

**Security best practices:**

- Set file permissions to `600` (owner read/write only):
  `chmod 600 ~/.kay/config.json`
- Consider encrypting sensitive data at rest (especially refresh tokens)
- Never commit tokens to version control
- Clear tokens on logout

### Retrieval & Validation

**Token retrieval:**

```typescript
function getToken(): string | null {
  const config = readConfigFile();
  return config?.token || null;
}

function getRefreshToken(): string | null {
  const config = readConfigFile();
  return config?.refresh_token || null;
}
```

**Token validation before use:**

```typescript
function isTokenValid(token: string): boolean {
  try {
    // Decode JWT without verification (to check expiry)
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString()
    );
    const now = Math.floor(Date.now() / 1000);
    return payload.exp > now;
  } catch {
    return false;
  }
}

// Proactive refresh (refresh before token expires)
async function ensureValidToken(): Promise<string | null> {
  let token = getToken();

  // Check if token is expired or expires soon (within 5 minutes)
  if (!token || !isTokenValid(token) || isTokenExpiringSoon(token, 5 * 60)) {
    const refreshed = await refreshToken();
    if (refreshed) {
      token = getToken();
    } else {
      return null; // Need to re-login
    }
  }

  return token;
}
```

### Token Cleanup

**On logout:**

```typescript
function clearTokens(): void {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
  // Or just remove token fields:
  // const config = readConfigFile();
  // delete config.token;
  // delete config.refresh_token;
  // writeConfigFile(config);
}
```

**On refresh token expiration:**

- Automatically clear tokens when refresh fails
- Prompt user to re-authenticate

## Token Lifecycle

1. **Initial Login** → Receive `token` (30 minutes) + `refresh_token` (7 days,
   max 30 days)
2. **Storage** → Save both tokens securely to local config file
3. **API Requests** → Use `token` in `Authorization: Bearer {token}` header
4. **Token Expires** → Receive 401 Unauthorized (happens every ~30 minutes)
5. **Auto-Refresh** → Call `/auth/refresh` with `refresh_token` → Get new tokens
6. **Token Rotation** → Save new `refresh_token` (old one is invalidated)
7. **Refresh Token Expires** → User must re-authenticate via `/auth/login`

## Error Handling

### 400 Bad Request

- Missing/invalid parameters
- Invalid or expired state parameter (10 minute timeout)

### 401 Unauthorized

- Missing/invalid session token
- **Action:** Auto-refresh using refresh_token. If refresh fails, prompt
  re-login

### 500 Internal Server Error

- Server error during OAuth flow
- **Action:** Display error, suggest retrying

## Important Notes

- **Session tokens expire in 30 minutes** - Much shorter than typical auth
  systems, so auto-refresh is critical
- **Refresh tokens last 7 days** (max 30 days) - Ensures users don't need to
  re-authenticate too frequently
- **Always implement auto-refresh** - Users should never see 401 errors; refresh
  should happen transparently
- **Token rotation** - Each refresh returns a new refresh_token; always save it
  to replace the old one
- **Store both tokens securely** - Session token AND refresh token must be saved
- **File permissions** - Set config file to `600` (owner read/write only) for
  security
- **Never commit tokens** - Add config file to `.gitignore`
- **Proactive refresh** - Consider refreshing tokens before they expire (e.g., 5
  minutes before)
- **State expires in 10 minutes** - If user takes too long, restart login flow

## Ask Endpoint

The `/ask` endpoint is the main interface for interacting with Kay's AI
assistant.

### POST /ask

Send a request to the AI assistant. Supports three modes: one-shot,
confirmation, and interactive.

**Request:**

```typescript
{
  prompt: string;              // Required: The user's question or request
  interactive?: boolean;        // Optional: Enable multi-turn conversation
  confirm?: boolean;            // Optional: Require confirmation before execution
  context?: Record<string, any>; // Optional: Additional context
  session_id?: string;          // Optional: For continuing interactive sessions
  confirmation_token?: string;  // Optional: For confirming pending actions
}
```

**Response:**

```typescript
{
  status: "pending" | "confirmation_required" | "interactive_response" | "completed" | "error";
  session_id?: string;          // For interactive sessions
  message: string;              // AI response or status message
  data?: unknown;               // Additional data
  confirmation_token?: string;  // When confirmation is required
  requires_confirmation?: boolean;
  interactive?: boolean;
}
```

### Mode 1: One-Shot Request

Simple question/answer without conversation history.

**Request:**

```json
POST /ask
{
  "prompt": "What can you help me with?",
  "interactive": false,
  "confirm": false
}
```

**Response:**

```json
{
  "status": "completed",
  "message": "I can help you with Jira tickets, project management...",
  "data": {
    "prompt": "What can you help me with?",
    "response": "..."
  }
}
```

### Mode 2: Confirmation Required

Request that requires user confirmation before execution.

**Step 1: Request with confirmation flag**

```json
POST /ask
{
  "prompt": "Delete all tickets in project PROJ",
  "confirm": true
}
```

**Response:**

```json
{
  "status": "confirmation_required",
  "confirmation_token": "confirm_1234567890_abc123",
  "requires_confirmation": true,
  "message": "Please confirm the following action: Delete all tickets in project PROJ",
  "data": {
    "prompt": "Delete all tickets in project PROJ",
    "context": {}
  }
}
```

**Step 2: Confirm or cancel**

```json
POST /ask/confirm
{
  "confirmation_token": "confirm_1234567890_abc123",
  "approved": true  // or false to cancel
}
```

**Response (approved):**

```json
{
  "status": "completed",
  "message": "Action confirmed and executed successfully",
  "data": {...}
}
```

**Response (cancelled):**

```json
{
  "status": "completed",
  "message": "Action cancelled by user"
}
```

### Mode 3: Interactive Conversation

Multi-turn conversation with full context history.

**Turn 1: Start conversation**

```json
POST /ask
{
  "prompt": "I need help with Jira",
  "interactive": true
}
```

**Response:**

```json
{
  "status": "interactive_response",
  "session_id": "session_1234567890_xyz789",
  "interactive": true,
  "message": "Sure! I can help you with Jira. What would you like to do?",
  "data": {
    "prompt": "I need help with Jira"
  }
}
```

**Turn 2: Continue conversation**

```json
POST /ask
{
  "prompt": "Create a ticket for my latest commit",
  "interactive": true,
  "session_id": "session_1234567890_xyz789"
}
```

**Response:**

```json
{
  "status": "interactive_response",
  "session_id": "session_1234567890_xyz789",
  "interactive": true,
  "message": "I can help create a ticket. Which project should I use?",
  "data": {
    "prompt": "Create a ticket for my latest commit"
  }
}
```

**Turn 3: Continue with more context**

```json
POST /ask
{
  "prompt": "Use project PROJ-123",
  "interactive": true,
  "session_id": "session_1234567890_xyz789"
}
```

The AI has full context from previous messages and can reference them.

### POST /ask/confirm

Confirm or cancel a pending action.

**Request:**

```json
{
  "confirmation_token": "confirm_1234567890_abc123",
  "approved": true
}
```

**Response:** See confirmation flow above.

## TypeScript Types

```typescript
export interface AskRequest {
  prompt: string;
  interactive?: boolean;
  confirm?: boolean;
  context?: Record<string, unknown>;
  session_id?: string;
  confirmation_token?: string;
}

export interface AskResponse {
  status:
    | "pending"
    | "confirmation_required"
    | "interactive_response"
    | "completed"
    | "error";
  session_id?: string;
  message: string;
  data?: unknown;
  confirmation_token?: string;
  requires_confirmation?: boolean;
  interactive?: boolean;
}

export interface ConfirmationRequest {
  confirmation_token: string;
  approved: boolean;
}
```

## Error Handling

**Missing prompt:**

```json
{
  "status": "error",
  "message": "Missing required field: prompt"
}
```

**Invalid session_id:**

```json
{
  "status": "error",
  "message": "Invalid or expired session_id"
}
```

**OpenAI not configured:**

```json
{
  "status": "error",
  "message": "OpenAI API key is not configured"
}
```

## Important Notes

- **Interactive sessions** maintain full conversation history across all turns
- **Session IDs** are required for continuing interactive conversations
- **Confirmation tokens** expire after 5 minutes
- **Interactive sessions** are stored in memory (will persist until server
  restart)
- All endpoints require authentication via `Authorization: Bearer {token}`
  header

## Checklist

- [ ] Call `GET /auth/login` and parse JSON response
- [ ] Extract `authorization_url` and `state` from response
- [ ] Open `authorization_url` in user's browser
- [ ] Display "Waiting for authorization..." message
- [ ] Poll `GET /auth/status/:state` every 2-3 seconds
- [ ] Handle pending status (continue polling)
- [ ] Handle completed status (save both tokens, stop polling)
- [ ] Store both `token` and `refresh_token` securely
- [ ] Implement `POST /auth/refresh` endpoint call
- [ ] Add automatic token refresh in API request handler (on 401)
- [ ] Update TypeScript types to include `refresh_token`
- [ ] Handle refresh token expiration (prompt user to re-login)
- [ ] Implement `POST /ask` endpoint with all three modes
- [ ] Implement `POST /ask/confirm` for confirmation flow
- [ ] Handle interactive session management (store `session_id`)
- [ ] Test one-shot requests
- [ ] Test confirmation flow
- [ ] Test interactive conversation with multiple turns
- [ ] Test error handling
