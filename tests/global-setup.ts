/**
 * Playwright global setup — runs ONCE before all tests.
 *
 * Fetches one JWT for the seeded admin account and writes it to
 * .auth/token.txt so every test can inject it into localStorage
 * without making additional login API calls (which would hit the
 * auth rate-limiter: 30 req / 15 min per IP).
 *
 * Token caching: if a non-expired token already exists on disk the setup
 * skips the network call entirely. This allows the test suite to be run in
 * multiple batched bash invocations without consuming extra rate-limit slots.
 */

import * as fs from "fs";
import * as path from "path";

const BASE_URL = "http://localhost:80";
// Credentials from env vars; fall back to dev seed values only in non-production
const EMAIL    = process.env.TEST_EMAIL    ?? "rahul.sharma@manipalgroup.info";
const PASSWORD = process.env.TEST_PASSWORD ?? "Ringside@123";
const TOKEN_FILE = path.join(__dirname, ".auth", "token.txt");

function isTokenValid(token: string): boolean {
  try {
    const [, payload] = token.split(".");
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8")
    );
    // Keep 5-minute buffer before expiry
    return typeof decoded.exp === "number" && decoded.exp * 1000 > Date.now() + 5 * 60 * 1000;
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });

  // Reuse cached token to avoid consuming rate-limit slots on repeat runs
  if (fs.existsSync(TOKEN_FILE)) {
    const cached = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
    if (isTokenValid(cached)) {
      console.log("[global-setup] Reusing cached JWT (still valid)");
      return;
    }
  }

  const resp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(
      `global-setup: Login API returned ${resp.status}: ${body}\n` +
        `Hint: if rate-limited (429), restart the API server to clear the in-memory limiter.`
    );
  }

  const { token } = (await resp.json()) as { token: string };
  fs.writeFileSync(TOKEN_FILE, token, "utf-8");

  console.log("[global-setup] JWT written to", TOKEN_FILE);
}
