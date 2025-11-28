import { callMCPTool } from "../client.js";

export interface BbApprovePrInput {
  /** Workspace slug containing the repository. If not provided, the system will use your default workspace (either configured via BITBUCKET_DEFAULT_WORKSPACE or the first workspace in your account). Example: "myteam" */
  workspaceSlug?: string;
  /** Repository slug containing the pull request. This must be a valid repository in the specified workspace. Example: "project-api" */
  repoSlug: string;
  /** Pull request ID to approve. Example: 123 */
  pullRequestId: number;
}

export interface BbApprovePrOutput {
  [key: string]: unknown;
}

/**
 * Approves a pull request in a repository (`repoSlug`) identified by `pullRequestId`. If `workspaceSlug` is not provided, the system will use your default workspace. This marks the pull request as approved by the current user, indicating that the changes are ready for merge (pending any other required approvals or checks). Returns an approval confirmation as formatted Markdown. Requires Bitbucket credentials with appropriate permissions to be configured.
 */
export async function bbApprovePr(
  kaySessionId: string,
  input: BbApprovePrInput
): Promise<BbApprovePrOutput> {
  return callMCPTool<BbApprovePrOutput>(
    kaySessionId,
    "bitbucket",
    "bb_approve_pr",
    input
  );
}
