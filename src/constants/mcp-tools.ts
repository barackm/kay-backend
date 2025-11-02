export const JIRA_READ_TOOLS = [
  "jira_search",
  "jira_get_issue",
  "jira_get_all_projects",
  "jira_get_project_issues",
  "jira_get_worklog",
  "jira_get_transitions",
  "jira_search_fields",
  "jira_get_agile_boards",
  "jira_get_board_issues",
  "jira_get_sprints_from_board",
  "jira_get_sprint_issues",
  "jira_get_issue_link_types",
  "jira_batch_get_changelogs",
  "jira_get_user_profile",
  "jira_download_attachments",
  "jira_get_project_versions",
] as const;

export const JIRA_WRITE_TOOLS = [
  "jira_create_issue",
  "jira_update_issue",
  "jira_delete_issue",
  "jira_batch_create_issues",
  "jira_add_comment",
  "jira_transition_issue",
  "jira_add_worklog",
  "jira_link_to_epic",
  "jira_create_sprint",
  "jira_update_sprint",
  "jira_create_issue_link",
  "jira_remove_issue_link",
  "jira_create_version",
  "jira_batch_create_versions",
] as const;

export const CONFLUENCE_READ_TOOLS = [
  "confluence_search",
  "confluence_get_page",
  "confluence_get_page_children",
  "confluence_get_comments",
  "confluence_get_labels",
  "confluence_search_user",
] as const;

export const CONFLUENCE_WRITE_TOOLS = [
  "confluence_create_page",
  "confluence_update_page",
  "confluence_delete_page",
  "confluence_add_label",
  "confluence_add_comment",
] as const;

export const ALL_JIRA_TOOLS = [
  ...JIRA_READ_TOOLS,
  ...JIRA_WRITE_TOOLS,
] as const;

export const ALL_CONFLUENCE_TOOLS = [
  ...CONFLUENCE_READ_TOOLS,
  ...CONFLUENCE_WRITE_TOOLS,
] as const;

export const ALL_MCP_ATLASSIAN_TOOLS = [
  ...ALL_JIRA_TOOLS,
  ...ALL_CONFLUENCE_TOOLS,
] as const;

export type JiraReadTool = (typeof JIRA_READ_TOOLS)[number];
export type JiraWriteTool = (typeof JIRA_WRITE_TOOLS)[number];
export type ConfluenceReadTool = (typeof CONFLUENCE_READ_TOOLS)[number];
export type ConfluenceWriteTool = (typeof CONFLUENCE_WRITE_TOOLS)[number];
export type JiraTool = (typeof ALL_JIRA_TOOLS)[number];
export type ConfluenceTool = (typeof ALL_CONFLUENCE_TOOLS)[number];
export type MCPAtlassianTool = (typeof ALL_MCP_ATLASSIAN_TOOLS)[number];
