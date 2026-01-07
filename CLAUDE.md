# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Application
- `pnpm dev` - Run the development server with hot reload (uses tsx watch)
- `pnpm seed` - Seed the database using Prisma

### Database Management
- `npx prisma migrate dev` - Create and apply a new migration
- `npx prisma migrate deploy` - Apply migrations in production
- `npx prisma studio` - Open Prisma Studio for database inspection
- `npx prisma generate` - Generate Prisma Client (output: `generated/prisma`)

### TypeScript
- `npx tsc --noEmit` - Type check without building

## Architecture Overview

### Core Purpose
Kay Backend is an MCP (Model Context Protocol) client that bridges OpenAI's chat completions with multiple MCP servers. It manages user-specific MCP server connections and enables AI-powered tool calling through authenticated sessions.

### Key Architectural Patterns

**1. User-Scoped MCP Server Registry**
- The `MCPServerRegistry` (src/services/mcp/server-registry.ts) maintains a nested Map structure: `userId -> serverName -> MCPClient`
- Each user has isolated MCP server connections - no connection sharing between users
- Server credentials are stored encrypted in the database per user via `UserServerCredential`

**2. Authentication Flow**
- Uses external KYG API for token verification
- On each request, `authMiddleware` verifies the Bearer token with KYG
- User records are automatically upserted based on KYG response
- The authenticated user is injected into Hono context: `c.get('user')`

**3. MCP-to-OpenAI Tool Bridging**
- MCP servers expose tools through the Model Context Protocol SDK
- Tools from all connected MCP servers are aggregated per user
- Tool names are prefixed with server name: `{serverName}_{toolName}`
- Tool schemas are converted from MCP format to OpenAI function calling format
- The chat service handles tool calls by routing to the appropriate MCP server

**4. Path Resolution Strategy**
- MCP servers can be specified as npm packages, relative paths, or absolute paths
- Resolution order: direct path → `node_modules/{name}/dist/index.js` → `node_modules/{name}/index.js` → `node_modules/{name}/build/index.js` → sibling directories
- Hardcoded mappings in `SERVER_MAPPINGS` for common servers

### Database Schema
- **User**: Maps external KYG users to internal user IDs
- **McpServer**: Registry of available MCP servers (npm packages or local paths)
- **UserServerCredential**: Stores encrypted environment variables per user per server
- Prisma client is generated to `generated/prisma` (not default location)

### Request Flow Example
1. Client sends Bearer token in Authorization header
2. `authMiddleware` validates token with KYG API and upserts user
3. For `/chat` requests, the system:
   - Retrieves all MCP servers connected for that user
   - Fetches available tools from each connected server
   - Formats tools as OpenAI function definitions
   - Streams chat responses with automatic tool execution
   - When OpenAI calls a tool, parses `{serverName}_{toolName}` to route to correct MCP client

### Environment Variables
Required variables (see [src/config/env.ts](src/config/env.ts)):
- `DATABASE_URL` - PostgreSQL connection string
- `KYG_API_BASE_URL` - External auth API
- `OPENAI_API_KEY` - OpenAI API key
- `PORT` - Server port (default: 3000)
- `ENCRYPTION_KEY` - For encrypting user credentials (optional, 32+ chars)
- `API_BASE_URL` - Passed to MCP servers (optional)
- `BEARER_TOKEN` - Passed to MCP servers (optional)

### Special Considerations
- This codebase uses ES modules (`"type": "module"` in package.json) with `.js` extensions in imports
- The server uses Hono framework (not Express) with Node.js adapter
- MCP clients communicate via stdio transport (spawning Node.js child processes)
- **MCP Connections are persistent** - they remain open for the user's session, not recreated per request
- Streaming chat responses use Server-Sent Events (SSE) format
- **Non-streaming mode (`interactive=false`)** supports multi-round tool calling (up to 5 iterations) - use for write operations
- **Streaming mode (`interactive=true`)** executes tools but doesn't feed results back to AI - best for read-only operations

### AI Tool Calling Behavior
The chat endpoint supports two modes:
- **Non-streaming** (`/ask?interactive=false`): Allows multi-round tool calling where the AI can see tool results and make follow-up calls. Use for actions like creating/updating Jira issues.
- **Streaming** (`/ask?interactive=true`): Streams responses in real-time but tool results go to client, not back to AI. Use for read operations.

See [AI_TOOL_CALLING_FIXES.md](AI_TOOL_CALLING_FIXES.md) for detailed explanation of the multi-round tool calling implementation.
