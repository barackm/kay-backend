import { callMCPTool } from "../client.js";

export interface BbUpdatePrInput {
  /** Workspace slug containing the repository. If not provided, the system will use your default workspace (either configured via BITBUCKET_DEFAULT_WORKSPACE or the first workspace in your account). Example: "myteam" */
  workspaceSlug?: string;
  /** Repository slug containing the pull request. This must be a valid repository in the specified workspace. Example: "project-api" */
  repoSlug: string;
  /** Pull request ID to update. Example: 123 */
  pullRequestId: number;
  /** Updated title for the pull request. Example: "Updated Feature Implementation" */
  prTitle?: string;
  /** Updated description for the pull request in Markdown format. Supports standard Markdown syntax including headings, lists, code blocks, and links. */
  description?: string;
}

export interface BbUpdatePrOutput {
  [key: string]: unknown;
}

/**
 * Updates an existing pull request in a repository (`repoSlug`) identified by `pullRequestId`. If `workspaceSlug` is not provided, the system will use your default workspace. You can update the `prTitle` (the PR title) and/or `description` fields. At least one field must be provided. The `description` parameter accepts Markdown-formatted text. Returns the updated pull request details as formatted Markdown. Requires Bitbucket credentials with write permissions to be configured.
 */
export async function bbUpdatePr(
  kaySessionId: string,
  input: BbUpdatePrInput
): Promise<BbUpdatePrOutput> {
  return callMCPTool<BbUpdatePrOutput>(
    kaySessionId,
    "bitbucket",
    "bb_update_pr",
    input
  );
}
