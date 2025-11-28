import { callMCPTool } from "../client.js";

export interface BbGetPrInput {
  /** Workspace slug containing the repository. If not provided, the system will use your default workspace. Example: "myteam" */
  workspaceSlug?: string;
  /** Repository slug containing the pull request. This must be a valid repository in the specified workspace. Example: "project-api" */
  repoSlug: string;
  /** Numeric ID of the pull request to retrieve as a string. Must be a valid pull request ID in the specified repository. Example: "42" */
  prId: string;
  /** Set to true to retrieve the full diff content instead of just the summary. Default: true (rich output by default) */
  includeFullDiff?: boolean;
  /** Set to true to retrieve comments for the pull request. Default: false. Note: Enabling this may increase response time for pull requests with many comments due to additional API calls. */
  includeComments?: boolean;
}

export interface BbGetPrOutput {
  [key: string]: unknown;
}

/**
 * Retrieves detailed information about a specific pull request identified by `prId` within a repository (`repoSlug`). If `workspaceSlug` is not provided, the system will use your default workspace. Includes PR details, status, reviewers, and diff statistics. Set `includeFullDiff` to true (default) for the complete code changes. Set `includeComments` to true to also retrieve comments (default: false; Note: Enabling this may increase response time for pull requests with many comments). Returns rich information as formatted Markdown, including PR summary, code changes, and optionally comments. Requires Bitbucket credentials to be configured.
 */
export async function bbGetPr(
  kaySessionId: string,
  input: BbGetPrInput
): Promise<BbGetPrOutput> {
  return callMCPTool<BbGetPrOutput>(
    kaySessionId,
    "bitbucket",
    "bb_get_pr",
    input
  );
}
