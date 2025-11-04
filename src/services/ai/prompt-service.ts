import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const promptsDir = join(__dirname, "../prompts");

let systemPromptCache: string | null = null;
let interactivePromptCache: string | null = null;

export function getSystemPrompt(
  userInfo?: {
    name?: string;
    email?: string;
    accountId?: string;
    projects?: Array<{ key: string; name: string }>;
    confluenceSpaces?: Array<{ key: string; name: string }>;
  },
  availableTools?: Array<{
    name: string;
    description?: string;
  }>
): string {
  let basePrompt: string;

  if (systemPromptCache) {
    basePrompt = systemPromptCache;
  } else {
    try {
      const promptPath = join(promptsDir, "system.md");
      const content = readFileSync(promptPath, "utf-8");
      basePrompt = content.replace(/^#+\s.*$/gm, "").trim();
      systemPromptCache = basePrompt;
    } catch (error) {
      console.warn("Failed to load system prompt, using default");
      basePrompt =
        "You are Kay, a helpful AI assistant that helps developers interact with Jira and other Atlassian tools.";
    }
  }

  let fullPrompt = basePrompt;

  if (userInfo) {
    const userContext = [];
    if (userInfo.name) userContext.push(`User's name: ${userInfo.name}`);
    if (userInfo.email) userContext.push(`User's email: ${userInfo.email}`);
    if (userInfo.accountId)
      userContext.push(`User's Atlassian account ID: ${userInfo.accountId}`);

    if (userInfo.projects && userInfo.projects.length > 0) {
      const projectsList = userInfo.projects
        .map((p) => `- **${p.key}**: ${p.name}`)
        .join("\n");
      userContext.push(`User's accessible Jira projects:\n${projectsList}`);
    }

    if (userInfo.confluenceSpaces && userInfo.confluenceSpaces.length > 0) {
      const spacesList = userInfo.confluenceSpaces
        .map((s) => `- **${s.key}**: ${s.name}`)
        .join("\n");
      userContext.push(`User's accessible Confluence spaces:\n${spacesList}`);
    }

    if (userContext.length > 0) {
      fullPrompt = `${fullPrompt}\n\n## Current User\n${userContext.join(
        "\n"
      )}`;
    }
  }

  if (availableTools && availableTools.length > 0) {
    const confluenceTools = availableTools.filter((t) =>
      t.name.startsWith("confluence_")
    );
    const jiraTools = availableTools.filter((t) => t.name.startsWith("jira_"));

    const toolList = availableTools
      .map(
        (tool) => `- **${tool.name}**: ${tool.description || "Available tool"}`
      )
      .join("\n");

    let toolInstructions = `\n\n## Available Tools\nYou have access to the following Jira and Confluence tools. You MUST use these tools when users ask about Jira or Confluence:\n\n${toolList}\n\n`;

    if (confluenceTools.length > 0) {
      toolInstructions += `\n### Confluence Tools Available (${confluenceTools.length} tools)\nYou have ${confluenceTools.length} Confluence tools available. When a user asks about Confluence pages, spaces, content, or anything related to Confluence, you MUST use the Confluence tools. Examples:\n- "What pages do we have?" → Use \`confluence_search\` tool\n- "List pages in space X" → Use \`confluence_get_page_children\` tool\n- "Show me page Y" → Use \`confluence_get_page\` tool (requires page ID, extract from URL if needed)\n- "Can you access this page: https://...atlassian.net/wiki/.../pages/123456/..." → Extract page ID (e.g., 123456) and use \`confluence_get_page\` with that ID\n- "Search for X in Confluence" → Use \`confluence_search\` tool\n\nIMPORTANT: When a user provides a Confluence URL, extract the page ID from the URL path (it's the number after "/pages/") and use that with \`confluence_get_page\`.\n\nIf you get a 401 Unauthorized error, inform the user that they may need to re-authenticate to get updated permissions.\n\nDO NOT say you cannot access Confluence. You have full access through these tools.\n\n`;
    }

    if (jiraTools.length > 0) {
      toolInstructions += `\n### Jira Tools Available (${jiraTools.length} tools)\nWhen users ask about Jira tickets, projects, issues, etc., you MUST use the Jira tools.\n\n`;
    }

    toolInstructions += `\n**CRITICAL RULES**:
1. NEVER say you cannot access Confluence or Jira - you have full access through the tools above
2. When a user asks you to create, read, update, or search anything in Confluence or Jira, you MUST use the corresponding tool
3. If you cannot find a tool that matches the request, use the closest available tool
4. Always attempt to use tools before saying you cannot do something
5. For Confluence page creation: Use the \`confluence_create_page\` tool with space_key, title, and body parameters
6. Never provide manual instructions when you can execute the action directly using tools

**Example**: If a user says "create a page in Confluence", you MUST call \`confluence_create_page\` tool. Do NOT tell them how to do it manually.`;

    fullPrompt = `${fullPrompt}${toolInstructions}`;
  }

  return fullPrompt;
}

export function getInteractivePrompt(
  userInfo?: {
    name?: string;
    email?: string;
    accountId?: string;
    projects?: Array<{ key: string; name: string }>;
    confluenceSpaces?: Array<{ key: string; name: string }>;
  },
  availableTools?: Array<{
    name: string;
    description?: string;
  }>
): string {
  let basePrompt: string;

  if (interactivePromptCache) {
    basePrompt = interactivePromptCache;
  } else {
    try {
      const promptPath = join(promptsDir, "interactive.md");
      const content = readFileSync(promptPath, "utf-8");
      basePrompt = content.replace(/^#+\s.*$/gm, "").trim();
      interactivePromptCache = basePrompt;
    } catch (error) {
      console.warn("Failed to load interactive prompt, using default");
      basePrompt =
        "You are Kay, a helpful AI assistant for developers. You are in an interactive conversation. Maintain context from previous messages and be conversational.";
    }
  }

  let fullPrompt = basePrompt;

  if (userInfo) {
    const userContext = [];
    if (userInfo.name) userContext.push(`User's name: ${userInfo.name}`);
    if (userInfo.email) userContext.push(`User's email: ${userInfo.email}`);
    if (userInfo.accountId)
      userContext.push(`User's Atlassian account ID: ${userInfo.accountId}`);

    if (userInfo.projects && userInfo.projects.length > 0) {
      const projectsList = userInfo.projects
        .map((p) => `- **${p.key}**: ${p.name}`)
        .join("\n");
      userContext.push(`User's accessible Jira projects:\n${projectsList}`);
    }

    if (userInfo.confluenceSpaces && userInfo.confluenceSpaces.length > 0) {
      const spacesList = userInfo.confluenceSpaces
        .map((s) => `- **${s.key}**: ${s.name}`)
        .join("\n");
      userContext.push(`User's accessible Confluence spaces:\n${spacesList}`);
    }

    if (userContext.length > 0) {
      fullPrompt = `${fullPrompt}\n\n## Current User\n${userContext.join(
        "\n"
      )}`;
    }
  }

  if (availableTools && availableTools.length > 0) {
    const confluenceTools = availableTools.filter((t) =>
      t.name.startsWith("confluence_")
    );
    const jiraTools = availableTools.filter((t) => t.name.startsWith("jira_"));

    const toolList = availableTools
      .map(
        (tool) => `- **${tool.name}**: ${tool.description || "Available tool"}`
      )
      .join("\n");

    let toolInstructions = `\n\n## Available Tools\nYou have access to the following Jira and Confluence tools. You MUST use these tools when users ask about Jira or Confluence:\n\n${toolList}\n\n`;

    if (confluenceTools.length > 0) {
      toolInstructions += `\n### Confluence Tools Available (${confluenceTools.length} tools)\nYou have ${confluenceTools.length} Confluence tools available. When a user asks about Confluence pages, spaces, content, or anything related to Confluence, you MUST use the Confluence tools. Examples:\n- "What pages do we have?" → Use \`confluence_search\` tool\n- "List pages in space X" → Use \`confluence_get_page_children\` tool\n- "Show me page Y" → Use \`confluence_get_page\` tool (requires page ID, extract from URL if needed)\n- "Can you access this page: https://...atlassian.net/wiki/.../pages/123456/..." → Extract page ID (e.g., 123456) and use \`confluence_get_page\` with that ID\n- "Search for X in Confluence" → Use \`confluence_search\` tool\n\nIMPORTANT: When a user provides a Confluence URL, extract the page ID from the URL path (it's the number after "/pages/") and use that with \`confluence_get_page\`.\n\nIf you get a 401 Unauthorized error, inform the user that they may need to re-authenticate to get updated permissions.\n\nDO NOT say you cannot access Confluence. You have full access through these tools.\n\n`;
    }

    if (jiraTools.length > 0) {
      toolInstructions += `\n### Jira Tools Available (${jiraTools.length} tools)\nWhen users ask about Jira tickets, projects, issues, etc., you MUST use the Jira tools.\n\n`;
    }

    toolInstructions += `\n**CRITICAL RULES**:
1. NEVER say you cannot access Confluence or Jira - you have full access through the tools above
2. When a user asks you to create, read, update, or search anything in Confluence or Jira, you MUST use the corresponding tool
3. If you cannot find a tool that matches the request, use the closest available tool
4. Always attempt to use tools before saying you cannot do something
5. For Confluence page creation: Use the \`confluence_create_page\` tool with space_key, title, and body parameters
6. Never provide manual instructions when you can execute the action directly using tools

**Example**: If a user says "create a page in Confluence", you MUST call \`confluence_create_page\` tool. Do NOT tell them how to do it manually.`;

    fullPrompt = `${fullPrompt}${toolInstructions}`;
  }

  return fullPrompt;
}

export function reloadPrompts(): void {
  systemPromptCache = null;
  interactivePromptCache = null;
}
