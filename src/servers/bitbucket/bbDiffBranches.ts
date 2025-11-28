import { callMCPTool } from "../client.js";

export interface BbDiffBranchesInput {
  /** Workspace slug containing the repository. If not provided, the system will use your default workspace (either configured via BITBUCKET_DEFAULT_WORKSPACE or the first workspace in your account). Example: "myteam" */
  workspaceSlug?: string;
  /** Repository slug containing the branches. Must be a valid repository slug in the specified workspace. Example: "project-api" */
  repoSlug: string;
  /** Source branch for comparison. IMPORTANT NOTE: The output displays as "destinationBranch → sourceBranch", and parameter naming can be counterintuitive. For full code diffs, try both parameter orders if initial results show only summary. Example: "feature/login-redesign" */
  sourceBranch: string;
  /** Destination branch for comparison. IMPORTANT NOTE: The output displays as "destinationBranch → sourceBranch", and parameter naming can be counterintuitive. For full code diffs, try both parameter orders if initial results show only summary. If not specified, defaults to "main". Example: "develop" */
  destinationBranch?: string;
  /** Whether to include the full code diff in the output. Defaults to true for rich output. */
  includeFullDiff?: boolean;
  /** Maximum number of changed files to return in results */
  limit?: number;
  /** Pagination cursor for retrieving additional results */
  cursor?: number;
}

export interface BbDiffBranchesOutput {
  [key: string]: unknown;
}

/**
 * Shows changes between branches in a repository identified by `workspaceSlug` and `repoSlug`. Compares changes in `sourceBranch` relative to `destinationBranch`. Limits the number of files to show with `limit`. Returns the diff as formatted Markdown showing file changes, additions, and deletions. Requires Bitbucket credentials to be configured.
 */
export async function bbDiffBranches(
  kaySessionId: string,
  input: BbDiffBranchesInput
): Promise<BbDiffBranchesOutput> {
  return callMCPTool<BbDiffBranchesOutput>(
    kaySessionId,
    "bitbucket",
    "bb_diff_branches",
    input
  );
}
