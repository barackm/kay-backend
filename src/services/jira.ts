import axios, { AxiosError } from "axios";
import type { JiraCredentials, UserContext } from "../types/auth.js";

export async function fetchUserContext(
  credentials: JiraCredentials
): Promise<UserContext> {
  const { email, apiToken, baseUrl } = credentials;

  const authHeader = Buffer.from(`${email}:${apiToken}`).toString("base64");

  const axiosInstance = axios.create({
    baseURL: baseUrl,
    headers: {
      Authorization: `Basic ${authHeader}`,
      Accept: "application/json",
    },
  });

  try {
    const [myselfResponse, projectsResponse] = await Promise.all([
      axiosInstance.get("/rest/api/3/myself"),
      axiosInstance.get("/rest/api/3/project/search?maxResults=1000"),
    ]);

    const accountData = myselfResponse.data;
    const projectsData = projectsResponse.data;

    const projects = (projectsData.values || []).map(
      (project: { key: string; name: string }) => ({
        key: project.key,
        name: project.name,
      })
    );

    const permissions: string[] = [];
    if (projects.length > 0) {
      permissions.push("BROWSE_PROJECTS");
      permissions.push("CREATE_ISSUES");
    }

    return {
      accountId: accountData.accountId,
      displayName: accountData.displayName,
      email: accountData.emailAddress || email,
      baseUrl,
      projects,
      permissions,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{
        message?: string;
        errorMessages?: string[];
      }>;
      const message =
        axiosError.response?.data?.message ||
        axiosError.response?.data?.errorMessages?.join(", ") ||
        axiosError.message ||
        "Failed to fetch user context from Jira";
      throw new Error(`Jira API error: ${message}`);
    }
    throw error;
  }
}
