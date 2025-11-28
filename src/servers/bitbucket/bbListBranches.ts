import { callMCPTool } from "../client.js";

export interface BbListBranchesInput {
  /** Workspace slug containing the repository. If not provided, the system will use your default workspace. Example: "myteam" */
  workspaceSlug?: string;
  /** Repository slug to list branches from. Must be a valid repository slug in the specified workspace. Example: "project-api" */
  repoSlug: string;
  /** Query string to filter branches by name or other properties (text search). */
  query?: string;
  /** Field to sort branches by. Common values: "name" (default), "-name", "target.date". Prefix with "-" for descending order. */
  sort?: string;
  /** Maximum number of items to return (1-100). Controls the response size. Defaults to 25 if omitted. */
  limit?: number;
  /** Pagination cursor for retrieving the next set of results. Obtained from previous response when more results are available. */
  cursor?: string;
}

export interface BbListBranchesOutput {
  [key: string]: unknown;
}

/**
 * Lists branches in a repository identified by `workspaceSlug` and `repoSlug`. Filters branches by an optional text `query` and supports custom `sort` order. Provides pagination via `limit` and `cursor`. Pagination details are included at the end of the text content. Returns branch details as Markdown with each branch's name, latest commit, and default merge strategy. Requires Bitbucket credentials.
 */
export async function bbListBranches(
  kaySessionId: string,
  input: BbListBranchesInput
): Promise<BbListBranchesOutput> {
  return callMCPTool<BbListBranchesOutput>(
    kaySessionId,
    "bitbucket",
    "bb_list_branches",
    input
  );
}
