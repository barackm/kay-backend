import * as bitbucket from "../src/servers/bitbucket/index.js";

/**
 * Example: Using Bitbucket MCP tools with code execution pattern
 *
 * This demonstrates how an AI agent would write code to interact with
 * Bitbucket using the generated tool files.
 */

async function exampleUsage(kaySessionId: string) {
    // Example 1: Get a pull request
    const pr = await bitbucket.bbGetPr(kaySessionId, {
        repoSlug: "my-repo",
        prId: "42",
        includeFullDiff: true,
        includeComments: false,
    });
    console.log("Pull Request:", pr);

    // Example 2: List all PRs
    const allPrs = await bitbucket.bbLsPrs(kaySessionId, {
        repoSlug: "my-repo",
    });
    console.log("All PRs:", allPrs);

    // Example 3: Approve a PR
    await bitbucket.bbApprovePr(kaySessionId, {
        workspaceSlug: "my-workspace",
        repoSlug: "my-repo",
        pullRequestId: 42,
    });
    console.log("PR approved");

    // Example 4: Search code
    const searchResults = await bitbucket.bbSearch(kaySessionId, {
        query: "TODO",
        workspaceSlug: "my-workspace",
    });
    console.log("Search results:", searchResults);
}

/**
 * Key Benefits:
 *
 * 1. Token Efficiency: Load only the tools you need
 * 2. Data Filtering: Filter large datasets in code before returning to model
 * 3. Complex Logic: Write loops, conditionals, error handling in code
 * 4. Per-User Auth: Each user's credentials from database automatically used
 */

// This is how it works at runtime:
// 1. User authenticates → credentials stored in DB
// 2. AI calls: await bitbucket.bbGetPr(sessionId, { ... })
// 3. System:
//    - Gets user's Bitbucket credentials from DB
//    - Creates MCP client with those credentials
//    - Calls the tool
//    - Returns result

// Export for use
export { exampleUsage };
