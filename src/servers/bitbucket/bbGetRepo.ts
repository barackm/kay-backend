import { callMCPTool } from "../client.js";

export interface BbGetRepoInput {
  /** Workspace slug containing the repository. If not provided, the system will use your default workspace (either configured via BITBUCKET_DEFAULT_WORKSPACE or the first workspace in your account). Example: "myteam" */
  workspaceSlug?: string;
  /** Repository slug to retrieve. This must be a valid repository in the specified workspace. Example: "project-api" */
  repoSlug: string;
}

export interface BbGetRepoOutput {
  [key: string]: unknown;
}

/**
 * Retrieves detailed information for a specific repository identified by `workspaceSlug` and `repoSlug`. Returns comprehensive repository details as formatted Markdown, including owner, main branch, comment/task counts, recent pull requests, and relevant links. Requires Bitbucket credentials.
 */
export async function bbGetRepo(
  kaySessionId: string,
  input: BbGetRepoInput
): Promise<BbGetRepoOutput> {
  return callMCPTool<BbGetRepoOutput>(
    kaySessionId,
    "bitbucket",
    "bb_get_repo",
    input
  );
}
