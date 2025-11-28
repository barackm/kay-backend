import { callMCPTool } from "../client.js";

export interface BbAddPrCommentInput {
  /** Workspace slug containing the repository. If not provided, the system will use your default workspace. Example: "myteam" */
  workspaceSlug?: string;
  /** Repository slug containing the pull request. This must be a valid repository in the specified workspace. Example: "project-api" */
  repoSlug: string;
  /** Numeric ID of the pull request to add a comment to as a string. Must be a valid pull request ID in the specified repository. Example: "42" */
  prId: string;
  /** The content of the comment to add to the pull request in Markdown format. Bitbucket Cloud natively accepts Markdown - supports headings, lists, code blocks, links, and other standard Markdown syntax. */
  content: string;
  /** Optional inline location for the comment. If provided, this will create a comment on a specific line in a file. */
  inline?: Record<string, unknown>;
  /** The ID of the parent comment to reply to. If not provided, the comment will be a top-level comment. */
  parentId?: string;
}

export interface BbAddPrCommentOutput {
  [key: string]: unknown;
}

/**
 * Adds a comment to a specific pull request identified by `prId` within a repository (`repoSlug`). If `workspaceSlug` is not provided, the system will use your default workspace. The `content` parameter accepts Markdown-formatted text for the comment body. To reply to an existing comment, provide its ID in the `parentId` parameter. For inline code comments, provide both `inline.path` (file path) and `inline.line` (line number). Returns a success message as formatted Markdown. Requires Bitbucket credentials with write permissions to be configured.
 */
export async function bbAddPrComment(
  kaySessionId: string,
  input: BbAddPrCommentInput
): Promise<BbAddPrCommentOutput> {
  return callMCPTool<BbAddPrCommentOutput>(
    kaySessionId,
    "bitbucket",
    "bb_add_pr_comment",
    input
  );
}
