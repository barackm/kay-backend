import { callMCPTool } from "../client.js";

export interface BbDiffCommitsInput {
  /** Workspace slug containing the repository. If not provided, the system will use your default workspace. */
  workspaceSlug?: string;
  /** Repository slug to compare commits in */
  repoSlug: string;
  /** Base commit hash or reference. IMPORTANT NOTE: For proper results with code changes, this should be the NEWER commit (chronologically later). If you see "No changes detected", try reversing commit order. */
  sinceCommit: string;
  /** Target commit hash or reference. IMPORTANT NOTE: For proper results with code changes, this should be the OLDER commit (chronologically earlier). If you see "No changes detected", try reversing commit order. */
  untilCommit: string;
  /** Whether to include the full code diff in the response (default: false) */
  includeFullDiff?: boolean;
  /** Maximum number of changed files to return in results */
  limit?: number;
  /** Pagination cursor for retrieving additional results */
  cursor?: number;
}

export interface BbDiffCommitsOutput {
  [key: string]: unknown;
}

/**
 * Shows changes between commits in a repository identified by `workspaceSlug` and `repoSlug`. Requires `sinceCommit` and `untilCommit` to identify the specific commits to compare. Returns the diff as formatted Markdown showing file changes, additions, and deletions between the commits. Requires Bitbucket credentials to be configured.
 */
export async function bbDiffCommits(
  kaySessionId: string,
  input: BbDiffCommitsInput
): Promise<BbDiffCommitsOutput> {
  return callMCPTool<BbDiffCommitsOutput>(
    kaySessionId,
    "bitbucket",
    "bb_diff_commits",
    input
  );
}
