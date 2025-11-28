import { callMCPTool } from "../client.js";

export interface BbAddBranchInput {
  /** Workspace slug containing the repository. If not provided, the system will use your default workspace (either configured via BITBUCKET_DEFAULT_WORKSPACE or the first workspace in your account). Example: "myteam" */
  workspaceSlug?: string;
  /** Repository slug where the branch will be created. */
  repoSlug: string;
  /** The name for the new branch. */
  newBranchName: string;
  /** The name of the branch or the commit hash to branch from. */
  sourceBranchOrCommit: string;
}

export interface BbAddBranchOutput {
  [key: string]: unknown;
}

/**
 * Creates a new branch in a specified Bitbucket repository. Requires the workspace slug (`workspaceSlug`), repository slug (`repoSlug`), the desired new branch name (`newBranchName`), and the source branch or commit hash (`sourceBranchOrCommit`) to branch from. Requires repository write permissions. Returns a success message.
 */
export async function bbAddBranch(
  kaySessionId: string,
  input: BbAddBranchInput
): Promise<BbAddBranchOutput> {
  return callMCPTool<BbAddBranchOutput>(
    kaySessionId,
    "bitbucket",
    "bb_add_branch",
    input
  );
}
