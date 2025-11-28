import { callMCPTool } from "../client.js";

export interface BbLsReposInput {
  /** Workspace slug containing the repositories. If not provided, the system will use your default workspace (either configured via BITBUCKET_DEFAULT_WORKSPACE or the first workspace in your account). Example: "myteam" */
  workspaceSlug?: string;
  /** Query string to filter repositories by name or other properties (text search). Example: "api" for repositories with "api" in the name/description. If omitted, returns all repositories. */
  query?: string;
  /** Field to sort results by. Common values: "name", "created_on", "updated_on". Prefix with "-" for descending order. Example: "-updated_on" for most recently updated first. */
  sort?: string;
  /** Filter repositories by the authenticated user's role. Common values: "owner", "admin", "contributor", "member". If omitted, returns repositories of all roles. */
  role?: string;
  /** Filter repositories by project key. Example: "project-api" */
  projectKey?: string;
  /** Maximum number of items to return (1-100). Controls the response size. Defaults to 25 if omitted. */
  limit?: number;
  /** Pagination cursor for retrieving the next set of results. Obtained from previous response when more results are available. */
  cursor?: string;
}

export interface BbLsReposOutput {
  [key: string]: unknown;
}

/**
 * Lists repositories within a workspace. If `workspaceSlug` is not provided, uses your default workspace (either configured via BITBUCKET_DEFAULT_WORKSPACE or the first workspace in your account). Filters repositories by the user`s `role`, project key `projectKey`, or a `query` string (searches name/description). Supports sorting via `sort` and pagination via `limit` and `cursor`. Pagination details are included at the end of the text content. Returns a formatted Markdown list with comprehensive details. Requires Bitbucket credentials.
 */
export async function bbLsRepos(
  kaySessionId: string,
  input: BbLsReposInput
): Promise<BbLsReposOutput> {
  return callMCPTool<BbLsReposOutput>(
    kaySessionId,
    "bitbucket",
    "bb_ls_repos",
    input
  );
}
