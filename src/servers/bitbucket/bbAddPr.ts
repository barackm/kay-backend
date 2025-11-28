import { callMCPTool } from "../client.js";

export interface BbAddPrInput {
  /** Workspace slug containing the repository. If not provided, the system will use your default workspace. Example: "myteam" */
  workspaceSlug?: string;
  /** Repository slug to create the pull request in. This must be a valid repository in the specified workspace. Example: "project-api" */
  repoSlug: string;
  /** Title for the pull request. Example: "Add new feature" */
  prTitle: string;
  /** Source branch name (the branch containing your changes). Example: "feature/new-login" */
  sourceBranch: string;
  /** Destination branch name (the branch you want to merge into, defaults to main). Example: "develop" */
  destinationBranch?: string;
  /** Optional description for the pull request in Markdown format. Supports standard Markdown syntax including headings, lists, code blocks, and links. */
  description?: string;
  /** Whether to close the source branch after the pull request is merged. Default: false */
  closeSourceBranch?: boolean;
}

export interface BbAddPrOutput {
  [key: string]: unknown;
}

/**
 * Creates a new pull request in a repository (`repoSlug`). If `workspaceSlug` is not provided, the system will use your default workspace. Required parameters include `prTitle` (the PR title), `sourceBranch` (branch with changes), and optionally `destinationBranch` (target branch, defaults to main/master). The `description` parameter accepts Markdown-formatted text for the PR description. Set `closeSourceBranch` to true to automatically delete the source branch after merging. Returns the newly created pull request details as formatted Markdown. Requires Bitbucket credentials with write permissions to be configured.
 */
export async function bbAddPr(
  kaySessionId: string,
  input: BbAddPrInput
): Promise<BbAddPrOutput> {
  return callMCPTool<BbAddPrOutput>(
    kaySessionId,
    "bitbucket",
    "bb_add_pr",
    input
  );
}
