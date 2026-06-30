import { Hono } from "hono";

const router = new Hono<ContextEnv>();

router.get("/health", (c) => {
  return c.json({ status: "ok" });
});

export default router;
