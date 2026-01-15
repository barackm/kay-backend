import { MCPServerRegistry } from "../mcp/server-registry.js";
import { callMcpTool } from "./mcp-tools.js";

export async function gatherProactiveContext(
  userId: string,
  userToken: string,
  registry: MCPServerRegistry,
  userEmail?: string
): Promise<string> {
  const contextParts: string[] = [];

  try {
    const jiraClient = registry.getClient(userId, "jira");
    if (jiraClient) {
      try {
        const projects = await callMcpTool(
          registry,
          userId,
          userToken,
          "jira",
          "get_projects",
          {},
          userEmail
        );

        if (projects && typeof projects === "object" && "content" in projects) {
          const content = projects.content as Array<{
            type: string;
            text: string;
          }>;
          const textContent = content.find((c) => c.type === "text")?.text;

          if (textContent) {
            try {
              const parsed = JSON.parse(textContent);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const projectList = parsed
                  .map((p: any) => `${p.key} (${p.name})`)
                  .join(", ");
                contextParts.push(`\nAvailable Jira Projects: ${projectList}`);
              }
            } catch (parseError) {
              const markdownMatch = textContent.match(/\| Key \| Name \|/);
              if (markdownMatch) {
                const lines = textContent.split("\n");
                const projectLines: string[] = [];
                let inTable = false;

                for (const line of lines) {
                  if (line.includes("| Key | Name |")) {
                    inTable = true;
                    continue;
                  }
                  if (
                    inTable &&
                    line.startsWith("|") &&
                    !line.includes("---")
                  ) {
                    const parts = line
                      .split("|")
                      .map((p) => p.trim())
                      .filter((p) => p);
                    if (parts.length >= 2) {
                      const key = parts[0];
                      const name = parts[1];
                      if (key && name && key !== "Key") {
                        projectLines.push(`${key} (${name})`);
                      }
                    }
                  }
                  if (inTable && line.trim() === "") {
                    break;
                  }
                }

                if (projectLines.length > 0) {
                  contextParts.push(
                    `\nAvailable Jira Projects: ${projectLines.join(", ")}`
                  );
                }
              }
            }
          }
        }
      } catch (error) {}
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      !errorMessage.includes("No connections") &&
      !errorMessage.includes("not connected")
    ) {
    }
  }

  const result = contextParts.join("\n");
  return result;
}
