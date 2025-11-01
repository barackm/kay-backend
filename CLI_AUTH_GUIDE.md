# CLI Authentication Guide for Kay Backend

This guide explains how the CLI agent should handle authentication with the Kay
backend server using Atlassian OAuth 2.0 (3-Legged OAuth flow).

## Authentication Flow Overview

The authentication process involves three main steps:

1. **Initiate Login** - Request authorization URL from backend
2. **User Authorization** - Open browser for user to grant permissions
3. **Poll for Completion** - Check when authentication completes and receive
   session token

## Step-by-Step Instructions

### Step 1: Initiate Login

**Endpoint:** `GET /auth/login`

**Request:**

```bash
curl http://localhost:4000/auth/login
```

**Expected Response (200 OK):**

```json
{
  "message": "Please visit the URL below to authorize",
  "authorization_url": "https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=...&scope=read:me%20read:jira-work%20read:jira-user&redirect_uri=http://localhost:4000/auth/callback&state=abc123...&response_type=code&prompt=consent",
  "state": "abc123def456..."
}
```

**Actions Required:**

1. Extract the `authorization_url` from the response
2. Extract and store the `state` value (you'll need it for polling)
3. Open the `authorization_url` in the user's default browser
   - macOS: `open {authorization_url}`
   - Linux: `xdg-open {authorization_url}`
   - Windows: `start {authorization_url}`
4. Display a message to the user: "Please authorize in your browser. Waiting for
   authorization..."

### Step 2: Poll for Authentication Completion

**Endpoint:** `GET /auth/status/:state`

**Request:** Replace `{state}` with the state value received in Step 1.

```bash
curl http://localhost:4000/auth/status/{state}
```

**Expected Responses:**

**While Pending (200 OK):**

```json
{
  "status": "pending",
  "message": "Authorization not yet completed"
}
```

**When Completed (200 OK):**

```json
{
  "status": "completed",
  "account_id": "557058:abc123-def456-ghi789",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2NvdW50X2lkIjoiNTU3MDU4OmFiYzEyMy1kZWY0NTYtZ2hpNzg5IiwiaWF0IjoxNzA5ODc2NTQzLCJleHAiOjE3MTA0ODEzNDN9...",
  "message": "Authorization completed successfully. Use the token in Authorization header for future requests."
}
```

**Error Responses:**

- `400 Bad Request` - Missing or invalid state parameter
- `500 Internal Server Error` - Server error

**Actions Required:**

1. Poll the status endpoint every 2-3 seconds
2. Continue polling while `status === "pending"`
3. When `status === "completed"`:
   - Extract and securely store the `token` (this is a JWT session token)
   - Extract and store the `account_id` for reference
   - Display success message to user
   - Stop polling
4. Handle timeout: If polling exceeds 5 minutes (300 seconds), abort and show
   error message

### Step 3: Using the Token for Authenticated Requests

Once you have the token, include it in all subsequent API requests:

**Header Format:**

```
Authorization: Bearer {token}
```

**Example Request:**

```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
     http://localhost:4000/api/some-endpoint
```

**Token Details:**

- **Type:** JWT (JSON Web Token)
- **Expiration:** 30 days from issuance
- **Stored in:** Backend associates this token with the user's Atlassian account
- **Validation:** Backend validates token on every request and loads associated
  OAuth tokens

## Error Handling

### Common Errors and Responses

1. **Missing Authorization Code (400)**

   ```json
   {
     "error": "Missing authorization code"
   }
   ```

   **Action:** Retry the login flow from Step 1

2. **Invalid State (400)**

   ```json
   {
     "error": "Invalid or expired state parameter"
   }
   ```

   **Action:** State expired (10 minute timeout). Restart login from Step 1

3. **OAuth Flow Failure (500)**

   ```json
   {
     "error": "Failed to complete OAuth flow",
     "details": "Jira API error: ..."
   }
   ```

   **Action:** Display error to user, suggest retrying login

4. **Invalid Token (401)**
   ```json
   {
     "error": "Unauthorized: Invalid or expired token"
   }
   ```
   **Action:** Token expired. User must re-authenticate (go to Step 1)

## Implementation Checklist

- [ ] Call `GET /auth/login` and parse JSON response
- [ ] Extract `authorization_url` and `state` from response
- [ ] Open `authorization_url` in user's browser
- [ ] Display "Waiting for authorization..." message
- [ ] Poll `GET /auth/status/:state` every 2-3 seconds
- [ ] Handle pending status (continue polling)
- [ ] Handle completed status (save token, stop polling)
- [ ] Handle errors appropriately
- [ ] Implement timeout (5 minutes max)
- [ ] Store token securely (local config file, encrypted if possible)
- [ ] Include token in `Authorization: Bearer {token}` header for all
      authenticated requests
- [ ] Handle 401 errors by prompting for re-authentication

## Example CLI Flow

```
$ kay login
🔄 Initiating authentication...
📋 Please authorize in your browser.
⏳ Waiting for authorization...
✅ Authentication successful!
💾 Token saved. You're now logged in.
```

## Notes

- The `state` parameter is used for CSRF protection and expires after 10 minutes
- The session token expires after 30 days; users will need to re-authenticate
- The backend stores Atlassian OAuth tokens internally; the CLI only needs the
  session token
- All authenticated endpoints require the `Authorization: Bearer {token}` header
- The `account_id` identifies the Atlassian account but is not needed for API
  requests (token contains it)
