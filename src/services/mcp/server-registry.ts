import { MCPClient } from "./client.js";
import { resolve } from "path";
import { existsSync } from "fs";
import { ENV } from "../../config/env.js";

export interface ServerConfig {
  name: string;
  path?: string;
  env?: Record<string, string>;
}

export interface ServerMapping {
  [name: string]: string;
}

const SERVER_MAPPINGS: ServerMapping = {
  "kyg-kmesh": "kyg-kmesh-mcp-server",
};

export class MCPServerRegistry {
  private connections: Map<string, Map<string, MCPClient>> = new Map();
  private configs: Map<string, Map<string, ServerConfig>> = new Map();
  private connectionPromises: Map<string, Map<string, Promise<void>>> =
    new Map();

  /**
   * Get or create a connection to an MCP server for a user.
   * Reuses existing connections instead of creating new ones.
   */
  async connect(userId: string, config: ServerConfig): Promise<void> {
    const userConnections = this.connections.get(userId) || new Map();
    const userConfigs = this.configs.get(userId) || new Map();
    const userPromises = this.connectionPromises.get(userId) || new Map();

    // If already connected, return immediately
    if (userConnections.has(config.name)) {
      return;
    }

    // If connection is in progress, wait for it
    if (userPromises.has(config.name)) {
      await userPromises.get(config.name);
      return;
    }

    // Start new connection
    const connectionPromise = this._createConnection(
      userId,
      config,
      userConnections,
      userConfigs
    );
    userPromises.set(config.name, connectionPromise);
    this.connectionPromises.set(userId, userPromises);

    try {
      await connectionPromise;
    } finally {
      userPromises.delete(config.name);
      if (userPromises.size === 0) {
        this.connectionPromises.delete(userId);
      }
    }
  }

  private async _createConnection(
    userId: string,
    config: ServerConfig,
    userConnections: Map<string, MCPClient>,
    userConfigs: Map<string, ServerConfig>
  ): Promise<void> {
    const serverPath = config.path || SERVER_MAPPINGS[config.name];
    if (!serverPath) {
      throw new Error(
        `Server ${config.name} not found. Please provide a path or ensure server is configured.`
      );
    }

    const resolvedPath = this.resolveServerPath(serverPath);
    const client = new MCPClient();

    const serverEnv: Record<string, string> = {
      ...(config.env || {}),
    };

    if (config.name === "jira") {
      if (serverEnv.JIRA_HOST && !serverEnv.JIRA_BASE_URL) {
        serverEnv.JIRA_BASE_URL = serverEnv.JIRA_HOST;
      }
    }

    if (ENV.API_BASE_URL && !serverEnv.API_BASE_URL) {
      serverEnv.API_BASE_URL = ENV.API_BASE_URL;
    }

    if (ENV.BEARER_TOKEN && !serverEnv.BEARER_TOKEN) {
      serverEnv.BEARER_TOKEN = ENV.BEARER_TOKEN;
    }

    try {
      await client.connect(resolvedPath, serverEnv, config.name);
      userConnections.set(config.name, client);
      userConfigs.set(config.name, {
        name: config.name,
        path: resolvedPath,
        ...(config.env && { env: config.env }),
      });

      this.connections.set(userId, userConnections);
      this.configs.set(userId, userConfigs);
    } catch (error) {
      await client.disconnect().catch(() => {});
      throw error;
    }
  }

  getClient(userId: string, name: string): MCPClient {
    const userConnections = this.connections.get(userId);
    if (!userConnections) {
      throw new Error(`No connections found for user`);
    }
    const client = userConnections.get(name);
    if (!client) {
      throw new Error(`Server ${name} is not connected`);
    }
    return client;
  }

  async disconnect(userId: string, name: string): Promise<void> {
    console.log(`[Registry] Disconnecting ${name} for user ${userId}`);
    const userConnections = this.connections.get(userId);
    if (!userConnections) {
      throw new Error(`No connections found for user`);
    }
    const client = userConnections.get(name);
    if (!client) {
      throw new Error(`Server ${name} is not connected`);
    }
    await client.disconnect();
    userConnections.delete(name);
    if (userConnections.size === 0) {
      this.connections.delete(userId);
      this.configs.delete(userId);
    }
    console.log(`[Registry] ${name} disconnected`);
  }

  getServerConfig(userId: string, name: string): ServerConfig {
    const userConfigs = this.configs.get(userId);
    if (!userConfigs) {
      throw new Error(`No connections found for user`);
    }
    const config = userConfigs.get(name);
    if (!config) {
      throw new Error(`Server ${name} is not connected`);
    }
    return config;
  }

  listConnections(userId: string): string[] {
    const userConnections = this.connections.get(userId);
    if (!userConnections) {
      return [];
    }
    return Array.from(userConnections.keys());
  }

  /**
   * Check if a server is currently connected for a user
   */
  isConnected(userId: string, name: string): boolean {
    const userConnections = this.connections.get(userId);
    return userConnections?.has(name) ?? false;
  }

  /**
   * Get or create a connection, ensuring the server is ready to use
   */
  async ensureConnected(
    userId: string,
    config: ServerConfig
  ): Promise<MCPClient> {
    await this.connect(userId, config);
    return this.getClient(userId, config.name);
  }

  /**
   * Disconnect all servers for a user (useful for cleanup)
   */
  async disconnectAll(userId: string): Promise<void> {
    const userConnections = this.connections.get(userId);
    if (!userConnections) {
      return;
    }

    const disconnectPromises: Promise<void>[] = [];
    userConnections.forEach((client) => {
      disconnectPromises.push(client.disconnect().catch(() => {}));
    });

    await Promise.all(disconnectPromises);
    this.connections.delete(userId);
    this.configs.delete(userId);
    this.connectionPromises.delete(userId);
  }

  private resolveServerPath(path: string): string {
    if (
      path.startsWith("/") ||
      path.startsWith("./") ||
      path.startsWith("../")
    ) {
      if (existsSync(path)) {
        return path;
      }
      throw new Error(`Server path not found: ${path}`);
    }

    const npmPath = resolve(
      process.cwd(),
      "node_modules",
      path,
      "dist",
      "index.js"
    );
    if (existsSync(npmPath)) {
      return npmPath;
    }

    const npmPathAlt = resolve(process.cwd(), "node_modules", path, "index.js");
    if (existsSync(npmPathAlt)) {
      return npmPathAlt;
    }

    const npmPathBuild = resolve(
      process.cwd(),
      "node_modules",
      path,
      "build",
      "index.js"
    );
    if (existsSync(npmPathBuild)) {
      return npmPathBuild;
    }

    const siblingPath = resolve(process.cwd(), "..", path, "dist", "index.js");
    if (existsSync(siblingPath)) {
      return siblingPath;
    }

    const siblingPathAlt = resolve(process.cwd(), "..", path, "index.js");
    if (existsSync(siblingPathAlt)) {
      return siblingPathAlt;
    }

    throw new Error(
      `Server path not found: ${path}. Tried: ${npmPath}, ${npmPathAlt}, ${npmPathBuild}, ${siblingPath}, ${siblingPathAlt}`
    );
  }
}
