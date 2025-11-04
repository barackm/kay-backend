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

export function generateCliSessionToken(accountId: string): string {
  const payload: CliSessionPayload = {
    account_id: accountId,
  };
  return jwt.sign(payload, ENV.JWT_SECRET, {
    expiresIn: ENV.CLI_SESSION_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyCliSessionToken(token: string): CliSessionPayload {
  return jwt.verify(token, ENV.JWT_SECRET) as CliSessionPayload;
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
