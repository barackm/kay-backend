import type { Context, Next } from "hono";
import { verifyTokenWithKyg } from "./kyg-api.js";
import { prisma } from "../../db/client.js";

export interface AuthUser {
  id: string;
  email: string;
  externalUserId: number;
  token: string;
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

const publicRoutes = ["/", "/api", "/openapi.json", "/auth/login"];

export async function authMiddleware(c: Context, next: Next) {
  const path = new URL(c.req.url).pathname;

  if (publicRoutes.includes(path)) {
    await next();
    return;
  }

  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const kygResponse = await verifyTokenWithKyg(token);

    const user = await prisma.user.upsert({
      where: { email: kygResponse.user.email },
      update: {
        externalUserId: kygResponse.user.userid,
        updatedAt: new Date(),
      },
      create: {
        email: kygResponse.user.email,
        externalUserId: kygResponse.user.userid,
      },
    });

    c.set("user", {
      id: user.id,
      email: user.email,
      externalUserId: user.externalUserId,
      token: token,
    });

    await next();
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Token verification failed",
      },
      401
    );
  }
}
