import { MCPServerRegistry } from "../mcp/server-registry.js";
import { callMcpTool } from "./mcp-tools.js";

export async function gatherProactiveContext(
  userId: string,
  userToken: string,
  registry: MCPServerRegistry
): Promise<string> {
  const contextParts: string[] = [];

  try {
    const jiraClient = registry.getClient(userId, "jira");
    if (jiraClient) {
      try {
        console.log("[Context] Fetching Jira projects...");
        const projects = await callMcpTool(
          registry,
          userId,
          userToken,
          "jira",
          "list_projects",
          {}
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
                console.log(`[Context] Found ${parsed.length} Jira projects`);
              }
            } catch (parseError) {
              console.error(
                "[Context] Error parsing Jira projects:",
                parseError
              );
            }
          }
        }
      } catch (error) {
        console.error("[Context] Error fetching Jira projects:", error);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      !errorMessage.includes("No connections") &&
      !errorMessage.includes("not connected")
    ) {
      console.error("[Context] Error gathering proactive context:", error);
    }
  }

  const result = contextParts.join("\n");
  console.log(
    `[Context] Returning context (length: ${result.length}): ${result.substring(
      0,
      200
    )}`
  );
  return result;
}
