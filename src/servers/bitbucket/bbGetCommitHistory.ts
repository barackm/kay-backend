import { callMCPTool } from "../client.js";

export interface BbGetCommitHistoryInput {
  /** Workspace slug containing the repository. If not provided, the system will use your default workspace. Example: "myteam" */
  workspaceSlug?: string;
  /** Repository slug whose commit history is to be retrieved. Example: "project-api" */
  repoSlug: string;
  /** Optional branch name, tag, or commit hash to view history from. If omitted, uses the default branch. */
  revision?: string;
  /** Optional file path to filter commit history. Only shows commits affecting this file. */
  path?: string;
  /** Maximum number of items to return (1-100). Controls the response size. Defaults to 25 if omitted. */
  limit?: number;
  /** Pagination cursor for retrieving the next set of results. Obtained from previous response when more results are available. */
  cursor?: string;
}

export interface BbGetCommitHistoryOutput {
  [key: string]: unknown;
}

/**
 * Retrieves the commit history for a repository identified by `workspaceSlug` and `repoSlug`. Supports pagination via `limit` (number of commits per page) and `cursor` (which acts as the page number for this endpoint). Optionally filters history starting from a specific branch, tag, or commit hash using `revision`, or shows only commits affecting a specific file using `path`. Returns the commit history as formatted Markdown, including commit hash, author, date, and message. Pagination details are included at the end of the text content. Requires Bitbucket credentials to be configured.
 */
export async function bbGetCommitHistory(
  kaySessionId: string,
  input: BbGetCommitHistoryInput
): Promise<BbGetCommitHistoryOutput> {
  return callMCPTool<BbGetCommitHistoryOutput>(
    kaySessionId,
    "bitbucket",
    "bb_get_commit_history",
    input
  );
}
