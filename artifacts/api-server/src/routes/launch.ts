import { Router } from "express";

const router = Router();

router.get("/readiness", (_req, res) => {
  const secret = process.env["SESSION_SECRET"] ?? "";
  const sessionSecretConfigured = secret.length >= 32 && !secret.startsWith("dev-secret-change-me");
  const aiKeySet = Boolean(process.env["OPENAI_API_KEY"]);

  return res.json({
    sessionSecretConfigured,
    aiKeySet,
  });
});

export default router;
