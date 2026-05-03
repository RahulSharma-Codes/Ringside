import { Router } from "express";

const router = Router();

router.post("/login", (req, res) => {
  const expectedPassword = process.env.APP_PASSWORD;
  const suppliedPassword = typeof req.body?.password === "string" ? req.body.password : "";

  if (!expectedPassword) {
    return res.status(500).json({ error: "APP_PASSWORD is not configured in Replit Secrets." });
  }

  if (suppliedPassword !== expectedPassword) {
    return res.status(401).json({ error: "Invalid password." });
  }

  return res.json({ ok: true });
});

export default router;
