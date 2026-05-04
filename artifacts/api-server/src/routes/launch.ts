import { Router } from "express";

const router = Router();

router.get("/readiness", (_req, res) => {
  const appPasswordSet = Boolean(process.env["APP_PASSWORD"]);
  const aiKeySet = Boolean(process.env["OPENAI_API_KEY"]);

  return res.json({
    appPasswordSet,
    aiKeySet,
  });
});

export default router;
