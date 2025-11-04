import jwt from "jsonwebtoken";
import crypto from "crypto";
import type {
  JiraCredentials,
  JwtPayload,
  CliSessionPayload,
} from "../../types/auth.js";
import { ENV } from "../../config/env.js";

export function generateToken(credentials: JiraCredentials): string {
  return jwt.sign(credentials, ENV.JWT_SECRET, {
    expiresIn: ENV.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, ENV.JWT_SECRET) as JwtPayload;
}

export function generateCliSessionToken(kaySessionId: string): string {
  const payload: CliSessionPayload = {
    kay_session_id: kaySessionId,
  };
  const secret = ENV.K_SESSION_SECRET || ENV.JWT_SECRET;
  if (!secret) {
    throw new Error("K_SESSION_SECRET or JWT_SECRET must be configured");
  }
  return jwt.sign(payload, secret, {
    expiresIn: ENV.CLI_SESSION_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyCliSessionToken(token: string): CliSessionPayload {
  const secret = ENV.K_SESSION_SECRET || ENV.JWT_SECRET;
  if (!secret) {
    throw new Error("K_SESSION_SECRET or JWT_SECRET must be configured");
  }
  return jwt.verify(token, secret) as CliSessionPayload;
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
