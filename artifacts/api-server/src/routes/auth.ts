import { Router } from "express";
import { eq, and, gt, sql } from "drizzle-orm";
import { createHash, randomInt, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { db, usersTable, otpAttemptsTable, companiesTable, sessionBlocklistTable } from "@workspace/db";
import { writeAuditEvent } from "./audit";
import type { JwtClaims } from "../middlewares/auth";

const router = Router();

const JWT_SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";
const JWT_EXPIRY = "8h";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function sendOtpEmail(to: string, code: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  });

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER!;

  await transporter.sendMail({
    from,
    to,
    subject: "Your Ringside login code",
    text: `Your one-time login code is: ${code}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
    html: `
      <div style="font-family:monospace;max-width:480px;margin:0 auto;padding:24px;background:#0a0a0a;color:#e5e5e5;border:1px solid #222;border-radius:4px;">
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:#666;margin:0 0 8px;">Inorganic Growth Command Center</p>
        <h1 style="font-size:20px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 24px;color:#fff;">Ringside</h1>
        <p style="font-size:13px;color:#aaa;margin:0 0 16px;">Your one-time login code:</p>
        <p style="font-size:36px;font-weight:700;letter-spacing:0.4em;color:#a78bfa;margin:0 0 24px;">${code}</p>
        <p style="font-size:11px;color:#555;margin:0;">Expires in 10 minutes. Do not share this code with anyone.</p>
      </div>
    `,
  });
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

// ── POST /api/auth/login (legacy password — disabled by default) ───────────────
// Enabled only when ALLOW_LEGACY_PASSWORD=true is explicitly set.
// OTP is the primary auth flow; this route exists for emergency break-glass access only.

router.post("/login", async (req, res) => {
  if (process.env.ALLOW_LEGACY_PASSWORD !== "true") {
    return res.status(403).json({ error: "Password login is disabled. Use email OTP to sign in." });
  }

  const suppliedPassword = typeof req.body?.password === "string" ? req.body.password : "";
  const suppliedEmail    = typeof req.body?.email    === "string" ? req.body.email    : "";
  const expectedPassword = process.env.APP_PASSWORD;

  // Legacy shared-password path
  if (!suppliedEmail && suppliedPassword && expectedPassword) {
    if (suppliedPassword !== expectedPassword) {
      return res.status(401).json({ error: "Invalid password." });
    }
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
  const now2 = new Date();

  // Honour active lockout — reject re-request so lock cannot be bypassed by requesting a new OTP
  const [existingAttempt] = await db.select().from(otpAttemptsTable)
    .where(and(eq(otpAttemptsTable.email, email), gt(otpAttemptsTable.expiresAt, now2)))
    .limit(1);
  if (existingAttempt?.lockedUntil && existingAttempt.lockedUntil > now2) {
    return res.status(429).json({ error: "Account temporarily locked due to too many failed attempts. Try again later." });
  }

  // Purge prior OTPs for this email + expired rows globally
  await db.delete(otpAttemptsTable).where(eq(otpAttemptsTable.email, email));
  await db.execute(sql`DELETE FROM otp_attempts WHERE expires_at < ${now2}`);

  await db.insert(otpAttemptsTable).values({ email, codeHash, expiresAt, attempts: 0 });

  if (isSmtpConfigured()) {
    try {
      await sendOtpEmail(email, code);
    } catch (err) {
      // Log but don't leak SMTP internals to the client
      req.log?.error({ err }, "Failed to send OTP email");
      return res.status(502).json({ error: "Could not send login code. Please try again or contact your administrator." });
    }
    return res.json({ ok: true, message: "A login code has been sent to your email address." });
  }

  // SMTP not configured — return code in response for dev/internal use
  return res.json({ ok: true, code, message: "SMTP not configured. Code shown for development use only." });
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
    if (lockedUntil) {
      await writeAuditEvent("otp_lockout", null, email, { email, attempts: newAttempts, lockedUntilIso: lockedUntil.toISOString() });
    }
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
      const decoded = jwt.verify(token, JWT_SECRET) as { jti?: string; exp?: number; email?: string; userId?: string };
      if (decoded.jti && decoded.exp) {
        await db.insert(sessionBlocklistTable).values({
          jti: decoded.jti,
          expiresAt: new Date(decoded.exp * 1000),
        }).onConflictDoNothing();
        await writeAuditEvent("logout", null, decoded.email ?? null, { jti: decoded.jti, userId: decoded.userId ?? null });
      }
    } catch { /* invalid token — ignore */ }
  }
  return res.json({ ok: true });
});

// ── GET /api/auth/smtp/status ─────────────────────────────────────────────────
// Admin-only: verifies SMTP transporter can connect. Returns { configured, reachable }.

router.get("/smtp/status", async (req, res) => {
  // Require a valid JWT with Admin role — this reveals infrastructure state
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }
  let claims: JwtClaims;
  try {
    claims = jwt.verify(token, JWT_SECRET) as JwtClaims;
  } catch {
    return res.status(401).json({ error: "Invalid or expired session." });
  }
  if (claims.role !== "Admin") {
    return res.status(403).json({ error: "Admin role required." });
  }

  const configured = isSmtpConfigured();
  if (!configured) {
    return res.json({ configured: false, reachable: false });
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
  });

  try {
    await transporter.verify();
    return res.json({ configured: true, reachable: true });
  } catch (err) {
    req.log?.warn({ err }, "SMTP verify failed");
    return res.json({ configured: true, reachable: false });
  }
});

// ── POST /api/auth/invite ─────────────────────────────────────────────────────
// Admin-only: generate an invite link for a new teammate.
// If SMTP is configured the link is emailed; otherwise it is returned in the
// response body so the admin can share it manually.

router.post("/invite", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required." });

  let claims: JwtClaims;
  try {
    claims = jwt.verify(token, JWT_SECRET) as JwtClaims;
  } catch {
    return res.status(401).json({ error: "Invalid or expired session." });
  }
  if (claims.role !== "Admin") {
    return res.status(403).json({ error: "Admin role required." });
  }

  const email       = typeof req.body?.email       === "string" ? req.body.email.toLowerCase().trim()       : "";
  const role        = typeof req.body?.role        === "string" ? req.body.role                              : "Member";
  const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() || null       : null;

  if (!email) return res.status(400).json({ error: "email is required." });

  const VALID_ROLES = ["Admin", "Deal Lead", "Member", "IC Voter"];
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}.` });
  }

  // Use the caller's own company from their JWT — never LIMIT 1 to avoid cross-tenant mis-association
  const companyId = claims.companyId;
  if (!companyId) return res.status(400).json({ error: "Could not determine your company from session." });

  // Prevent inviting someone who already has an account in this company
  const [existing] = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.email, email), eq(usersTable.companyId, companyId)))
    .limit(1);
  if (existing) return res.status(409).json({ error: "A user with that email already exists." });

  // Invalidate any prior unused invite for this email within this company
  await db.execute(
    sql`DELETE FROM invite_tokens WHERE email = ${email} AND company_id = ${companyId}::uuid AND used_at IS NULL`
  );

  // Generate token
  const rawToken   = randomBytes(32).toString("hex");
  const tokenHash  = sha256(rawToken);
  const expiresAt  = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

  await db.execute(sql`
    INSERT INTO invite_tokens (company_id, email, role, display_name, token_hash, expires_at, created_by)
    VALUES (${companyId}::uuid, ${email}, ${role}, ${displayName}, ${tokenHash}, ${expiresAt}, ${claims.userId}::uuid)
  `);

  // Build the invite URL
  const proto   = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol ?? "https";
  const host    = (req.headers["x-forwarded-host"] as string | undefined) ?? (req.headers.host as string | undefined) ?? "";
  const basePath = process.env.BASE_PATH ?? "";
  const inviteUrl = `${proto}://${host}${basePath}/accept-invite?token=${rawToken}`;

  if (isSmtpConfigured()) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST!,
        port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
        secure: process.env.SMTP_PORT === "465",
        auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
      });
      const from = process.env.SMTP_FROM ?? process.env.SMTP_USER!;
      await transporter.sendMail({
        from,
        to: email,
        subject: "You've been invited to Ringside",
        text: `You've been invited to join Ringside.\n\nClick the link below to set your password and get started:\n\n${inviteUrl}\n\nThis link expires in 72 hours.`,
        html: `
          <div style="font-family:monospace;max-width:480px;margin:0 auto;padding:24px;background:#0a0a0a;color:#e5e5e5;border:1px solid #222;border-radius:4px;">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:#666;margin:0 0 8px;">Inorganic Growth Command Center</p>
            <h1 style="font-size:20px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 24px;color:#fff;">Ringside</h1>
            <p style="font-size:13px;color:#aaa;margin:0 0 16px;">You've been invited to join as <strong style="color:#e5e5e5;">${role}</strong>.</p>
            <a href="${inviteUrl}" style="display:inline-block;padding:10px 20px;background:#a78bfa;color:#0a0a0a;text-decoration:none;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;font-size:12px;border-radius:3px;">Accept Invitation</a>
            <p style="font-size:11px;color:#555;margin:24px 0 0;">Link expires in 72 hours. If you did not expect this invite, ignore this email.</p>
          </div>
        `,
      });
    } catch (err) {
      req.log?.error({ err }, "Failed to send invite email");
      return res.status(502).json({ error: "Could not send invite email. Please try again or share the link manually." });
    }
    await writeAuditEvent("invite_sent", null, claims.email, { invitedEmail: email, role, method: "email" });
    return res.json({ ok: true, emailed: true });
  }

  // SMTP not configured — return the raw link so admin can share it
  await writeAuditEvent("invite_sent", null, claims.email, { invitedEmail: email, role, method: "link" });
  return res.json({ ok: true, emailed: false, inviteUrl });
});

// ── GET /api/auth/invite/validate ─────────────────────────────────────────────
// Public: verify an invite token and return the associated email/role.

router.get("/invite/validate", async (req, res) => {
  const raw = typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (!raw) return res.status(400).json({ error: "token is required." });

  const tokenHash = sha256(raw);
  const now = new Date();

  const [row] = (await db.execute(sql`
    SELECT email, role, display_name FROM invite_tokens
    WHERE token_hash = ${tokenHash}
      AND used_at IS NULL
      AND expires_at > ${now}
    LIMIT 1
  `)).rows as { email: string; role: string; display_name: string | null }[];

  if (!row) {
    return res.status(404).json({ error: "Invite link is invalid or has expired." });
  }

  return res.json({ valid: true, email: row.email, role: row.role, displayName: row.display_name });
});

// ── POST /api/auth/invite/accept ──────────────────────────────────────────────
// Public: consume an invite token, create the user, issue a JWT.

router.post("/invite/accept", async (req, res) => {
  const raw         = typeof req.body?.token       === "string" ? req.body.token.trim()       : "";
  const password    = typeof req.body?.password    === "string" ? req.body.password           : "";
  const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";

  if (!raw)      return res.status(400).json({ error: "token is required." });
  if (!password) return res.status(400).json({ error: "password is required." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

  const tokenHash = sha256(raw);
  const now = new Date();

  const [row] = (await db.execute(sql`
    SELECT id, company_id, email, role FROM invite_tokens
    WHERE token_hash = ${tokenHash}
      AND used_at IS NULL
      AND expires_at > ${now}
    LIMIT 1
  `)).rows as { id: number; company_id: string; email: string; role: string }[];

  if (!row) return res.status(404).json({ error: "Invite link is invalid or has expired." });

  // Guard against race: email might have been claimed between validate and accept
  const [existingUser] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.email, row.email)).limit(1);
  if (existingUser) return res.status(409).json({ error: "An account with this email already exists." });

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db.insert(usersTable).values({
    companyId:    row.company_id,
    email:        row.email,
    displayName:  displayName || null,
    role:         row.role,
    passwordHash,
  }).returning();

  // Mark token used
  await db.execute(sql`UPDATE invite_tokens SET used_at = ${now} WHERE id = ${row.id}`);

  await writeAuditEvent("invite_accepted", null, row.email, { role: row.role });

  const jwtToken = issueJwt({ userId: user.id, companyId: user.companyId, email: user.email, role: user.role });
  return res.json({ ok: true, token: jwtToken, user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName } });
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

// ── GET /api/auth/oidc/start — initiate OIDC authorization flow ───────────────

router.get("/oidc/start", (req, res) => {
  const clientId = process.env.OIDC_CLIENT_ID;
  const issuer   = process.env.OIDC_ISSUER;
  if (!clientId || !issuer) {
    return res.status(501).json({ error: "OIDC SSO not yet configured. Contact your IT admin to complete the setup." });
  }
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
  const host  = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  const redirectUri = `${proto}://${host}/api/auth/oidc/callback`;
  const state = crypto.randomUUID();
  const authUrl = new URL(`${issuer}/authorize`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  return res.redirect(302, authUrl.toString());
});

// ── GET /api/auth/oidc/callback (stub) ───────────────────────────────────────

router.get("/oidc/callback", (_req, res) => {
  return res.status(501).json({ error: "OIDC SSO not yet configured. Contact your IT admin to complete the setup." });
});

export default router;
