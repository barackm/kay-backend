import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { loginWithKyg } from "../services/auth/kyg-api.js";
import { prisma } from "../db/client.js";

const LoginSchema = z
  .object({
    email: z.string().email().openapi({ example: "user@example.com" }),
    password: z.string().min(1).openapi({ example: "password123" }),
  })
  .openapi("LoginRequest");

const LoginResponseSchema = z
  .object({
    token: z.string().openapi({ description: "JWT token from external API" }),
    user: z.object({
      email: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      userid: z.number(),
    }),
  })
  .openapi("LoginResponse");

const UserResponseSchema = z
  .object({
    user: z
      .object({
        id: z.string().uuid(),
        email: z.string(),
        externalUserId: z.number(),
        createdAt: z.string().datetime(),
      })
      .nullable(),
  })
  .openapi("UserResponse");

const ErrorResponseSchema = z
  .object({
    error: z.string(),
  })
  .openapi("ErrorResponse");

const loginRoute = createRoute({
  method: "post",
  path: "/login",
  tags: ["Auth"],
  summary: "Login",
  description: "Authenticate user with external KYG API",
  request: {
    body: {
      content: {
        "application/json": {
          schema: LoginSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Login successful",
      content: {
        "application/json": {
          schema: LoginResponseSchema,
        },
      },
    },
    401: {
      description: "Invalid credentials",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const getMeRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["Auth"],
  summary: "Get current user",
  description: "Get current authenticated user information",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "User information",
      content: {
        "application/json": {
          schema: UserResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

export function createAuthRouter() {
  const router = new OpenAPIHono();

  router.openapi(loginRoute, async (c) => {
    try {
      const { email, password } = c.req.valid("json");

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

  router.openapi(getMeRoute, async (c) => {
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
