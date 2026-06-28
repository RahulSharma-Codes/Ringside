import { Router } from "express";
import { eq, and, gt, sql } from "drizzle-orm";
import { createHash, randomInt } from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db, usersTable, otpAttemptsTable, companiesTable, sessionBlocklistTable } from "@workspace/db";
import { writeAuditEvent } from "./audit";

const router = Router();

const JWT_SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";
const JWT_EXPIRY = "8h";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

function issueJwt(payload: { userId: string; companyId: string; email: string; role: string }): string {
  const jti = crypto.randomUUID();
  return jwt.sign({ ...payload, jti }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

async function getOrCreateDefaultCompany(): Promise<{ id: string }> {
  const [existing] = await db.select({ id: companiesTable.id }).from(companiesTable).limit(1);
  return existing ?? { id: "00000000-0000-0000-0000-000000000000" };
}

// ── POST /api/auth/login (legacy + password-based fallback) ───────────────────

router.post("/login", async (req, res) => {
  const suppliedPassword = typeof req.body?.password === "string" ? req.body.password : "";
  const suppliedEmail    = typeof req.body?.email    === "string" ? req.body.email    : "";
  const expectedPassword = process.env.APP_PASSWORD;

  // Legacy shared-password path — still supported for backward compat
  if (!suppliedEmail && suppliedPassword && expectedPassword) {
    if (suppliedPassword !== expectedPassword) {
      return res.status(401).json({ error: "Invalid password." });
    }
    // Issue a JWT for the default admin user
    const company = await getOrCreateDefaultCompany();
    const [user] = await db.select().from(usersTable)
      .where(and(eq(usersTable.companyId, company.id), eq(usersTable.role, "Admin")))
      .limit(1);
    if (user) {
      const token = issueJwt({ userId: user.id, companyId: company.id, email: user.email, role: user.role });
      await writeAuditEvent("login", null, user.email, { method: "legacy-password", email: user.email });
      return res.json({ ok: true, token, user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName } });
    }
    return res.json({ ok: true, token: null });
  }

  // Email + password login
  if (suppliedEmail) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, suppliedEmail.toLowerCase())).limit(1);
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid credentials." });
    }
    const valid = await bcrypt.compare(suppliedPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials." });
    const token = issueJwt({ userId: user.id, companyId: user.companyId, email: user.email, role: user.role });
    await writeAuditEvent("login", null, user.email, { method: "password", email: user.email });
    return res.json({ ok: true, token, user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName } });
  }

  return res.status(400).json({ error: "Missing credentials." });
});

// ── POST /api/auth/otp/request ────────────────────────────────────────────────

router.post("/otp/request", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase().trim() : "";
  if (!email) return res.status(400).json({ error: "Email required." });

  // Check user exists
  const [user] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    // Don't reveal whether the email exists — return same success shape
    return res.json({ ok: true, message: "If this email is registered, a code has been generated." });
  }

  const code = generateOtp();
  const codeHash = sha256(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  // Purge all expired OTPs + invalidate any prior code for this email
  const now2 = new Date();
  await db.delete(otpAttemptsTable).where(
    eq(otpAttemptsTable.email, email)
  );
  // Also clean up globally expired rows (opportunistic purge — no scheduled job needed)
  await db.execute(sql`DELETE FROM otp_attempts WHERE expires_at < ${now2}`);

  await db.insert(otpAttemptsTable).values({ email, codeHash, expiresAt, attempts: 0 });

  // Return code in response (in-app display — no email delivery yet)
  return res.json({ ok: true, code, message: "Code generated. Share with the user." });
});

// ── POST /api/auth/otp/verify ─────────────────────────────────────────────────

router.post("/otp/verify", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase().trim() : "";
  const code  = typeof req.body?.code  === "string" ? req.body.code.trim() : "";
  if (!email || !code) return res.status(400).json({ error: "Email and code required." });

  const now = new Date();
  const [attempt] = await db.select().from(otpAttemptsTable)
    .where(and(eq(otpAttemptsTable.email, email), gt(otpAttemptsTable.expiresAt, now)))
    .limit(1);

  if (!attempt) return res.status(401).json({ error: "Code expired or not found." });

  // Lockout check
  if (attempt.lockedUntil && attempt.lockedUntil > now) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }

  const codeHash = sha256(code);
  if (codeHash !== attempt.codeHash) {
    const newAttempts = attempt.attempts + 1;
    const lockedUntil = newAttempts >= 3 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await db.update(otpAttemptsTable)
      .set({ attempts: newAttempts, lockedUntil })
      .where(eq(otpAttemptsTable.id, attempt.id));
    return res.status(401).json({ error: "Invalid code.", attemptsLeft: Math.max(0, 3 - newAttempts) });
  }

  // Success — consume the OTP
  await db.delete(otpAttemptsTable).where(eq(otpAttemptsTable.id, attempt.id));

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) return res.status(401).json({ error: "User not found." });

  const token = issueJwt({ userId: user.id, companyId: user.companyId, email: user.email, role: user.role });
  return res.json({ ok: true, token, user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName } });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

router.post("/logout", async (req, res) => {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { jti?: string; exp?: number };
      if (decoded.jti && decoded.exp) {
        await db.insert(sessionBlocklistTable).values({
          jti: decoded.jti,
          expiresAt: new Date(decoded.exp * 1000),
        }).onConflictDoNothing();
      }
    } catch { /* invalid token — ignore */ }
  }
  return res.json({ ok: true });
});

// ── GET /api/auth/oidc/config ─────────────────────────────────────────────────

router.get("/oidc/config", (_req, res) => {
  const clientId = process.env.OIDC_CLIENT_ID;
  const issuer   = process.env.OIDC_ISSUER;
  if (!clientId || !issuer) {
    return res.json({ configured: false });
  }
  return res.json({
    configured: true,
    clientId,
    issuer,
    authorizationEndpoint: `${issuer}/authorize`,
  });
});

// ── GET /api/auth/oidc/callback (stub) ───────────────────────────────────────

router.get("/oidc/callback", (_req, res) => {
  return res.status(501).json({ error: "OIDC SSO not yet configured. Contact your IT admin to complete the setup." });
});

export default router;
