import { callMCPTool } from "../client.js";

export interface BbLsWorkspacesInput {
  /** Maximum number of items to return (1-100). Controls the response size. Defaults to 25 if omitted. */
  limit?: number;
  /** Pagination cursor for retrieving the next set of results. Obtained from previous response when more results are available. */
  cursor?: string;
}

export interface BbLsWorkspacesOutput {
  [key: string]: unknown;
}

/**
 * Lists workspaces within your Bitbucket account. Returns a formatted Markdown list showing workspace slugs, names, and membership role. Requires Bitbucket credentials to be configured.
 */
export async function bbLsWorkspaces(
  kaySessionId: string,
  input: BbLsWorkspacesInput
): Promise<BbLsWorkspacesOutput> {
  return callMCPTool<BbLsWorkspacesOutput>(
    kaySessionId,
    "bitbucket",
    "bb_ls_workspaces",
    input
  );
}
