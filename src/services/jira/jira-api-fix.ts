/**
 * Workaround for deprecated Jira API endpoints in @orengrinker/jira-mcp-server
 * 
 * This module provides direct implementations of search_issues and get_board_issues
 * using the correct Jira API endpoints until the package is updated.
 * 
 * Reference: https://developer.atlassian.com/changelog/#CHANGE-2046
 */

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { name: string } };
    assignee?: { displayName: string; accountId: string };
    priority: { name: string };
    issuetype: { name: string };
    created: string;
    updated: string;
    duedate?: string;
    labels: string[];
    components: Array<{ name: string }>;
    timetracking?: { timeSpent: string; timeSpentSeconds: number };
  };
}

interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
  maxResults: number;
  startAt: number;
}

/**
 * Search issues using Jira API v3 with the correct endpoint
 * Uses POST /rest/api/3/search/jql (new endpoint as of May 2025)
 */
export async function searchIssuesDirect(
  baseUrl: string,
  email: string,
  apiToken: string,
  jql: string,
  maxResults: number = 50
): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  const url = `${baseUrl}/rest/api/3/search/jql`;

  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jql,
      maxResults,
      fields: [
        "summary",
        "status",
        "assignee",
        "priority",
        "issuetype",
        "created",
        "updated",
        "duedate",
        "labels",
        "components",
        "timetracking",
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Jira API error: ${response.status} ${response.statusText}. ${errorText}`
    );
  }

  const data: JiraSearchResponse = await response.json();

  // Format response to match MCP server's markdown format
  const issuesText = data.issues
    .map((issue) => {
      const assignee = issue.fields.assignee
        ? issue.fields.assignee.displayName
        : "Unassigned";
      const status = issue.fields.status.name;
      const priority = issue.fields.priority.name;
      const type = issue.fields.issuetype.name;
      const created = new Date(issue.fields.created).toLocaleString();

      return `- **${issue.key}**: ${issue.fields.summary}
  - Status: ${status}
  - Type: ${type}
  - Priority: ${priority}
  - Assignee: ${assignee}
  - Created: ${created}`;
    })
    .join("\n\n");

  const summary = `Found ${data.total} issue(s) (showing ${data.issues.length})`;

  const markdown = `# 🔍 Issue Search Results

${summary}

## Issues

${issuesText || "No issues found."}

## Search Query
\`${jql}\`

## Quick Actions
- View issue details: Use \`get_issue_details\` with any issue key
- Refine search: Modify the JQL query`;

  return {
    content: [
      {
        type: "text",
        text: markdown,
      },
    ],
  };
}

/**
 * Get board details to extract project key
 */
async function getBoardDetails(
  baseUrl: string,
  email: string,
  apiToken: string,
  boardId: string
): Promise<{ projectKey: string; projectName: string }> {
  const url = new URL(`${baseUrl}/rest/agile/1.0/board/${boardId}`);

  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Jira API error: ${response.status} ${response.statusText}. ${errorText}`
    );
  }

  const data = await response.json();
  return {
    projectKey: data.location?.projectKey || data.location?.projectId || "",
    projectName: data.location?.projectName || "",
  };
}

/**
 * Get board issues using Jira API v3
 * Fetches board details first to get the project key, then searches issues
 */
export async function getBoardIssuesDirect(
  baseUrl: string,
  email: string,
  apiToken: string,
  boardId: string,
  maxResults: number = 50,
  assigneeFilter?: string,
  statusFilter?: string
): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  // First, get board details to extract project key
  const boardDetails = await getBoardDetails(baseUrl, email, apiToken, boardId);
  const projectKey = boardDetails.projectKey;

  if (!projectKey) {
    throw new Error(
      `Could not determine project key for board ${boardId}. Board may not be associated with a project.`
    );
  }

  // Build JQL query based on filters
  let jql = `project = "${projectKey}"`;

  if (assigneeFilter === "currentUser") {
    jql += " AND assignee = currentUser()";
  } else if (assigneeFilter === "unassigned") {
    jql += " AND assignee is EMPTY";
  }

  if (statusFilter === "new") {
    jql += " AND statusCategory = 'New'";
  } else if (statusFilter === "indeterminate") {
    jql += " AND statusCategory = 'Indeterminate'";
  } else if (statusFilter === "done") {
    jql += " AND statusCategory = 'Done'";
  }

  jql += " ORDER BY updated DESC";

  // Use the search function
  return searchIssuesDirect(baseUrl, email, apiToken, jql, maxResults);
}
