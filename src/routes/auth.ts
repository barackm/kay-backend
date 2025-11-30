import { Hono } from "hono";
import { z } from "zod";
import { loginWithKyg } from "../services/auth/kyg-api.js";
import { prisma } from "../db/client.js";

export function createAuthRouter() {
  const router = new Hono();

  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  router.post("/login", async (c) => {
    try {
      const body = await c.req.json();
      const { email, password } = loginSchema.parse(body);

      const kygResponse = await loginWithKyg(email, password);

      await prisma.user.upsert({
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

      return c.json({
        token: kygResponse.token,
        user: {
          email: kygResponse.user.email,
          firstName: kygResponse.user.firstName,
          lastName: kygResponse.user.lastName,
          userid: kygResponse.user.userid,
        },
      });
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Login failed",
        },
        401
      );
    }
  });

  router.get("/me", async (c) => {
    const user = c.get("user");

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        externalUserId: true,
        createdAt: true,
      },
    });

    return c.json({ user: dbUser });
  });

  return router;
}
