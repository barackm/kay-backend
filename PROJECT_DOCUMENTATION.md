# Kay Backend - Complete Project Documentation

A comprehensive guide explaining everything that has been implemented in the Kay
Backend, from authentication to AI-powered Jira interactions.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Authentication System](#authentication-system)
4. [Database](#database)
5. [API Endpoints](#api-endpoints)
6. [AI Integration](#ai-integration)
7. [MCP (Model Context Protocol) Integration](#mcp-model-context-protocol-integration)
8. [Environment Variables](#environment-variables)
9. [How Everything Works Together](#how-everything-works-together)

---

## Project Overview

**Kay Backend** is a TypeScript backend service built with the Hono framework.
It serves as the backend for the Kay CLI application, providing:

- **Authentication** with Atlassian (Jira/Confluence) via OAuth 2.0
- **AI-powered assistance** using OpenAI to help users interact with Jira
- **Tool integration** through MCP (Model Context Protocol) to execute Jira
  operations
- **Session management** with secure token-based authentication

---

## Architecture

The project follows a clean, modular structure:

```
src/
├── config/          # Configuration (environment variables)
├── constants/       # Constants (MCP tool definitions)
├── middleware/      # Request middleware (authentication)
├── routes/          # API route handlers
├── services/        # Business logic services
│   ├── oauth/       # OAuth-related services
│   ├── mcp/         # MCP client and services
│   ├── connections/ # Service connection management
│   ├── database/    # Database and data storage
│   ├── ai/          # AI-related services (OpenAI, prompts, ask)
│   └── auth/        # Authentication and token services
├── types/           # TypeScript type definitions
├── utils/           # Helper functions
├── templates/       # HTML templates
└── prompts/         # AI prompt templates
```

### Key Components:

1. **Routes** (`src/routes/`): Handle HTTP requests
2. **Services** (`src/services/`): Organized by domain (oauth, mcp, connections,
   database, ai, auth)
3. **Middleware** (`src/middleware/`): Process requests before they reach routes
4. **Database** (`src/services/database/`): SQLite database setup and data
   storage
5. **Config** (`src/config/env.ts`): Environment variable management

---

## Authentication System

### Overview

The authentication system uses a **service connection** model where users
connect third-party services (Jira, Confluence, Bitbucket, etc.) individually
via OAuth 2.0. There is no separate "login" endpoint - authentication happens
through service connections.

### How Service Connection Works

#### Step 1: User Connects First Service (New Installation)

When a user connects their first service (e.g., `kay connect jira`):

1. CLI sends: `POST /connections/connect?service=jira` with empty body `{}`
2. Backend creates a new `kay_session` with `account_id = NULL`
3. Backend responds with:
   - `session_id` (kay_session_id) - persistent identifier
   - An authorization URL (Atlassian login page)
   - A unique `state` token (for security)

#### Step 2: User Authorizes in Browser

1. CLI opens the authorization URL in the user's browser
2. User logs in with their Atlassian account
3. User grants permissions to the Kay app
4. Atlassian redirects back to:
   `GET /connections/oauth/callback?service=jira&code=...&state=...`

#### Step 3: Backend Exchanges Code for Tokens

The callback endpoint:

1. Validates the `state` token (prevents CSRF attacks)
2. Retrieves `kay_session_id` and `service_name` from stored state
3. Exchanges the `code` for access and refresh tokens from Atlassian
4. Fetches user information (name, email, account ID)
5. Gets accessible Jira resources (instances the user can access)
6. Detects this is the first connection (`kay_session.account_id === NULL`)
7. Updates `kay_session.account_id` with the user's account ID
8. Creates `cli_session` with `session_token` and `refresh_token`
9. Stores connection in `connections` table
10. Completes OAuth state with `account_id`
11. Shows a success page in the browser

#### Step 4: CLI Gets Session Tokens (First Connection Only)

The CLI polls `GET /auth/status/:state` until authentication completes:

1. **While pending**: Returns `status: "pending"`
2. **When complete**: Returns:
   - `account_id`: User's Atlassian account ID
   - `token`: Session token (valid for 30 minutes)
   - `refresh_token`: Refresh token (valid for 7 days)

**Actions:**

- Store `session_id` (kay_session_id) persistently
- Store `token` and `refresh_token` securely
- Store `account_id` for reference

#### Step 5: Connect Additional Services

When connecting additional services:

1. CLI sends: `POST /connections/connect?service=confluence` with
   `{ "session_id": "..." }`
2. Backend validates the existing `kay_session`
3. Backend initiates OAuth flow (same as Step 2)
4. On callback, backend detects this is NOT the first connection
5. Backend only stores the new connection (no new tokens created)
6. **No polling needed** - CLI already has tokens from first connection

#### Step 6: Using Session Tokens

All protected API requests include the session token in the header:

```
Authorization: Bearer {session_token}
```

The middleware validates the token and attaches user information to the request.

### Token Types

1. **Session Token** (JWT)

   - Expires in 30 minutes
   - Used for all API requests
   - Contains: `account_id`, `expires_at`

2. **Refresh Token** (Random hex string)

   - Expires in 7 days
   - Used to get a new session token when it expires
   - Stored securely in the database

3. **Atlassian Access Token** (OAuth)
   - Used to make API calls to Jira/Confluence
   - Automatically refreshed when expired
   - Stored in the database per user

### Security Features

- **State token**: Prevents CSRF attacks during OAuth flow
- **Token expiration**: Short-lived session tokens (30 min)
- **Token rotation**: Refresh tokens are rotated on each use
- **Secure storage**: All tokens stored in SQLite database

---

## Database

### Overview

The project uses **SQLite** (via `better-sqlite3`) to store:

- User account information
- Atlassian OAuth tokens
- CLI sessions
- Interactive chat sessions
- Pending confirmations

### Database Schema

#### 1. `users` Table

Stores basic user information:

```sql
- account_id (PRIMARY KEY): Atlassian account ID
- created_at: When account was created
- updated_at: Last update timestamp
```

#### 2. `atlassian_tokens` Table

Stores OAuth tokens for each user:

```sql
- account_id (PRIMARY KEY): Links to users table
- access_token: Atlassian OAuth access token
- refresh_token: OAuth refresh token
- expires_at: When access token expires (milliseconds)
- created_at: Creation timestamp
- updated_at: Last update timestamp
```

#### 3. `accessible_resources` Table

Stores Jira/Confluence instances each user can access:

```sql
- id (PRIMARY KEY): Auto-incrementing ID
- account_id: Links to users table
- resource_id: Atlassian resource ID
- resource_url: URL of the resource (e.g., https://company.atlassian.net)
- resource_name: Name of the resource
- created_at: Creation timestamp
```

#### 4. `atlassian_user_info` Table

Stores user profile information from Atlassian:

```sql
- account_id (PRIMARY KEY): Links to users table
- name: User's display name
- email: User's email address
- picture: Profile picture URL
- account_type: Type of account
- account_status: Account status
- created_at: Creation timestamp
- updated_at: Last update timestamp
```

#### 5. `cli_sessions` Table

Stores active CLI sessions:

```sql
- id (PRIMARY KEY): Auto-incrementing ID
- account_id: Links to users table
- session_token: JWT session token
- refresh_token: Refresh token for this session
- expires_at: When session expires (milliseconds)
- refresh_expires_at: When refresh token expires (milliseconds)
- created_at: Creation timestamp
```

#### 6. `interactive_sessions` Table

Stores multi-turn AI conversation sessions:

```sql
- session_id (PRIMARY KEY): Unique session ID
- account_id: Links to users table
- history: JSON array of conversation messages
- created_at: Creation timestamp
- updated_at: Last update timestamp
```

#### 7. `pending_confirmations` Table

Stores actions waiting for user confirmation:

```sql
- confirmation_token (PRIMARY KEY): Unique confirmation token
- account_id: Links to users table
- context: JSON object with request details
- created_at: Creation timestamp
- expires_at: When confirmation expires (milliseconds)
```

### Database Features

- **Automatic creation**: Tables are created automatically on first run
- **Foreign keys**: Enforced relationships between tables
- **WAL mode**: Write-Ahead Logging for better performance and safety
- **Cascade deletion**: When a user is deleted, all related data is removed

---

## API Endpoints

### Public Endpoints (No Authentication)

#### `GET /`

Health check endpoint.

**Response:**

```json
{
  "message": "Kay Backend running ✅"
}
```

#### `POST /connections/connect?service={service}`

Initiates OAuth flow for connecting a service.

**Request:**

```json
{
  "session_id": "kaysession_123..." // Optional: existing kay_session_id
}
```

**Response:**

```json
{
  "service": "jira",
  "session_id": "kaysession_1234567890_abc123",
  "authorization_url": "https://auth.atlassian.com/authorize?...",
  "state": "abc123...",
  "message": "Please visit the authorization URL to connect jira"
}
```

#### `GET /connections/oauth/callback?service={service}&code=...&state=...`

OAuth callback endpoint (called by OAuth provider).

- Validates the state token
- Retrieves `kay_session_id` and `service_name` from state
- Exchanges code for tokens
- Stores connection in database
- If first connection: Creates user account and CLI session tokens
- Shows success page in browser

#### `GET /connections?session_id={kay_session_id}`

Get connection status for all services.

**Response:**

```json
{
  "connections": {
    "kyg": false,
    "jira": true,
    "confluence": true,
    "bitbucket": false
  }
}
```

#### `POST /connections/disconnect?service={service}`

Disconnect a service.

**Request:**

```json
{
  "session_id": "kaysession_123..."
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

#### `GET /auth/status/:state`

Poll this endpoint to check if authentication completed.

**While pending:**

```json
{
  "status": "pending",
  "message": "Authorization not yet completed"
}
```

**When complete:**

```json
{
  "status": "completed",
  "account_id": "557058:abc123...",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "a1b2c3d4e5f6...",
  "message": "Authorization completed successfully"
}
```

#### `GET /health`

System health check (requires authentication).

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00Z",
  "services": {
    "database": { "status": "healthy" },
    "openai": { "status": "healthy", "configured": true },
    "mcp_jira": {
      "status": "healthy",
      "enabled": true,
      "connected": true,
      "toolCount": 6
    }
  }
}
```

### Protected Endpoints (Require Authentication)

All protected endpoints require the `Authorization: Bearer {token}` header.

#### `POST /auth/refresh`

Refresh an expired session token.

**Request:**

```json
{
  "refresh_token": "a1b2c3d4e5f6..."
}
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "f6e5d4c3b2a1...",
  "message": "Token refreshed successfully"
}
```

#### `GET /auth/me`

Get current user information.

**Response:**

```json
{
  "message": "User information",
  "data": {
    "account_id": "557058:abc123...",
    "name": "John Doe",
    "email": "john@example.com",
    "picture": "https://...",
    "resources": [...]
  }
}
```

#### `POST /auth/logout`

Logout and invalidate session.

**Response:**

```json
{
  "message": "Logged out successfully"
}
```

#### `POST /ask`

Ask Kay AI a question or request an action.

**Request:**

```json
{
  "prompt": "List all tickets in project KAN",
  "interactive": false,
  "confirm": false
}
```

**Response:**

```json
{
  "status": "completed",
  "message": "Here are the tickets...",
  "data": {
    "prompt": "List all tickets...",
    "response": "...",
    "toolCalls": [...]
  }
}
```

**Modes:**

- **One-shot**: `interactive: false, confirm: false` - Simple Q&A
- **Interactive**: `interactive: true` - Multi-turn conversation
- **Confirmation**: `confirm: true` - Requires user approval before executing

#### `POST /ask/confirm`

Confirm or cancel a pending action.

**Request:**

```json
{
  "confirmation_token": "confirm_1234567890_abc123",
  "approved": true
}
```

**Response:**

```json
{
  "status": "completed",
  "message": "Action confirmed and executed successfully",
  "data": {...}
}
```

#### `GET /mcp/status`

Get MCP Jira service status and available tools.

**Response:**

```json
{
  "enabled": true,
  "connected": true,
  "initialized": true,
  "toolCount": 6,
  "tools": [
    { "name": "jira_search", "description": "..." },
    ...
  ]
}
```

---

## AI Integration

### Overview

The backend integrates with **OpenAI** to provide intelligent responses and
execute Jira operations. The AI can:

- Answer questions about Jira
- Execute Jira operations (create tickets, search, update, etc.)
- Maintain conversation context
- Use tools to interact with Jira directly

### How It Works

#### 1. Prompt Processing

When a user sends a request to `/ask`:

1. The request is validated and authenticated
2. The system prompt is loaded (from `prompts/system.md` or
   `prompts/interactive.md`)
3. User information and available tools are added to the prompt
4. The prompt is sent to OpenAI

#### 2. Tool Calling

The AI can call MCP tools to execute Jira operations:

1. AI decides it needs to call a tool (e.g., `jira_search`)
2. OpenAI returns a tool call request
3. Backend executes the tool via MCP
4. Tool result is sent back to OpenAI
5. AI generates final response using tool results

#### 3. Conversation Modes

**One-Shot Mode:**

- Single question and answer
- No conversation history stored
- Fast response time

**Interactive Mode:**

- Multi-turn conversation
- Full conversation history maintained
- Session stored in database
- Context preserved across messages

**Confirmation Mode:**

- AI prepares an action but doesn't execute it
- Returns a confirmation token
- User approves/cancels via `/ask/confirm`
- Action is executed only after approval

### Prompts

Prompts are stored in Markdown files:

- `prompts/system.md`: System prompt for one-shot requests
- `prompts/interactive.md`: System prompt for interactive conversations

Prompts include:

- Information about Kay (AI assistant from KYG Trade)
- User's information (name, email, accessible Jira projects)
- Available tools and how to use them
- Instructions on when to use tools vs. just answering

---

## MCP (Model Context Protocol) Integration

### Overview

**MCP (Model Context Protocol)** is a standard way for AI applications to
interact with external tools. We use it to connect to Jira/Confluence through an
MCP server.

### How MCP Works

1. **MCP Server**: A Docker container (`ghcr.io/sooperset/mcp-atlassian:latest`)
   that provides Jira tools
2. **MCP Client**: Our TypeScript client that connects to the server
3. **Tools**: Functions the server exposes (e.g., `jira_search`,
   `jira_create_issue`)

### Connection Process

1. Backend starts MCP server as a Docker container
2. MCP client connects to server via stdio (standard input/output)
3. Client discovers available tools
4. Tools are made available to OpenAI
5. When AI wants to use a tool, backend calls it through MCP

### Available Tools

The MCP server provides many Jira tools:

**Read Operations:**

- `jira_search` - Search issues using JQL
- `jira_get_issue` - Get issue details
- `jira_get_all_projects` - List all projects
- `jira_get_project_issues` - Get issues in a project
- And many more...

**Write Operations:**

- `jira_create_issue` - Create a new issue
- `jira_update_issue` - Update an issue
- `jira_add_comment` - Add a comment
- `jira_transition_issue` - Move issue to different status
- And many more...

**Disabled by Default:**

- `jira_delete_issue` - Delete an issue (disabled for safety)
- `confluence_delete_page` - Delete a Confluence page (disabled for safety)

### Tool Filtering

Tools can be filtered using the `MCP_JIRA_DISABLED_TOOLS` environment variable:

```bash
MCP_JIRA_DISABLED_TOOLS=jira_batch_create_issues,jira_create_sprint
```

This will disable those specific tools while keeping all others enabled.

### Authentication

The MCP server uses OAuth 2.0 (BYOT - Bring Your Own Token):

- Each user's Atlassian access token is passed to the MCP server
- The server uses that token to make API calls on behalf of the user
- Tokens are automatically refreshed when expired

---

## Environment Variables

### Required Variables

```bash
# Server Configuration
PORT=4000

# Atlassian OAuth
ATLASSIAN_CLIENT_ID=your_client_id
ATLASSIAN_CLIENT_SECRET=your_client_secret
ATLASSIAN_CALLBACK_URL=http://localhost:4000/connections/oauth/callback
BITBUCKET_CALLBACK_URL=http://localhost:4000/connections/oauth/callback

# OpenAI
OPENAI_API_KEY=your_openai_api_key
```

### Optional Variables

```bash
# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# Session Configuration
CLI_SESSION_EXPIRES_IN=30m
CLI_REFRESH_TOKEN_EXPIRES_IN=7d

# OpenAI Configuration
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.7

# MCP Jira Configuration
MCP_JIRA_ENABLED=true
MCP_JIRA_COMMAND=docker
MCP_JIRA_ARGS=run,--rm,-i,ghcr.io/sooperset/mcp-atlassian:latest
MCP_JIRA_DISABLED_TOOLS=jira_delete_issue,confluence_delete_page
```

### Environment Variable Descriptions

- **PORT**: Server port (default: 4000)
- **ATLASSIAN_CLIENT_ID/SECRET**: OAuth app credentials from Atlassian
- **ATLASSIAN_CALLBACK_URL**: OAuth callback URL for Atlassian services (Jira,
  Confluence)
- **BITBUCKET_CALLBACK_URL**: OAuth callback URL for Bitbucket service
- **OPENAI_API_KEY**: OpenAI API key for AI features
- **JWT_SECRET**: Secret for signing JWT tokens
- **CLI_SESSION_EXPIRES_IN**: How long session tokens last (default: 30m)
- **CLI_REFRESH_TOKEN_EXPIRES_IN**: How long refresh tokens last (default: 7d)
- **OPENAI_MODEL**: Which OpenAI model to use (default: gpt-4o-mini)
- **MCP_JIRA_ENABLED**: Enable/disable MCP Jira integration
- **MCP_JIRA_COMMAND**: Command to run MCP server (default: docker)
- **MCP_JIRA_ARGS**: Arguments for MCP server command
- **MCP_JIRA_DISABLED_TOOLS**: Comma-separated list of tools to disable

---

## How Everything Works Together

### Complete Request Flow Example

**User asks: "Create a ticket in project KAN with title 'Fix login bug'"**

1. **CLI sends request:**

   ```
   POST /ask
   Authorization: Bearer {session_token}
   {
     "prompt": "Create a ticket in project KAN with title 'Fix login bug'",
     "interactive": false,
     "confirm": false
   }
   ```

2. **Authentication middleware:**

   - Validates session token
   - Loads user's Atlassian tokens
   - Fetches user's accessible Jira projects
   - Attaches user info to request context

3. **Ask service:**

   - Loads system prompt
   - Adds user info and available tools to prompt
   - Sends prompt to OpenAI

4. **OpenAI decides to use tool:**

   - Returns: "I need to call jira_create_issue"

5. **Backend executes tool:**

   - Connects to MCP server (if not connected)
   - Calls `jira_create_issue` with project="KAN", summary="Fix login bug"
   - MCP server makes API call to Jira
   - Returns created ticket details

6. **OpenAI generates response:**

   - Receives tool result
   - Generates user-friendly response: "I've created ticket KAN-123..."

7. **Response sent to CLI:**
   ```json
   {
     "status": "completed",
     "message": "I've created ticket KAN-123: Fix login bug",
     "data": {
       "toolCalls": [...],
       "response": "..."
     }
   }
   ```

### Data Flow Diagram

```
CLI
  ↓ (HTTP Request)
Backend (Hono)
  ↓ (Middleware)
Authentication
  ↓ (Validates token, loads user data)
Route Handler
  ↓ (Business logic)
Service Layer
  ↓ (AI/Tools)
OpenAI ↔ MCP Client ↔ MCP Server ↔ Jira API
  ↓ (Response)
Backend → CLI
```

### Key Concepts Summary

1. **Authentication**: OAuth 2.0 with Atlassian, session tokens for API access
2. **Database**: SQLite stores users, tokens, sessions, conversations
3. **AI**: OpenAI provides intelligent responses and tool selection
4. **Tools**: MCP enables Jira operations through standardized protocol
5. **Sessions**: Interactive conversations maintain context
6. **Security**: Token expiration, refresh tokens, CSRF protection

---

## Summary

Kay Backend is a complete system that:

✅ Authenticates users with Atlassian OAuth  
✅ Stores user data and tokens securely  
✅ Provides AI-powered assistance using OpenAI  
✅ Executes Jira operations through MCP  
✅ Supports interactive conversations with context  
✅ Handles confirmations for sensitive operations  
✅ Manages sessions and token refresh  
✅ Provides health monitoring

Everything is modular, type-safe (TypeScript), and follows best practices for
security and performance.
