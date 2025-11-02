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

    if (userContext.length > 0) {
      fullPrompt = `${fullPrompt}\n\n## Current User\n${userContext.join(
        "\n"
      )}`;
    }
  }

  if (availableTools && availableTools.length > 0) {
    const toolList = availableTools
      .map(
        (tool) => `- **${tool.name}**: ${tool.description || "Available tool"}`
      )
      .join("\n");
    fullPrompt = `${fullPrompt}\n\n## Available Tools\nYou have access to the following Jira tools. When a user asks you to perform Jira operations, USE THESE TOOLS instead of explaining how to do it manually. Execute actions directly:\n\n${toolList}\n\nIMPORTANT: When users request Jira actions (like listing tickets, creating issues, searching, etc.), you MUST use the available tools. Do not tell them you cannot access Jira - you have full access through these tools.`;
  }

  return fullPrompt;
}

export function getInteractivePrompt(
  userInfo?: {
    name?: string;
    email?: string;
    accountId?: string;
    projects?: Array<{ key: string; name: string }>;
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

    if (userContext.length > 0) {
      fullPrompt = `${fullPrompt}\n\n## Current User\n${userContext.join(
        "\n"
      )}`;
    }
  }

  if (availableTools && availableTools.length > 0) {
    const toolList = availableTools
      .map(
        (tool) => `- **${tool.name}**: ${tool.description || "Available tool"}`
      )
      .join("\n");
    fullPrompt = `${fullPrompt}\n\n## Available Tools\nYou have access to the following Jira tools. When a user asks you to perform Jira operations, USE THESE TOOLS instead of explaining how to do it manually. Execute actions directly:\n\n${toolList}\n\nIMPORTANT: When users request Jira actions (like listing tickets, creating issues, searching, etc.), you MUST use the available tools. Do not tell them you cannot access Jira - you have full access through these tools.`;
  }

  return fullPrompt;
}

export function reloadPrompts(): void {
  systemPromptCache = null;
  interactivePromptCache = null;
}
