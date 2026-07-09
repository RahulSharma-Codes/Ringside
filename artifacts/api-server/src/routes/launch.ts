import { Router } from "express";

const router = Router();

router.get("/readiness", (_req, res) => {
  const sessionSecretConfigured = Boolean(process.env["SESSION_SECRET"]) && process.env["SESSION_SECRET"] !== "dev-secret-change-me";
  const aiKeySet = Boolean(process.env["OPENAI_API_KEY"]);

  return res.json({
    sessionSecretConfigured,
    aiKeySet,
  });
});

export default router;
