import { callMCPTool } from "../client.js";

export interface BbLsPrsInput {
  /** Workspace slug containing the repository. If not provided, the system will use your default workspace (either configured via BITBUCKET_DEFAULT_WORKSPACE or the first workspace in your account). Example: "myteam" */
  workspaceSlug?: string;
  /** Repository slug containing the pull requests. This must be a valid repository in the specified workspace. Example: "project-api" */
  repoSlug: string;
  /** Filter pull requests by state. Options: "OPEN" (active PRs), "MERGED" (completed PRs), "DECLINED" (rejected PRs), or "SUPERSEDED" (replaced PRs). If omitted, defaults to showing all states. */
  state?: string;
  /** Filter pull requests by title, description, or author (text search). Uses Bitbucket query syntax. */
  query?: string;
  /** Maximum number of items to return (1-100). Controls the response size. Defaults to 25 if omitted. */
  limit?: number;
  /** Pagination cursor for retrieving the next set of results. Obtained from previous response when more results are available. */
  cursor?: string;
}

export interface BbLsPrsOutput {
  [key: string]: unknown;
}

/**
 * Lists pull requests within a repository (`repoSlug`). If `workspaceSlug` is not provided, the system will use your default workspace. Filters by `state` (OPEN, MERGED, DECLINED, SUPERSEDED) and supports text search via `query`. Supports pagination via `limit` and `cursor`. Pagination details are included at the end of the text content. Returns a formatted Markdown list with each PR's title, status, author, reviewers, and creation date. Requires Bitbucket credentials to be configured.
 */
export async function bbLsPrs(
  kaySessionId: string,
  input: BbLsPrsInput
): Promise<BbLsPrsOutput> {
  return callMCPTool<BbLsPrsOutput>(
    kaySessionId,
    "bitbucket",
    "bb_ls_prs",
    input
  );
}
