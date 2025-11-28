# AI Tools Module

This directory contains the tool systems that enable the AI to interact with external services and execute code.

## Directory Structure

```
tools/
├── index.ts                    # Main entry point for all tools
├── filesystem/                 # Filesystem discovery tools (PRIMARY)
│   ├── index.ts               # Exports all filesystem tools
│   ├── definitions.ts         # OpenAI tool definitions
│   ├── executor.ts            # Tool execution router
│   └── operations.ts          # Actual filesystem operations
└── mcp/                       # MCP tools (LEGACY - being phased out)
    ├── index.ts               # Exports all MCP tools
    ├── executor.ts            # MCP tool execution
    └── registry.ts            # MCP tool discovery
```

---

## 🎯 Tool Systems Overview

### 1. Filesystem Discovery Tools (Primary Approach)

The filesystem tools enable the AI to **dynamically discover** what it can do by exploring the codebase.

#### Available Tools:
- **`list_directory(path)`** - Browse folder structure to find available MCP servers
- **`read_file(path)`** - Read TypeScript files to understand function signatures
- **`execute_typescript(code)`** - Execute TypeScript code with discovered functions

#### Example Flow:
```
User: "What are my Bitbucket repos?"

AI Process:
1. list_directory("src/servers") → discovers bitbucket/
2. list_directory("src/servers/bitbucket") → discovers bbLsRepos.ts
3. read_file("src/servers/bitbucket/bbLsRepos.ts") → learns function signature
4. execute_typescript(`
     import { bbLsRepos } from './src/servers/bitbucket/bbLsRepos.js';
     const repos = await bbLsRepos(kaySessionId, {});
     console.log(JSON.stringify(repos, null, 2));
   `)
5. Returns results to user
```

#### Benefits:
- ✅ **Extensible**: Add new MCP servers without updating AI configuration
- ✅ **Self-discovering**: AI explores to find capabilities
- ✅ **Type-safe**: Reads actual TypeScript for accurate signatures
- ✅ **Flexible**: AI can write complex logic, loops, conditionals

### 2. MCP Tools (Legacy)

The original approach where MCP tools are registered and provided directly to the AI.

**Status**: Being phased out in favor of filesystem discovery approach.

---

## 🔧 Under the Hood: How It All Works

### The Complete Request Flow

```
┌─────────────┐
│   User      │ "What are my Bitbucket repos?"
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  1. ask-service.ts (Entry Point)                        │
│  ─────────────────────────────────────────────────────  │
│  • Receives user prompt                                 │
│  • Loads chat history from database                     │
│  • Initializes agentic loop (max 10 iterations)         │
│  • Provides FILESYSTEM_TOOLS to AI                      │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  2. Agentic Loop (The Brain)                            │
│  ─────────────────────────────────────────────────────  │
│  while (iteration < 10) {                               │
│    • Call OpenAI with messages + tools                  │
│    • Check finish_reason:                               │
│      - "stop" → AI has final answer, return to user     │
│      - "tool_calls" → AI wants to use tools, continue   │
│    • Execute tool calls                                 │
│    • Add results to conversation                        │
│    • Loop back to OpenAI with new context              │
│  }                                                       │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  3. OpenAI API (openai-service.ts)                      │
│  ─────────────────────────────────────────────────────  │
│  • Formats messages for OpenAI API                      │
│  • Sends tools as function definitions                  │
│  • Receives response with:                              │
│    - content: AI's text response                        │
│    - tool_calls: Array of tools AI wants to use         │
│    - finish_reason: Why AI stopped                      │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  4. Tool Execution (filesystem/executor.ts)             │
│  ─────────────────────────────────────────────────────  │
│  • Receives tool_calls from OpenAI                      │
│  • Routes to appropriate operation:                     │
│    - list_directory → operations.listDirectory()        │
│    - read_file → operations.readFileContent()           │
│    - execute_typescript → operations.executeTS()        │
│  • Returns results as tool messages                     │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  5. Filesystem Operations (filesystem/operations.ts)    │
│  ─────────────────────────────────────────────────────  │
│  A. list_directory(path)                                │
│     • Validates path is within src/servers/             │
│     • Uses fs.readdir() to list contents                │
│     • Returns array of files/folders                    │
│                                                          │
│  B. read_file(path)                                     │
│     • Validates .ts file in src/servers/                │
│     • Uses fs.readFile() to get content                 │
│     • Returns raw TypeScript code                       │
│                                                          │
│  C. execute_typescript(code, kaySessionId)              │
│     • Creates temp file with unique name                │
│     • Injects kaySessionId into code scope              │
│     • Executes with: npx tsx temp-file.ts               │
│     • Captures stdout/stderr                            │
│     • Cleans up temp file                               │
│     • Returns execution output                          │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  6. MCP Server Functions (src/servers/bitbucket/)       │
│  ─────────────────────────────────────────────────────  │
│  • AI's generated code imports these functions          │
│  • Example: bbLsRepos(kaySessionId, {})                 │
│  • Functions call callMCPTool() internally              │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  7. MCP Client Layer (servers/client.ts)                │
│  ─────────────────────────────────────────────────────  │
│  • getOrCreateClient(kaySessionId, "bitbucket")         │
│  • Checks cache for existing client                     │
│  • If not cached:                                       │
│    - Fetches user credentials from database             │
│    - Creates GenericMCPClient instance                  │
│    - Initializes with npm package + credentials         │
│    - Caches for future use                              │
│  • Calls client.callTool(toolName, input)               │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  8. Generic MCP Client (servers/generic-client.ts)      │
│  ─────────────────────────────────────────────────────  │
│  • Uses @modelcontextprotocol/sdk                       │
│  • Creates StdioClientTransport:                        │
│    - Spawns: npx -y @aashari/mcp-server-bitbucket       │
│    - Passes environment variables (credentials)         │
│    - Establishes stdio communication                    │
│  • Sends MCP protocol messages over stdio               │
│  • Receives responses from MCP server                   │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  9. External MCP Server (NPM Package)                   │
│  ─────────────────────────────────────────────────────  │
│  • Runs as separate Node.js process                     │
│  • Communicates via stdio (stdin/stdout)                │
│  • Uses credentials from environment variables          │
│  • Makes actual API calls to Bitbucket                  │
│  • Returns results via MCP protocol                     │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  10. Response Bubbles Back Up                           │
│  ─────────────────────────────────────────────────────  │
│  MCP Server → GenericMCPClient → callMCPTool →          │
│  bbLsRepos → execute_typescript output →                │
│  Tool result → OpenAI → AI processes →                  │
│  Final response → User                                  │
└─────────────────────────────────────────────────────────┘
```

---

## 🧠 Deep Dive: Agentic Loop

The agentic loop is the core of the AI's autonomous behavior. Here's what happens in detail:

### Iteration Lifecycle

```typescript
// Simplified version of what happens in ask-service.ts
const messages = [
  { role: "system", content: SYSTEM_PROMPT },
  ...chatHistory,
  { role: "user", content: userPrompt }
];

while (iteration < 10) {
  // 1. Call OpenAI
  const result = await createChatCompletion({
    messages,
    tools: FILESYSTEM_TOOLS
  });

  // 2. Check what AI wants to do
  if (result.finishReason === "stop") {
    // AI has final answer
    return result.content;
  }

  if (result.finishReason === "tool_calls") {
    // AI wants to use tools
    
    // 3. Add AI's tool request to conversation
    messages.push({
      role: "assistant",
      content: "",
      tool_calls: result.toolCalls
    });

    // 4. Execute the tools
    const toolResults = await executeFilesystemTools(
      kaySessionId,
      result.toolCalls
    );

    // 5. Add tool results to conversation
    messages.push(...toolResults);

    // 6. Loop back - AI will see tool results and decide next step
    continue;
  }
}
```

### Why This Works

1. **Context Accumulation**: Each iteration adds to the conversation
2. **AI Decision Making**: AI decides when to explore, when to execute, when to respond
3. **Multi-step Reasoning**: AI can chain multiple tool calls across iterations
4. **Error Recovery**: If a tool fails, AI sees the error and can try a different approach

---

## 🔐 Security Model

### Filesystem Tools Security

**Path Validation** (`operations.ts`):
```typescript
// Only allow access to src/servers/
if (!fullPath.includes("/src/servers/")) {
  throw new Error("Access denied");
}

// Only allow .ts files
if (!fullPath.endsWith(".ts")) {
  throw new Error("Access denied");
}
```

**Code Execution Sandbox**:
```typescript
// Temp file with unique name
const tempFile = `temp-exec-${Date.now()}.ts`;

// Auto-inject kaySessionId (user authentication)
const wrappedCode = `
  const kaySessionId = "${kaySessionId}";
  ${userCode}
`;

// Execute with timeout
execAsync(`npx tsx ${tempFile}`, {
  timeout: 30000, // 30 seconds max
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: "development" }
});

// Always cleanup
await unlink(tempFile);
```

### MCP Client Security

**Per-User Credentials**:
- Each user has their own MCP client instance
- Credentials fetched from database per session
- Client cache: `Map<"sessionId:serverName", client>`

**Credential Flow**:
```typescript
// 1. Get user's connection from database
const connection = await getConnection(kaySessionId, ServiceName.BITBUCKET);

// 2. Extract credentials (server-specific logic)
const decoded = Buffer.from(connection.access_token, "base64").toString();
const [email, apiToken] = decoded.split(":");

// 3. Pass to MCP server as environment variables
const env = {
  BITBUCKET_EMAIL: email,
  BITBUCKET_TOKEN: apiToken
};

// 4. MCP server uses these for API calls
```

---

## 📦 Adding New MCP Servers

### Step 1: Add to Config
```typescript
// src/servers/config.ts
export const MCP_SERVERS = {
  jira: {
    npmPackage: "@aashari/mcp-server-atlassian-jira"
  }
};
```

### Step 2: Add Credential Mapping
```typescript
// src/servers/client.ts
function getServiceName(serverName: string): ServiceName | null {
  const mapping = {
    bitbucket: ServiceName.BITBUCKET,
    jira: ServiceName.JIRA, // Add this
  };
  return mapping[serverName] || null;
}
```

### Step 3: Add Credential Extraction
```typescript
// src/servers/client.ts
async function getEnvFromConnection(kaySessionId, serverName) {
  // ... existing code ...
  
  if (serverName === "jira") {
    const validAccessToken = await getValidAccessToken(connection);
    const metadata = connection.metadata as { email?: string };
    env.JIRA_EMAIL = metadata.email;
    env.JIRA_TOKEN = validAccessToken;
  }
}
```

### Step 4: Generate Tool Files
```bash
npm run generate-server-tools
```

### Step 5: Done! 🎉
AI will automatically discover Jira tools via filesystem exploration.

---

## 🎓 Key Concepts

### 1. **Tool Definitions** (`definitions.ts`)
OpenAI function calling format that tells the AI what tools exist and how to use them.

### 2. **Tool Executor** (`executor.ts`)
Routes tool calls from OpenAI to the appropriate operation based on tool name.

### 3. **Operations** (`operations.ts`)
The actual implementation of each tool - filesystem access and code execution.

### 4. **Agentic Loop** (`ask-service.ts`)
Allows AI to make multiple tool calls in sequence, building context iteratively.

### 5. **MCP Protocol**
Standard protocol for AI-to-service communication. Our MCP servers implement this protocol.

### 6. **Code Generation Pattern**
Instead of hardcoding tools, we generate TypeScript wrapper functions that the AI can discover and use.

---

## 🚀 Usage Examples

### Simple Import
```typescript
import { FILESYSTEM_TOOLS, executeFilesystemTools } from "./tools/filesystem/index.js";
```

### Or Import Everything
```typescript
import { 
  FILESYSTEM_TOOLS, 
  executeFilesystemTools,
  listDirectory,
  readFileContent,
  executeTypeScriptCode 
} from "./tools/index.js";
```

### Direct Operation Usage
```typescript
// List available servers
const servers = await listDirectory("src/servers");

// Read a tool file
const code = await readFileContent("src/servers/bitbucket/bbLsRepos.ts");

// Execute TypeScript
const output = await executeTypeScriptCode(`
  import { bbLsRepos } from './src/servers/bitbucket/bbLsRepos.js';
  const repos = await bbLsRepos(kaySessionId, {});
  console.log(JSON.stringify(repos, null, 2));
`, kaySessionId);
```

---

## 🐛 Debugging

### Enable Verbose Logging
All operations include console.log statements:
- `[Ask Service]` - Main service flow
- `[OpenAI]` - OpenAI API calls
- `[Filesystem Tool]` - Tool execution
- `[list_directory]` - Directory listings
- `[read_file]` - File reads
- `[execute_typescript]` - Code execution
- `[Code Execution]` - Detailed execution info

### Common Issues

**AI not discovering tools?**
- Check that files exist in `src/servers/[server-name]/`
- Verify file names match pattern (e.g., `bbLsRepos.ts`)
- Check console logs for `list_directory` results

**Code execution failing?**
- Check temp file creation in logs
- Verify `tsx` is installed (`npx tsx --version`)
- Check 30s timeout isn't being hit
- Look for syntax errors in generated code

**MCP client errors?**
- Verify user has connection in database
- Check credentials are valid
- Ensure npm package is accessible
- Check MCP server logs (stdio output)

---

## 📚 Further Reading

- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Agentic AI Patterns](https://www.anthropic.com/research/building-effective-agents)
