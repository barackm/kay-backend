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
  kmesh: "kyg-kmesh-mcp-server",
};

export class MCPServerRegistry {
  private connections: Map<string, MCPClient> = new Map();
  private configs: Map<string, ServerConfig> = new Map();

  async connect(config: ServerConfig): Promise<void> {
    if (this.connections.has(config.name)) {
      throw new Error(`Server ${config.name} is already connected`);
    }

    const serverPath = config.path || SERVER_MAPPINGS[config.name];
    if (!serverPath) {
      throw new Error(
        `Server ${
          config.name
        } not found in mappings. Available servers: ${Object.keys(
          SERVER_MAPPINGS
        ).join(", ")}`
      );
    }

    const resolvedPath = this.resolveServerPath(serverPath);
    const client = new MCPClient();

    const serverEnv: Record<string, string> = {
      ...(config.env || {}),
    };

    if (ENV.API_BASE_URL) {
      serverEnv.API_BASE_URL = ENV.API_BASE_URL;
    }

    if (ENV.BEARER_TOKEN) {
      serverEnv.BEARER_TOKEN = ENV.BEARER_TOKEN;
    }

    await client.connect(resolvedPath, serverEnv);
    this.connections.set(config.name, client);
    this.configs.set(config.name, {
      name: config.name,
      path: resolvedPath,
      ...(config.env && { env: config.env }),
    });
  }

  getClient(name: string): MCPClient {
    const client = this.connections.get(name);
    if (!client) {
      throw new Error(`Server ${name} is not connected`);
    }
    return client;
  }

  async disconnect(name: string): Promise<void> {
    const client = this.connections.get(name);
    if (!client) {
      throw new Error(`Server ${name} is not connected`);
    }
    await client.disconnect();
    this.connections.delete(name);
    this.configs.delete(name);
  }

  getServerConfig(name: string): ServerConfig {
    const config = this.configs.get(name);
    if (!config) {
      throw new Error(`Server ${name} is not connected`);
    }
    return config;
  }

  listConnections(): string[] {
    return Array.from(this.connections.keys());
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

    const siblingPath = resolve(process.cwd(), "..", path, "dist", "index.js");
    if (existsSync(siblingPath)) {
      return siblingPath;
    }

    const siblingPathAlt = resolve(process.cwd(), "..", path, "index.js");
    if (existsSync(siblingPathAlt)) {
      return siblingPathAlt;
    }

    throw new Error(
      `Server path not found: ${path}. Tried: ${npmPath}, ${npmPathAlt}, ${siblingPath}, ${siblingPathAlt}`
    );
  }
}
