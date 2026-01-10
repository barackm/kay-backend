export const JQL_QUERIES = {
  allIssues: "ORDER BY created DESC",
  openIssues: "status != Done ORDER BY created DESC",
  myIssues: "assignee = currentUser() AND status != Done",
  recentIssues: "created >= -7d ORDER BY created DESC",
  highPriority: "priority in (Highest, High) AND status != Done",
  byProject: (projectKey: string) => `project = ${projectKey}`,
  byProjectAndStatus: (projectKey: string, status: string) =>
    `project = ${projectKey} AND status = "${status}"`,
  byAssignee: (assignee: string) => `assignee = ${assignee}`,
  byProjectAndAssignee: (projectKey: string, assignee: string) =>
    `project = ${projectKey} AND assignee = ${assignee}`,
  recentInProject: (projectKey: string) =>
    `project = ${projectKey} AND created >= -7d ORDER BY created DESC`,
  openInProject: (projectKey: string) =>
    `project = ${projectKey} AND status != Done ORDER BY created DESC`,
  myOpenInProject: (projectKey: string) =>
    `project = ${projectKey} AND assignee = currentUser() AND status != Done`,
};

export function buildJQL(
  projectKey?: string,
  filters?: {
    status?: string;
    assignee?: string;
    priority?: string[];
    created?: string;
    orderBy?: string;
  }
): string {
  const parts: string[] = [];

  if (projectKey) {
    parts.push(`project = ${projectKey}`);
  }

  if (filters?.status) {
    if (filters.status === "open") {
      parts.push("status != Done");
    } else {
      parts.push(`status = "${filters.status}"`);
    }
  }

  if (filters?.assignee) {
    if (filters.assignee === "me" || filters.assignee === "currentUser()") {
      parts.push("assignee = currentUser()");
    } else {
      parts.push(`assignee = ${filters.assignee}`);
    }
  }

  if (filters?.priority && filters.priority.length > 0) {
    parts.push(`priority in (${filters.priority.join(", ")})`);
  }

  if (filters?.created) {
    parts.push(`created >= ${filters.created}`);
  }

  const orderBy = filters?.orderBy || "created DESC";
  parts.push(`ORDER BY ${orderBy}`);

  return parts.join(" AND ");
}
