import { callMCPTool } from "../client.js";

export interface BbGetFileInput {
  /** Workspace slug containing the repository. If not provided, the system will use your default workspace. Example: "myteam" */
  workspaceSlug?: string;
  /** Repository slug containing the file. Example: "project-api" */
  repoSlug: string;
  /** Path to the file within the repository. Example: "README.md" or "src/main.js" */
  filePath: string;
  /** Optional branch name, tag, or commit hash to retrieve the file from. If omitted, uses the default branch. */
  revision?: string;
}

export interface BbGetFileOutput {
  [key: string]: unknown;
}

/**
 * Retrieves the content of a file from a Bitbucket repository identified by `workspaceSlug` and `repoSlug`. Specify the file to retrieve using the `filePath` parameter. Optionally, you can specify a `revision` (branch name, tag, or commit hash) to retrieve the file from - if omitted, the repository's default branch is used. Returns the raw content of the file as text. Requires Bitbucket credentials.
 */
export async function bbGetFile(
  kaySessionId: string,
  input: BbGetFileInput
): Promise<BbGetFileOutput> {
  return callMCPTool<BbGetFileOutput>(
    kaySessionId,
    "bitbucket",
    "bb_get_file",
    input
  );
}
