import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";

const userRouter = new Hono();

userRouter.get("/me", authMiddleware(), (c) => {
  const tokens = c.get("atlassian_tokens");
  const accountId = c.get("account_id");

  return c.json({
    message: "User information",
    data: {
      account_id: accountId,
      name: tokens.user.name,
      email: tokens.user.email,
      picture: tokens.user.picture,
      account_type: tokens.user.account_type,
      account_status: tokens.user.account_status,
      resources: tokens.resources,
    },
  });
});

export default userRouter;
