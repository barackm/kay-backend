import { refreshAccessTokenIfNeeded } from "../../../services/auth/token-service.js";
import type { HealthReport } from "../../../types/health.js";
import { handleError } from "../core.js";

export async function checkConfluence(
  tokens: any,
  health: HealthReport,
  allTools: Array<{ name: string; description?: string }>
) {
  if (!tokens) {
    health.services.confluence = {
      status: "unhealthy",
      accessible: false,
      message: "No Atlassian connection found for this session",
    };
    return;
  }

  try {
    const resource = tokens.resources.find((r: any) =>
      r.url.includes("atlassian.net")
    );
    if (!resource) {
      health.services.confluence = {
        status: "unhealthy",
        accessible: false,
        message: "No Confluence resource found",
      };
      return;
    }

    const accessToken = await refreshAccessTokenIfNeeded(tokens);
    const confluenceUrl = resource.url.replace(
      ".atlassian.net",
      ".atlassian.net/wiki"
    );

    const res = await fetch(`${confluenceUrl}/rest/api/space?limit=10`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      health.services.confluence = {
        status: "unhealthy",
        accessible: false,
        message: `Confluence API returned ${res.status}`,
      };
      return;
    }

    const data = await res.json();
    const spaces = data.results || [];
    const confluenceTools = allTools.filter((t) =>
      t.name.startsWith("confluence_")
    );

    health.services.confluence = {
      status: "healthy",
      accessible: true,
      spaceCount: spaces.length,
      tools: confluenceTools,
    };
  } catch (error) {
    health.services.confluence = handleError(health.services.confluence, error);
  }
}
