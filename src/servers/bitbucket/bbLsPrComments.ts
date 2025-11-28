import { callMCPTool } from "../client.js";

export interface BbLsPrCommentsInput {
  /** Workspace slug containing the repository. If not provided, the system will use your default workspace. Example: "myteam" */
  workspaceSlug?: string;
  /** Repository slug containing the pull request. This must be a valid repository in the specified workspace. Example: "project-api" */
  repoSlug: string;
  /** Numeric ID of the pull request to retrieve comments from as a string. Must be a valid pull request ID in the specified repository. Example: "42" */
  prId: string;
  /** Maximum number of items to return (1-100). Controls the response size. Defaults to 25 if omitted. */
  limit?: number;
  /** Pagination cursor for retrieving the next set of results. Obtained from previous response when more results are available. */
  cursor?: string;
}

export interface BbLsPrCommentsOutput {
  [key: string]: unknown;
}

/**
 * Lists comments on a specific pull request identified by `prId` within a repository (`repoSlug`). If `workspaceSlug` is not provided, the system will use your default workspace. Retrieves both general PR comments and inline code comments, indicating their location if applicable. Supports pagination via `limit` and `cursor`. Pagination details are included at the end of the text content. Returns a formatted Markdown list with each comment's author, timestamp, content, and location for inline comments. Requires Bitbucket credentials to be configured.
 */
export async function bbLsPrComments(
  kaySessionId: string,
  input: BbLsPrCommentsInput
): Promise<BbLsPrCommentsOutput> {
  return callMCPTool<BbLsPrCommentsOutput>(
    kaySessionId,
    "bitbucket",
    "bb_ls_pr_comments",
    input
  );
}
