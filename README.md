# Kay Backend - MCP Client

A backend service that connects to multiple MCP (Model Context Protocol)
servers.

## Getting Started

### Prerequisites

- Node.js
- pnpm

### Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3000
API_BASE_URL=https://dev-oracle.kygenv.com/v1
BEARER_TOKEN=your_token_here
```

### Installation

```bash
pnpm install
```

### Running the Server

```bash
pnpm dev
```

The server will start on `http://localhost:3000`

## API Endpoints

### Connect to an MCP Server

```bash
POST /mcp/connect
Content-Type: application/json

{
  "name": "kmesh",
  "path": "kyg-kmesh-mcp-server",
  "env": {}
}
```

The `path` can be:

- An npm package name (e.g., `kyg-kmesh-mcp-server`) - will resolve to
  `node_modules/kyg-kmesh-mcp-server/dist/index.js`
- A relative path (e.g., `./path/to/server.js`)
- An absolute path (e.g., `/absolute/path/to/server.js`)

### List Connected Servers

```bash
GET /mcp/servers
```

### List Tools from a Server

```bash
GET /mcp/servers/:name/tools
```

### Call a Tool

```bash
POST /mcp/servers/:name/tools/:toolName
Content-Type: application/json

{
  "arg1": "value1",
  "arg2": "value2"
}
```

### Disconnect from a Server

```bash
DELETE /mcp/servers/:name
```

## Using MCP Inspector

To preview and interact with MCP servers, you can use the MCP Inspector tool:

```bash
pnpm inspector
```

Or directly:

```bash
npx @modelcontextprotocol/inspector
```

### Connecting to a Server via Inspector

1. **First, connect the server through the API:**

   ```bash
   POST /mcp/connect
   {
     "name": "kmesh",
     "path": "kyg-kmesh-mcp-server"
   }
   ```

2. **Get the inspector configuration:**

   ```bash
   GET /mcp/servers/kmesh/inspector-config
   ```

3. **In the MCP Inspector UI:**
   - Click "New Connection"
   - Select "stdio" transport
   - Use the configuration from step 2:
     - Command: `node`
     - Args: The path from the config (e.g.,
       `node_modules/kyg-kmesh-mcp-server/dist/index.js`)
     - Env: Copy the env object from the config (includes `API_BASE_URL` and
       `BEARER_TOKEN`)

Alternatively, you can connect the inspector directly to any MCP server using
stdio transport with the same command/args/env pattern.
