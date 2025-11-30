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

  async connect(userId: string, config: ServerConfig): Promise<void> {
    const userConnections = this.connections.get(userId) || new Map();
    const userConfigs = this.configs.get(userId) || new Map();

    if (userConnections.has(config.name)) {
      throw new Error(`Server ${config.name} is already connected`);
    }

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

    if (ENV.API_BASE_URL && !serverEnv.API_BASE_URL) {
      serverEnv.API_BASE_URL = ENV.API_BASE_URL;
    }

    if (ENV.BEARER_TOKEN && !serverEnv.BEARER_TOKEN) {
      serverEnv.BEARER_TOKEN = ENV.BEARER_TOKEN;
    }

    try {
      await client.connect(resolvedPath, serverEnv);
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

    // Handle local/sibling directories
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
