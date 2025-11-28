import { callMCPTool } from "../client.js";

export interface BbSearchInput {
  /** Workspace slug to search in. If not provided, the system will use your default workspace. Example: "myteam". Equivalent to --workspace in CLI. */
  workspaceSlug?: string;
  /** Optional: Repository slug to limit search scope. Required for `pullrequests` scope. Example: "project-api". Equivalent to --repo in CLI. */
  repoSlug?: string;
  /** Search query text. Required. Will match against content based on the selected search scope. Equivalent to --query in CLI. */
  query: string;
  /** Search scope: "code", "content", "repositories", "pullrequests". Default: "code". Equivalent to --type in CLI. */
  scope?: string;
  /** Content type for content search (e.g., "wiki", "issue"). Equivalent to --content-type in CLI. */
  contentType?: string;
  /** Filter code search by language. Equivalent to --language in CLI. */
  language?: string;
  /** Filter code search by file extension. Equivalent to --extension in CLI. */
  extension?: string;
  /** Maximum number of results to return (1-100). Use this to control the response size. Useful for pagination or when you only need a few results. */
  limit?: number;
  /** Pagination cursor for retrieving the next set of results. For repositories and pull requests, this is a cursor string. For code search, this is a page number. Use this to navigate through large result sets. */
  cursor?: string;
}

export interface BbSearchOutput {
  [key: string]: unknown;
}

/**
 * Searches Bitbucket for content matching the provided query. Use this tool to find repositories, code, pull requests, or other content in Bitbucket. Specify `scope` to narrow your search ("code", "repositories", "pullrequests", or "content"). Filter code searches by `language` or `extension`. Filter content searches by `contentType`. Only searches within the specified `workspaceSlug` and optionally within a specific `repoSlug`. Supports pagination via `limit` and `cursor`. Requires Atlassian Bitbucket credentials configured. Returns search results as Markdown.
 */
export async function bbSearch(
  kaySessionId: string,
  input: BbSearchInput
): Promise<BbSearchOutput> {
  return callMCPTool<BbSearchOutput>(
    kaySessionId,
    "bitbucket",
    "bb_search",
    input
  );
}
