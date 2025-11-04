# Authentication Middleware Explanation

We have **2 authentication middlewares** for different use cases:

## 1. `sessionAuthMiddleware()` - Basic Session Validation

**Location:** `src/middleware/session-auth.ts`

**Purpose:** Validates session tokens for routes that don't need service-specific credentials.

**What it does:**
- Validates `Authorization: Bearer {session_token}` header
- Verifies JWT token signature and expiration
- Checks if session exists in database
- Sets context: `session_token`, `account_id`, `session_payload`

**Used by:**
- `GET /connections` - Just needs to know which session to check
- `DELETE /session/revoke` - Just needs session token validation
- Any route that needs session validation but NOT service tokens

**Returns:** 401/403 errors with `ErrorCode` enum

## 2. `authMiddleware()` - Full Authentication with Service Tokens

**Location:** `src/middleware/auth.ts`

**Purpose:** Full authentication that requires Atlassian tokens and user context.

**What it does:**
- Validates session token (same as `sessionAuthMiddleware`)
- Fetches Atlassian tokens from database
- Fetches Jira projects and Confluence spaces (cached)
- Sets context: `user`, `atlassian_tokens`, `jira_projects`, `confluence_spaces`

**Used by:**
- `POST /ask` - Needs user context and service tokens for AI tool calls
- `POST /ask/confirm` - Needs user context
- `GET /health` - Needs tokens to test MCP connection
- `GET /mcp/status` - Needs tokens to check MCP status
- `POST /auth/logout` - Needs tokens to clean up

**Returns:** 401/403 errors with `ErrorCode` enum

## Why Two Middlewares?

**Separation of concerns:**
- Some routes only need session validation (`/connections`, `/session/revoke`)
- Some routes need full user context with service tokens (`/ask`, `/health`, `/mcp`)

**Performance:**
- `sessionAuthMiddleware()` is lightweight (no API calls)
- `authMiddleware()` does more work (fetches tokens, caches spaces)

**Error Handling:**
- Both return standardized `ErrorCode` responses
- Both use 401 for authentication errors (not 404)

## When to Use Which?

**Use `sessionAuthMiddleware()` when:**
- Route only needs to know "who is this session?"
- Route doesn't need service-specific tokens
- Route just checks connection status

**Use `authMiddleware()` when:**
- Route needs to call service APIs (Jira, Confluence, etc.)
- Route needs user context (`user`, `atlassian_tokens`)
- Route needs to access MCP tools

## Error Response Format

Both middlewares return standardized errors:

```typescript
{
  error: ErrorCode.TOKEN_MISSING | ErrorCode.TOKEN_INVALID | ErrorCode.TOKEN_EXPIRED,
  code: ErrorCode,
  message: string,
  details?: string
}
```

**Status Codes:**
- `401` - Authentication required or expired
- `403` - Token invalid/revoked/tampered

**Frontend should:**
- Catch 401 errors → refresh token or re-authenticate
- Catch 403 errors → clear tokens and prompt re-login
- Never use 404 for authentication errors

