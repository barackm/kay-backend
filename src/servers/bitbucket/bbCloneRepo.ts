import { callMCPTool } from "../client.js";

export interface BbCloneRepoInput {
  /** Bitbucket workspace slug containing the repository. If not provided, the tool will use your default workspace (either configured via BITBUCKET_DEFAULT_WORKSPACE or the first workspace in your account). Example: "myteam" */
  workspaceSlug?: string;
  /** Repository name/slug to clone. This is the short name of the repository. Example: "project-api" */
  repoSlug: string;
  /** Directory path where the repository will be cloned. IMPORTANT: Absolute paths are strongly recommended (e.g., "/home/user/projects" or "C:\Users\name\projects"). Relative paths will be resolved relative to the server's working directory, which may not be what you expect. The repository will be cloned into a subdirectory at targetPath/repoSlug. Make sure you have write permissions to this location. */
  targetPath: string;
}

export interface BbCloneRepoOutput {
  [key: string]: unknown;
}

/**
 * Clones a Bitbucket repository to your local filesystem using SSH (preferred) or HTTPS. Requires Bitbucket credentials and proper SSH key setup for optimal usage.

**Parameters:**
- `workspaceSlug`: The Bitbucket workspace containing the repository (optional - will use default if not provided)
- `repoSlug`: The repository name to clone (required)
- `targetPath`: Parent directory where repository will be cloned (required)

**Path Handling:**
- Absolute paths are strongly recommended (e.g., "/home/user/projects" or "C:\Users\name\projects")
- Relative paths (e.g., "./my-repos" or "../downloads") will be resolved relative to the server's working directory, which may not be what you expect
- The repository will be cloned into a subdirectory at `targetPath/repoSlug`
- Make sure you have write permissions to the target directory

**SSH Requirements:**
- SSH keys must be properly configured for Bitbucket
- SSH agent should be running with your keys added
- Will automatically fall back to HTTPS if SSH is unavailable

**Example Usage:**
```
// Clone a repository to a specific absolute path
bb_clone_repo({repoSlug: "my-project", targetPath: "/home/user/projects"})

// Specify the workspace and use a relative path (less reliable)
bb_clone_repo({workspaceSlug: "my-team", repoSlug: "api-service", targetPath: "./downloads"})
```

**Returns:** Success message with clone details or an error message with troubleshooting steps.
 */
export async function bbCloneRepo(
  kaySessionId: string,
  input: BbCloneRepoInput
): Promise<BbCloneRepoOutput> {
  return callMCPTool<BbCloneRepoOutput>(
    kaySessionId,
    "bitbucket",
    "bb_clone_repo",
    input
  );
}
