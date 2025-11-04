# CLI Integration Guide for Kay Backend

Complete guide for integrating the CLI with Kay Backend service connection
system.

## Overview

The Kay Backend uses a **service connection** model where users connect
third-party services (Jira, Confluence, etc.) individually. The system uses:

- **Session Token:** JWT that expires in 30 minutes (short-lived for security)
- **Refresh Token:** Random hex string that expires in 7 days (max 30 days)
- **Session ID (kay_session_id):** Persistent identifier stored locally (not
  deleted until CLI uninstall)

## Service Connection Flow

### Step 1: Connect First Service (New Installation)

**Endpoint:** `POST /connections/connect?service=jira`

**Request:**

```json
{}
```

Or with existing `session_id`:

```json
{
  "session_id": "kaysession_1234567890_abc123"
}
```

**Response:**

```json
{
  "service": "jira",
  "session_id": "kaysession_1234567890_abc123",
  "authorization_url": "https://auth.atlassian.com/authorize?...",
  "state": "abc123def456...",
  "message": "Please visit the authorization URL to connect jira"
}
```

**Response (with auto-recovery):**

If the provided `session_id` is invalid (e.g., database was reset, session
deleted), the backend automatically creates a new session:

```json
{
  "service": "jira",
  "session_id": "kaysession_9876543210_xyz789",
  "authorization_url": "https://auth.atlassian.com/authorize?...",
  "state": "abc123def456...",
  "message": "New session created. Please visit the authorization URL to connect jira",
  "session_reset": true
}
```

**Actions:**

1. **Check for `session_reset` flag**: If `session_reset: true` is present, the
   backend created a new session because the old one was invalid
2. **Update stored `session_id`**: Always update your local `session_id` with
   the value returned in the response
3. **Store `session_id` (kay_session_id) locally (persistent)**
4. **Extract `authorization_url` and `state`**
5. **Open `authorization_url` in user's browser**
6. **Display "Waiting for authorization..." message**
   - If `session_reset: true`, optionally show: "⚠️ Session was reset. New
     session created."

**Note:** If `session_id` is not provided, backend creates a new one and returns
it. The backend also automatically recovers from invalid session IDs by creating
new ones.

### Step 2: Poll for Completion (First Service Only)

**Endpoint:** `GET /auth/status/:state`

Poll every 2-3 seconds until completion. **Only needed for first service
connection.**

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

### Step 3: Connect Additional Services

**Endpoint:** `POST /connections/connect?service=confluence`

**Request:**

```json
{
  "session_id": "kaysession_1234567890_abc123"
}
```

**Response:**

```json
{
  "service": "confluence",
  "session_id": "kaysession_1234567890_abc123",
  "authorization_url": "https://auth.atlassian.com/authorize?...",
  "state": "xyz789ghi456...",
  "message": "Please visit the authorization URL to connect confluence"
}
```

**Actions:**

1. **Check for `session_reset` flag**: If present, update your stored
   `session_id`
2. Open `authorization_url` in user's browser
3. User authorizes
4. **No polling needed** - service is connected automatically
5. CLI already has `session_token` and `refresh_token` from first connection

### Step 4: Check Connection Status & User Info

**Endpoint:** `GET /connections`

**Request Options:**

**Option 1: Using session token (Recommended)**

```
Authorization: Bearer {session_token}
GET /connections
```

**Option 2: Using session_id (Legacy/Backward Compatible)**

```
GET /connections?session_id=kaysession_1234567890_abc123
```

**Response:**

```json
{
  "connections": {
    "jira": {
      "connected": true,
      "user": {
        "account_id": "557058:abc123...",
        "name": "John Doe",
        "email": "john@example.com",
        "picture": "https://...",
        "account_type": "atlassian",
        "account_status": "active"
      },
      "metadata": {
        "url": "https://example.atlassian.net"
      }
    },
    "confluence": {
      "connected": true,
      "user": {
        "account_id": "557058:abc123...",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "metadata": {
        "url": "https://example.atlassian.net"
      }
    },
    "bitbucket": {
      "connected": true,
      "user": {
        "account_id": "bitbucket_abc123",
        "username": "johndoe",
        "display_name": "John Doe",
        "avatar_url": "https://..."
      }
    },
    "kyg": {
      "connected": false
    }
  }
}
```

**Error Responses:**

**Invalid session_id:**

```json
{
  "error": "Invalid session_id",
  "message": "The provided session_id no longer exists. Please reconnect your services.",
  "session_reset_required": true
}
```

**Missing authentication:**

```json
{
  "error": "TOKEN_MISSING",
  "code": "TOKEN_MISSING",
  "message": "No Authorization header or invalid format"
}
```

**Actions:**

1. **Preferred**: Use `Authorization: Bearer {session_token}` header
2. **Fallback**: If no session token, use `session_id` query parameter
3. On `session_reset_required: true`, clear stored `session_id` and reconnect
   services

### Step 5: Disconnect a Service

**Endpoint:** `POST /connections/disconnect?service=jira`

**Request:**

```json
{
  "session_id": "kaysession_1234567890_abc123"
}
```

**Response:**

```json
{
  "service": "jira",
  "connected": false,
  "message": "Successfully disconnected from jira"
}
```

### Step 6: Token Refresh (When Session Expires)

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

### GET /connections

Get connection status and user information for all services. This replaces the
old `/auth/me` endpoint.

**Request:**

**Option 1: Using session token (Recommended)**

```
Authorization: Bearer {session_token}
GET /connections
```

**Option 2: Using session_id (Legacy)**

```
GET /connections?session_id={kay_session_id}
```

**Response:**

See
[Step 4: Check Connection Status & User Info](#step-4-check-connection-status--user-info)
above for the full response format.

**Key Features:**

- Returns user info for each connected service
- Shows connection status for all services
- Works with session tokens (preferred) or session_id (backward compatible)

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

export interface ConnectServiceResponse { service: string; session_id: string;
authorization_url: string; state: string; message: string; session_reset?:
boolean; }

export interface ServiceConnectionInfo { connected: boolean; user?: {
account_id?: string; name?: string; email?: string; username?: string;
display_name?: string; picture?: string; avatar_url?: string; account_type?:
string; account_status?: string; [key: string]: unknown; }; metadata?: { url?:
string; workspace_id?: string; [key: string]: unknown; }; }

export interface ConnectionStatusResponse { connections: { kyg:
ServiceConnectionInfo; jira: ServiceConnectionInfo; confluence:
ServiceConnectionInfo; bitbucket: ServiceConnectionInfo; }; }

export interface ConnectionStatusError { error: string; message: string;
session_reset_required: boolean; }

export interface StatusPendingResponse { status: "pending"; message: string; }

export interface StatusCompletedResponse { status: "completed"; account_id:
string; token: string; refresh_token: string; message: string; }

export type StatusResponse = StatusPendingResponse | StatusCompletedResponse;

export interface RefreshTokenResponse { token: string; refresh_token: string;
message: string; }

export interface MeResponse { message: string; data: { account_id: string; name:
string; email: string; picture: string; account_type: string; account_status:
string; resources: Array<{ id: string; url: string; name: string; scopes:
string[]; avatarUrl: string; }>; }; }

````

### Complete Implementation Example

```typescript
class KayAuth {
  private config: Config;
  private baseUrl = "http://localhost:4000";

  async connectService(
    service: "jira" | "confluence" | "bitbucket"
  ): Promise<void> {
    // Step 1: Get or create session_id
    let sessionId = this.config.get("session_id");
    const isFirstConnection = !sessionId;

    // Step 2: Get authorization URL
    const body = sessionId ? { session_id: sessionId } : {};
    const connectResponse = await fetch(
      `${this.baseUrl}/connections/connect?service=${service}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const response = await connectResponse.json() as ConnectServiceResponse;
    const { authorization_url, state, session_id, session_reset } = response;

    // Step 3: Store session_id (persistent)
    // Always update session_id from response (handles auto-recovery)
    if (session_id) {
      const oldSessionId = this.config.get("session_id");
      this.config.set("session_id", session_id);

      // Notify user if session was reset
      if (session_reset) {
        console.warn(
          "⚠️  Session was reset. Your old session_id is no longer valid. " +
          "A new session has been created and saved."
        );
      }
    }

    // Step 4: Open browser
    openBrowser(authorization_url);

    // Step 5: Poll for completion (only for first connection)
    if (isFirstConnection) {
      while (true) {
        const statusResponse = await fetch(
          `${this.baseUrl}/auth/status/${state}`
        );
        const status = await statusResponse.json();

        if (status.status === "completed") {
          // Store tokens (only on first connection)
          this.config.set("token", status.token);
          this.config.set("refresh_token", status.refresh_token);
          this.config.set("account_id", status.account_id);
          break;
        }

        await sleep(2000);
      }
    } else {
      // For subsequent connections, just wait a moment for callback to complete
      await sleep(3000);
    }
  }

  async getConnectionStatus(): Promise<Record<string, boolean>> {
    const sessionId = this.config.get("session_id");
    if (!sessionId) {
      return {
        kyg: false,
        jira: false,
        confluence: false,
        bitbucket: false,
      };
    }

    const response = await fetch(
      `${this.baseUrl}/connections?session_id=${sessionId}`
    );

    if (!response.ok) {
      const error = await response.json() as ConnectionStatusError;
      if (error.session_reset_required) {
        // Clear invalid session_id
        this.config.delete("session_id");
        throw new Error(
          "Session expired. Please reconnect your services using: kay connect <service>"
        );
      }
      throw new Error(error.message || "Failed to get connection status");
    }

    const { connections } = await response.json() as ConnectionStatusResponse;
    return connections;
  }

  async disconnectService(
    service: "jira" | "confluence" | "bitbucket"
  ): Promise<void> {
    const sessionId = this.config.get("session_id");
    if (!sessionId) {
      throw new Error("No session found. Please connect a service first.");
    }

    await fetch(`${this.baseUrl}/connections/disconnect?service=${service}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
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
````

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
  "session_id": "kaysession_1234567890_abc123",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "a1b2c3d4e5f6...",
  "account_id": "557058:abc123-def456-ghi789",
  "expires_at": 1709876543000
}
```

**Important:**

- `session_id` (kay_session_id) is persistent - store it locally and reuse it
  for all service connections
- `session_id` is only deleted when CLI is uninstalled
- `token` and `refresh_token` are refreshed periodically
- `account_id` is set on first service connection

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

1. **First Service Connection** → Receive `session_id` (persistent), `token` (30
   minutes) + `refresh_token` (7 days, max 30 days)
2. **Storage** → Save `session_id`, `token`, and `refresh_token` securely to
   local config file
3. **API Requests** → Use `token` in `Authorization: Bearer {token}` header
4. **Token Expires** → Receive 401 Unauthorized (happens every ~30 minutes)
5. **Auto-Refresh** → Call `/auth/refresh` with `refresh_token` → Get new tokens
6. **Token Rotation** → Save new `refresh_token` (old one is invalidated)
7. **Refresh Token Expires** → User must reconnect a service (which will create
   new tokens)
8. **Additional Services** → Use stored `session_id` to connect more services
   (no new tokens needed)

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

## Auto-Recovery for Invalid Session IDs

The backend automatically handles invalid `session_id` values to provide a
seamless experience:

### Endpoints That Handle Invalid Session IDs

#### 1. `POST /connections/connect?service={service}` ⚡ **Auto-Recovery**

**Behavior:** Automatically creates a new session if the provided `session_id`
is invalid.

**Response with Auto-Recovery:**

```json
{
  "service": "jira",
  "session_id": "kaysession_NEW_SESSION_ID",
  "authorization_url": "https://auth.atlassian.com/authorize?...",
  "state": "abc123...",
  "message": "New session created. Please visit the authorization URL to connect jira",
  "session_reset": true
}
```

**CLI Action:** Always update your stored `session_id` with the value returned
in the response.

#### 2. `GET /connections?session_id={session_id}` ❌ **Error Response**

**Behavior:** Returns an error if the `session_id` is invalid (does not
auto-recover).

**Error Response:**

```json
{
  "error": "Invalid session_id",
  "message": "The provided session_id no longer exists. Please reconnect your services.",
  "session_reset_required": true
}
```

**CLI Action:**

1. Clear the stored `session_id` from local config
2. Prompt user to reconnect services
3. Call `/connections/connect` without a `session_id` to create a new session

#### 3. `POST /connections/disconnect?service={service}` ❌ **Error Response**

**Behavior:** Returns an error if the `session_id` is invalid (does not
auto-recover).

**Error Response:**

```json
{
  "error": "Invalid session_id",
  "message": "The provided session_id no longer exists. Please reconnect your services.",
  "session_reset_required": true
}
```

**CLI Action:** Same as above - clear session_id and prompt user to reconnect.

### How It Works

1. **Automatic Recovery** (Connect Endpoint Only): When you call
   `/connections/connect` with an invalid `session_id`, the backend
   automatically creates a new session instead of returning an error.

2. **Session Reset Flag**: The response includes `session_reset: true` when a
   new session was created due to an invalid one.

3. **Always Update Session ID**: Always update your stored `session_id` with the
   value returned in the response, even if you didn't expect it to change.

### When Sessions Become Invalid

- Database was reset or deleted
- Session was manually deleted from the database
- Session expired (though this is rare, as sessions are persistent)
- Database corruption or migration issues

### Implementation Best Practices

```typescript
// Always check for session_reset flag
const response = await connectService(service);

if (response.session_reset) {
  // Update stored session_id
  config.set("session_id", response.session_id);
  // Optionally notify user
  console.warn("Session was reset. New session created.");
}

// Always update session_id from response
// This ensures you have the latest valid session
config.set("session_id", response.session_id);
```

### Error Handling

If you receive an error with `session_reset_required: true` (e.g., from
`/connections` endpoint):

1. Clear the stored `session_id` from local config
2. Prompt user to reconnect: "Your session has expired. Please reconnect your
   services."
3. Call `/connections/connect` without a `session_id` to create a new session

## Important Notes

- **No separate login endpoint** - Authentication happens through service
  connections
- **First service connection** creates user account and session tokens
- **Subsequent service connections** use existing `session_id` and don't require
  polling
- **Session ID (kay_session_id)** is persistent - store it locally and reuse for
  all service connections
- **Auto-recovery** - Backend automatically creates new sessions if the provided
  one is invalid
- **Always update session_id** - Always save the `session_id` returned from
  `/connections/connect`, even if it matches what you sent
- **Session tokens expire in 30 minutes** - Much shorter than typical auth
  systems, so auto-refresh is critical
- **Refresh tokens last 7 days** (max 30 days) - Ensures users don't need to
  re-authenticate too frequently
- **Always implement auto-refresh** - Users should never see 401 errors; refresh
  should happen transparently
- **Token rotation** - Each refresh returns a new refresh_token; always save it
  to replace the old one
- **Store session_id, token, and refresh_token securely** - All three must be
  saved
- **File permissions** - Set config file to `600` (owner read/write only) for
  security
- **Never commit tokens** - Add config file to `.gitignore`
- **Proactive refresh** - Consider refreshing tokens before they expire (e.g., 5
  minutes before)
- **State expires in 10 minutes** - If user takes too long, restart connection
  flow

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

- [ ] Implement `POST /connections/connect?service={service}` endpoint call
- [ ] Store `session_id` (kay_session_id) persistently in local config
- [ ] Extract `authorization_url` and `state` from response
- [ ] Open `authorization_url` in user's browser
- [ ] Display "Waiting for authorization..." message
- [ ] For first connection: Poll `GET /auth/status/:state` every 2-3 seconds
- [ ] Handle pending status (continue polling)
- [ ] Handle completed status (save `session_id`, `token`, `refresh_token`, stop
      polling)
- [ ] For subsequent connections: Use existing `session_id`, no polling needed
- [ ] Store `session_id`, `token`, and `refresh_token` securely
- [ ] Implement `GET /connections?session_id={session_id}` to check status
- [ ] Implement `POST /connections/disconnect?service={service}` to disconnect
- [ ] Implement `POST /auth/refresh` endpoint call
- [ ] Add automatic token refresh in API request handler (on 401)
- [ ] Update TypeScript types to include `session_id` and `refresh_token`
- [ ] Handle refresh token expiration (prompt user to reconnect a service)
- [ ] Implement `POST /ask` endpoint with all three modes
- [ ] Implement `POST /ask/confirm` for confirmation flow
- [ ] Handle interactive session management (store `session_id`)
- [ ] Test first service connection flow
- [ ] Test additional service connection flow
- [ ] Test one-shot requests
- [ ] Test confirmation flow
- [ ] Test interactive conversation with multiple turns
- [ ] Test error handling
