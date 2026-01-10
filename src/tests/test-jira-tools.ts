#!/usr/bin/env node
import "dotenv/config";
import { MCPServerRegistry } from "../services/mcp/server-registry.js";
import { prisma } from "../db/client.js";
import { decrypt } from "../services/encryption.js";
import { JQL_QUERIES, buildJQL } from "./jql-queries.js";

/**
 * KNOWN ISSUES WITH JIRA MCP SERVER PACKAGE:
 *
 * The following tools are failing due to deprecated Jira API endpoints in @orengrinker/jira-mcp-server:
 *
 * 1. get_board_issues:
 *    - Expected: Returns issues from a specific board with filtering (assignee, status, etc.)
 *    - Actual: Uses deprecated /rest/api/3/search endpoint → 410 Gone
 *    - Fix needed: Package should use /rest/api/3/search/jql endpoint
 *
 * 2. search_issues:
 *    - Expected: Searches issues using JQL (Jira Query Language)
 *    - Actual: Uses deprecated /rest/api/3/search endpoint → 410 Gone
 *    - Fix needed: Package should use /rest/api/3/search/jql endpoint
 *
 * Reference: https://developer.atlassian.com/changelog/#CHANGE-2046
 *
 * These are package-level bugs that need to be fixed in @orengrinker/jira-mcp-server.
 * The test suite correctly identifies these failures.
 */

function extractTextFromResult(result: unknown): string | null {
  if (typeof result === "object" && result !== null) {
    const data = result as { content?: Array<{ type: string; text: string }> };
    if (data.content) {
      const textContent = data.content.find((c) => c.type === "text")?.text;
      return textContent || null;
    }
  }
  return null;
}

function extractProjectKeyFromMarkdown(text: string): string | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (line && line.startsWith("|") && line.includes("Key")) {
      const nextLine = lines[i + 2]?.trim();
      if (nextLine && nextLine.startsWith("|")) {
        const parts = nextLine
          .split("|")
          .map((p) => p.trim())
          .filter(Boolean);
        if (parts.length > 0 && parts[0]) {
          return parts[0];
        }
      }
    }
  }
  return null;
}

function extractBoardIdFromMarkdown(text: string): string | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (line && line.startsWith("|") && line.includes("ID")) {
      const nextLine = lines[i + 2]?.trim();
      if (nextLine && nextLine.startsWith("|")) {
        const parts = nextLine
          .split("|")
          .map((p) => p.trim())
          .filter(Boolean);
        if (parts.length > 0 && parts[0]) {
          return parts[0];
        }
      }
    }
  }
  return null;
}

function extractIssueKeyFromMarkdown(text: string): string | null {
  const issueKeyMatch = text.match(/\b([A-Z]+-\d+)\b/);
  return issueKeyMatch?.[1] ?? null;
}

async function getJiraCredentials(userId: string) {
  const server = await prisma.mcpServer.findUnique({
    where: { name: "jira" },
  });

  if (!server) {
    throw new Error("Jira server not found in database");
  }

  const credential = await prisma.userServerCredential.findUnique({
    where: {
      userId_serverId: {
        userId,
        serverId: server.id,
      },
    },
  });

  if (!credential) {
    throw new Error(
      `No credentials found for user ${userId}. Please connect to Jira first via POST /mcp/connect/jira`
    );
  }

  const envVars = JSON.parse(decrypt(credential.encryptedEnvVars));
  const serverPath = server.npmPackage || server.localPath;

  if (!serverPath) {
    throw new Error("Server path not configured for Jira");
  }

  return { envVars, serverPath };
}

async function testTool(
  client: Awaited<ReturnType<MCPServerRegistry["ensureConnected"]>>,
  toolName: string,
  args: Record<string, unknown>,
  description: string
) {
  try {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🔧 Testing: ${toolName}`);
    console.log(`📋 Description: ${description}`);
    console.log(`📝 Arguments:`, JSON.stringify(args, null, 2));
    console.log(`${"-".repeat(80)}\n`);

    // The workaround is now handled automatically in MCPClient.callTool
    const result = await client.callTool(toolName, args);

    console.log(`✅ Success!`);
    if (typeof result === "object" && result !== null) {
      const resultStr = JSON.stringify(result, null, 2);
      if (resultStr.length > 2000) {
        console.log(resultStr.substring(0, 2000) + "\n... [truncated]");
      } else {
        console.log(resultStr);
      }
    } else {
      console.log(result);
    }
    return { success: true, result };
  } catch (error) {
    console.error(`❌ Failed!`);
    console.error(error instanceof Error ? error.message : "Unknown error");
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    return { success: false, error };
  }
}

async function testAllJiraTools(userId: string) {
  console.log("🚀 Starting Jira MCP Tools Test Suite\n");
  console.log(`👤 User ID: ${userId}\n`);

  const { envVars, serverPath } = await getJiraCredentials(userId);
  const registry = new MCPServerRegistry();
  const client = await registry.ensureConnected(userId, {
    name: "jira",
    path: serverPath,
    env: envVars,
  });

  const results: Array<{
    tool: string;
    success: boolean;
    error?: unknown;
  }> = [];

  console.log("📊 Testing System & User Tools\n");

  const currentUser = await testTool(
    client,
    "get_current_user",
    {},
    "Get information about the currently authenticated user"
  );
  results.push({ tool: "get_current_user", success: currentUser.success });

  const serverInfo = await testTool(
    client,
    "get_server_info",
    {},
    "Get Jira server information and status"
  );
  results.push({ tool: "get_server_info", success: serverInfo.success });

  console.log("\n\n📁 Testing Project Tools\n");

  const projects = await testTool(
    client,
    "get_projects",
    {},
    "List all accessible projects"
  );
  results.push({ tool: "get_projects", success: projects.success });

  let firstProjectKey: string | null = null;
  if (projects.success && projects.result) {
    const textContent = extractTextFromResult(projects.result);
    if (textContent) {
      firstProjectKey = extractProjectKeyFromMarkdown(textContent);
    }
  }

  if (!firstProjectKey) {
    firstProjectKey = "KAN";
    console.log(
      `⚠️  Could not extract project key, using default: ${firstProjectKey}`
    );
  }

  if (firstProjectKey) {
    const projectDetails = await testTool(
      client,
      "get_project_details",
      { projectKey: firstProjectKey },
      `Get detailed information about project ${firstProjectKey}`
    );
    results.push({
      tool: "get_project_details",
      success: projectDetails.success,
    });
  }

  console.log("\n\n📋 Testing Board Tools\n");

  const boards = await testTool(
    client,
    "get_boards",
    {},
    "List all available Jira boards"
  );
  results.push({ tool: "get_boards", success: boards.success });

  let firstBoardId: string | null = null;
  if (boards.success && boards.result) {
    const textContent = extractTextFromResult(boards.result);
    if (textContent) {
      firstBoardId = extractBoardIdFromMarkdown(textContent);
    }
  }

  if (!firstBoardId) {
    firstBoardId = "1";
    console.log(
      `⚠️  Could not extract board ID, using default: ${firstBoardId}`
    );
  }

  if (firstBoardId) {
    const boardDetails = await testTool(
      client,
      "get_board_details",
      { boardId: firstBoardId },
      `Get detailed information about board ${firstBoardId}`
    );
    results.push({
      tool: "get_board_details",
      success: boardDetails.success,
    });

    const boardIssues = await testTool(
      client,
      "get_board_issues",
      {
        boardId: firstBoardId,
        maxResults: 5,
      },
      `Get issues from board ${firstBoardId} (using workaround for deprecated API)`
    );
    results.push({
      tool: "get_board_issues",
      success: boardIssues.success,
    });
  }

  console.log("\n\n🔍 Testing Issue Search Tools\n");

  let firstIssueKey: string | null = null;
  if (firstProjectKey) {
    const searchAll = await testTool(
      client,
      "search_issues",
      {
        jql: `project = ${firstProjectKey} ${JQL_QUERIES.allIssues}`,
        maxResults: 5,
      },
      `Search all issues in project ${firstProjectKey}`
    );
    results.push({ tool: "search_issues (all)", success: searchAll.success });

    const searchOpen = await testTool(
      client,
      "search_issues",
      {
        jql: `project = ${firstProjectKey} AND ${JQL_QUERIES.openIssues}`,
        maxResults: 5,
      },
      `Search open issues in project ${firstProjectKey}`
    );
    results.push({
      tool: "search_issues (open)",
      success: searchOpen.success,
    });

    if (searchAll.success && searchAll.result) {
      const textContent = extractTextFromResult(searchAll.result);
      if (textContent) {
        firstIssueKey = extractIssueKeyFromMarkdown(textContent);
      }
    }

    if (!firstIssueKey) {
      console.log(
        "⚠️  No issues found in search, will use created issue if available"
      );
    }
  }

  console.log("\n\n➕ Testing Issue Creation Tools\n");

  let createdIssueKey: string | null = null;
  if (firstProjectKey) {
    const createIssue = await testTool(
      client,
      "create_issue",
      {
        projectKey: firstProjectKey,
        issueType: "Task",
        summary: `Test Issue from Automated Test Suite - ${new Date().toISOString()}`,
        description:
          "This is a test issue created by the automated test suite.",
        priority: "Medium",
      },
      `Create a test issue in project ${firstProjectKey}`
    );
    results.push({ tool: "create_issue", success: createIssue.success });

    if (createIssue.success && createIssue.result) {
      const textContent = extractTextFromResult(createIssue.result);
      if (textContent) {
        const issueKeyMatch = textContent.match(
          /\*\*Issue Key\*\*[:\s]+([A-Z]+-\d+)/i
        );
        if (issueKeyMatch?.[1]) {
          createdIssueKey = issueKeyMatch[1];
          console.log(`\n✅ Created issue: ${createdIssueKey}`);
        }
      }
    }

    if (!firstIssueKey && createdIssueKey) {
      firstIssueKey = createdIssueKey;
      console.log(
        `\n📝 Using created issue ${firstIssueKey} for remaining tests`
      );
      console.log("⏳ Waiting 2 seconds for issue to be fully indexed...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (firstIssueKey) {
    console.log("\n\n📄 Testing Issue Detail Tools\n");

    const issueDetails = await testTool(
      client,
      "get_issue_details",
      {
        issueKey: firstIssueKey,
        includeComments: true,
        includeWorklogs: true,
      },
      `Get comprehensive details for issue ${firstIssueKey}`
    );
    results.push({
      tool: "get_issue_details",
      success: issueDetails.success,
    });

    console.log("\n\n💬 Testing Comment Tools\n");

    const addComment = await testTool(
      client,
      "add_comment",
      {
        issueKey: firstIssueKey,
        comment: `Test comment from automated test suite at ${new Date().toISOString()}`,
      },
      `Add a test comment to issue ${firstIssueKey}`
    );
    results.push({ tool: "add_comment", success: addComment.success });

    console.log("\n\n⏱️  Testing Worklog Tools\n");

    const getWorklogs = await testTool(
      client,
      "get_worklogs",
      {
        issueKey: firstIssueKey,
      },
      `Get worklogs for issue ${firstIssueKey}`
    );
    results.push({ tool: "get_worklogs", success: getWorklogs.success });

    console.log("\n\n✏️  Testing Issue Update Tools\n");

    const updateIssue = await testTool(
      client,
      "update_issue",
      {
        issueKey: firstIssueKey,
        description: `Updated description at ${new Date().toISOString()}`,
      },
      `Update issue ${firstIssueKey} description`
    );
    results.push({ tool: "update_issue", success: updateIssue.success });

    const transitions = await testTool(
      client,
      "transition_issue",
      {
        issueKey: firstIssueKey,
        transitionName: "In Progress",
        comment: "Moving to In Progress for testing",
      },
      `Transition issue ${firstIssueKey} to In Progress`
    );
    results.push({
      tool: "transition_issue",
      success: transitions.success,
    });
  } else {
    console.log(
      "\n⚠️  Skipping issue-dependent tests (no issue key available)"
    );
  }

  console.log("\n\n👥 Testing User Search Tools\n");

  const searchUsers = await testTool(
    client,
    "search_users",
    {
      query: "admin",
    },
    "Search for users matching 'admin'"
  );
  results.push({ tool: "search_users", success: searchUsers.success });

  let firstAccountId: string | null = null;
  if (searchUsers.success && searchUsers.result) {
    const textContent = extractTextFromResult(searchUsers.result);
    if (textContent) {
      const accountIdMatch = textContent.match(/Account ID[:\s*]+([^\s\n]+)/i);
      if (accountIdMatch?.[1]) {
        firstAccountId = accountIdMatch[1];
      }
      if (!firstAccountId) {
        const accountIdMatch2 = textContent.match(/account ID `([^`]+)`/i);
        if (accountIdMatch2?.[1]) {
          firstAccountId = accountIdMatch2[1];
        }
      }
    }
  }

  if (!firstAccountId && currentUser.success && currentUser.result) {
    const textContent = extractTextFromResult(currentUser.result);
    if (textContent) {
      const accountIdMatch = textContent.match(/Account ID[:\s*]+([^\s\n]+)/i);
      if (accountIdMatch?.[1]) {
        firstAccountId = accountIdMatch[1];
      }
      if (!firstAccountId) {
        const accountIdMatch2 = textContent.match(/account ID `([^`]+)`/i);
        if (accountIdMatch2?.[1]) {
          firstAccountId = accountIdMatch2[1];
        }
      }
    }
  }

  if (firstAccountId) {
    const userDetails = await testTool(
      client,
      "get_user_details",
      {
        accountId: firstAccountId,
      },
      `Get detailed information about user ${firstAccountId}`
    );
    results.push({
      tool: "get_user_details",
      success: userDetails.success,
    });
  }

  console.log("\n\n" + "=".repeat(80));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(80));

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const total = results.length;

  console.log(`\n✅ Successful: ${successful}/${total}`);
  console.log(`❌ Failed: ${failed}/${total}`);
  console.log(`\n📋 Detailed Results:\n`);

  results.forEach((result) => {
    const icon = result.success ? "✅" : "❌";
    console.log(`${icon} ${result.tool}`);
  });

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

const DEFAULT_USER_ID = "51a13fcd-1a6f-4f02-af2a-2234a3fa7107";
const userId = process.argv[2] || DEFAULT_USER_ID;

await testAllJiraTools(userId);
