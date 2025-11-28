import { callMCPTool } from "../client.js";

export interface BbGetWorkspaceInput {
  /** Workspace slug to retrieve detailed information for. Must be a valid workspace slug from your Bitbucket account. Example: "myteam" */
  workspaceSlug: string;
}

export interface BbGetWorkspaceOutput {
  [key: string]: unknown;
}

/**
 * Retrieves detailed information for a workspace identified by `workspaceSlug`. Returns comprehensive workspace details as formatted Markdown, including membership, projects, and key metadata. Requires Bitbucket credentials to be configured.
 */
export async function bbGetWorkspace(
  kaySessionId: string,
  input: BbGetWorkspaceInput
): Promise<BbGetWorkspaceOutput> {
  return callMCPTool<BbGetWorkspaceOutput>(
    kaySessionId,
    "bitbucket",
    "bb_get_workspace",
    input
  );
}
