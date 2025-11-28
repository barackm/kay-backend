/**
 * Example: Testing MCP Tool Integration with AI
 * 
 * This example demonstrates how the AI can now access MCP tools
 * through the ask service.
 */

import { AskService } from "../src/services/ai/ask-service.js";

/**
 * Example 1: AI discovers and uses Bitbucket tools
 * 
 * When a user asks about Bitbucket, the AI will:
 * 1. Receive available Bitbucket tools (bb_ls_workspaces, bb_get_pr, etc.)
 * 2. Decide which tools to call based on the request
 * 3. Execute the tools via MCP
 * 4. Respond with the results
 */
async function exampleAIWithTools(kaySessionId: string) {
    const askService = new AskService();

    // User asks about their Bitbucket workspaces
    const response = await askService.processRequest({
        accountId: kaySessionId,
        request: {
            prompt: "List my Bitbucket workspaces",
            interactive: true,
        },
    });

    console.log("AI Response:", response.message);
    // Expected: AI will call bb_ls_workspaces tool and return formatted results
}

/**
 * Example 2: Multi-step tool usage
 * 
 * The AI can chain multiple tool calls to accomplish complex tasks
 */
async function exampleMultiStepTools(kaySessionId: string) {
    const askService = new AskService();

    // User asks for complex operation requiring multiple tools
    const response = await askService.processRequest({
        accountId: kaySessionId,
        request: {
            prompt: "Get pull request #42 from my-repo and tell me if it's approved",
            interactive: true,
        },
    });

    console.log("AI Response:", response.message);
    // Expected: AI will:
    // 1. Call bb_get_pr to get PR details
    // 2. Analyze the response
    // 3. Respond with approval status
}

/**
 * Example 3: User without connections
 * 
 * If user hasn't connected Bitbucket, no tools are available
 */
async function exampleNoTools(kaySessionId: string) {
    const askService = new AskService();

    const response = await askService.processRequest({
        accountId: kaySessionId,
        request: {
            prompt: "List my Bitbucket workspaces",
            interactive: true,
        },
    });

    console.log("AI Response:", response.message);
    // Expected: AI will explain it cannot access Bitbucket without connection
}

/**
 * How it works:
 * 
 * 1. User sends request to /ask endpoint
 * 2. ask-service calls getAvailableToolsForUser(kaySessionId)
 * 3. Tool registry:
 *    - Checks user's connections (Bitbucket, Jira, etc.)
 *    - Gets MCP client for each connected service
 *    - Retrieves tools from MCP servers
 *    - Converts to OpenAI format
 * 4. ask-service passes tools to OpenAI
 * 5. OpenAI decides which tools to call (if any)
 * 6. Tool executor runs the tools via MCP
 * 7. Results go back to OpenAI
 * 8. OpenAI generates final response
 * 9. Response sent to user
 */

export { exampleAIWithTools, exampleMultiStepTools, exampleNoTools };
