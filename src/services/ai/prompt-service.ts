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
        "You are Kay, a helpful AI assistant for developers.";
    }
  }

  let fullPrompt = basePrompt;

  if (userInfo) {
    const userContext = [];
    if (userInfo.name) userContext.push(`User's name: ${userInfo.name}`);
    if (userInfo.email) userContext.push(`User's email: ${userInfo.email}`);
    if (userInfo.accountId)
      userContext.push(`User's account ID: ${userInfo.accountId}`);

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

    const toolInstructions = `\n\n## Available Tools\nYou have access to the following tools:\n\n${toolList}\n\n**Usage Guidelines**:\n1. Use tools when appropriate to help the user\n2. Always attempt to use tools before saying you cannot do something\n3. If you cannot find a tool that matches the request, explain what tools are available`;

    fullPrompt = `${fullPrompt}${toolInstructions}`;
  }

  return fullPrompt;
}

export function getInteractivePrompt(
  userInfo?: {
    name?: string;
    email?: string;
    accountId?: string;
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
      userContext.push(`User's account ID: ${userInfo.accountId}`);

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

    const toolInstructions = `\n\n## Available Tools\nYou have access to the following tools:\n\n${toolList}\n\n**Usage Guidelines**:\n1. Use tools when appropriate to help the user\n2. Always attempt to use tools before saying you cannot do something\n3. If you cannot find a tool that matches the request, explain what tools are available`;

    fullPrompt = `${fullPrompt}${toolInstructions}`;
  }

  return fullPrompt;
}

export function reloadPrompts(): void {
  systemPromptCache = null;
  interactivePromptCache = null;
}
