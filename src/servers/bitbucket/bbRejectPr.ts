import { callMCPTool } from "../client.js";

export interface BbRejectPrInput {
  /** Workspace slug containing the repository. If not provided, the system will use your default workspace (either configured via BITBUCKET_DEFAULT_WORKSPACE or the first workspace in your account). Example: "myteam" */
  workspaceSlug?: string;
  /** Repository slug containing the pull request. This must be a valid repository in the specified workspace. Example: "project-api" */
  repoSlug: string;
  /** Pull request ID to request changes on. Example: 123 */
  pullRequestId: number;
}

export interface BbRejectPrOutput {
  [key: string]: unknown;
}

/**
 * Requests changes on a pull request in a repository (`repoSlug`) identified by `pullRequestId`. If `workspaceSlug` is not provided, the system will use your default workspace. This marks the pull request as requiring changes by the current user, indicating that the author should address feedback before the pull request can be merged. Returns a rejection confirmation as formatted Markdown. Requires Bitbucket credentials with appropriate permissions to be configured.
 */
export async function bbRejectPr(
  kaySessionId: string,
  input: BbRejectPrInput
): Promise<BbRejectPrOutput> {
  return callMCPTool<BbRejectPrOutput>(
    kaySessionId,
    "bitbucket",
    "bb_reject_pr",
    input
  );
}
