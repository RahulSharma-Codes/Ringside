import React, { useState, useEffect, Suspense, lazy, useCallback } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { setAuthTokenGetter, ApiError } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Eagerly-loaded pages (always needed on auth'd entry)
import Dashboard from "@/pages/dashboard";

// Lazy-loaded pages — split into their own chunks
const Pipeline           = lazy(() => import("@/pages/pipeline"));
const NewTarget          = lazy(() => import("@/pages/new-target"));
const TargetDetail       = lazy(() => import("@/pages/target-detail"));
const Actions            = lazy(() => import("@/pages/actions"));
const ImportWizard       = lazy(() => import("@/pages/import-wizard"));
const Copilot            = lazy(() => import("@/pages/copilot"));
const WeeklyReview       = lazy(() => import("@/pages/weekly-review"));
const DiligenceReview    = lazy(() => import("@/pages/diligence-review"));
const DocumentReview     = lazy(() => import("@/pages/document-review"));
const LaunchReadiness    = lazy(() => import("@/pages/launch-readiness"));
const Analytics          = lazy(() => import("@/pages/analytics"));
const Doctrine           = lazy(() => import("@/pages/doctrine"));
const AdminPage          = lazy(() => import("@/pages/admin"));
const SettingsPasswordPage = lazy(() => import("@/pages/settings-password"));
const AccessDenied       = lazy(() => import("@/pages/access-denied"));
const NotFound           = lazy(() => import("@/pages/not-found"));
const IcBriefPage        = lazy(() => import("@/pages/ic-brief"));
const AcceptInvitePage   = lazy(() => import("@/pages/accept-invite"));

// Auth token storage — always a JWT issued by /api/auth/login or /api/auth/otp/verify
const AUTH_TOKEN_KEY = "ig_os_auth_token";

/** Returns true if the token exists AND hasn't expired. Cleans up stale tokens. */
function isTokenValid(): boolean {
  if (typeof window === "undefined") return false;
  const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return false;
  try {
    const parts = token.split(".");
    if (parts.length < 2) { window.localStorage.removeItem(AUTH_TOKEN_KEY); return false; }
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
    const exp = typeof payload["exp"] === "number" ? payload["exp"] : 0;
    if (exp && exp * 1000 < Date.now()) {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      return false;
    }
    return true;
  } catch {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    return false;
  }
}

function handleAuthExpiry() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  // Force a full page reload so all component state is reset cleanly
  window.location.reload();
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) handleAuthExpiry();
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) handleAuthExpiry();
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 3 * 60 * 1000,      // data stays fresh for 3 min — no redundant refetches on nav
      refetchOnWindowFocus: false,     // no query sweep on every Alt+Tab back
      retry: (failureCount, error) => {
        // Never retry 401s — the token is expired, retrying won't help
        if (error instanceof ApiError && error.status === 401) return false;
        return failureCount < 1;
      },
    },
  },
});

setAuthTokenGetter(() => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
});

// ── Page loading fallback ──────────────────────────────────────────────────────

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

// ── Login screen ───────────────────────────────────────────────────────────────

type LoginMode = "password" | "otp-request" | "otp-verify";

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [oidcConfigured, setOidcConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/oidc/config")
      .then((r) => r.json())
      .then((d: { configured: boolean }) => setOidcConfigured(d.configured))
      .catch(() => {});
  }, []);

  const storeAndLogin = useCallback((token: string) => {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    onLogin();
  }, [onLogin]);

  // Password login
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError(null); setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json() as { token?: string; error?: string };
      if (!res.ok) { setError(data.error ?? "Invalid email or password."); return; }
      storeAndLogin(data.token!);
    } catch { setError("Login failed. Please try again."); }
    finally { setBusy(false); }
  };

  // Request OTP code
  const handleOtpRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null); setBusy(true);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; message?: string };
      if (!res.ok) { setError(data.error ?? "Could not send code. Try again."); return; }
      setInfo("If that email is registered, a login code has been sent. Check your inbox.");
      setMode("otp-verify");
    } catch { setError("Request failed. Please try again."); }
    finally { setBusy(false); }
  };

  // Verify OTP code
  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !otpCode.trim()) return;
    setError(null); setBusy(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: otpCode.trim() }),
      });
      const data = await res.json() as { token?: string; error?: string };
      if (!res.ok) { setError(data.error ?? "Invalid or expired code."); return; }
      storeAndLogin(data.token!);
    } catch { setError("Verification failed. Please try again."); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Subtle background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      {/* Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md space-y-6">

        {/* Brand header */}
        <div className="text-center space-y-2">
          <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground/40">
            The Manipal Group · Corporate Development &amp; Strategy
          </p>
          <h1 className="font-sans font-bold text-4xl uppercase tracking-[0.15em] text-foreground">
            Ringside
          </h1>
          <p className="text-[10px] font-mono text-muted-foreground/40 tracking-widest uppercase">
            M&amp;A Deal Intelligence Platform
          </p>
        </div>

        {/* Login card */}
        <div className="border border-border/50 bg-card/70 backdrop-blur-sm rounded-2xl shadow-xl">

          {/* Card header */}
          <div className="px-7 pt-7 pb-5 border-b border-border/40">
            <h2 className="font-sans font-semibold text-[15px] text-foreground tracking-tight">
              {mode === "password" ? "Sign in to your account" :
               mode === "otp-request" ? "Send a login code" :
               "Enter your login code"}
            </h2>
            {mode !== "password" && (
              <button
                onClick={() => { setMode("password"); setError(null); setInfo(null); setOtpCode(""); }}
                className="text-[10px] font-mono text-muted-foreground/50 hover:text-primary mt-1 underline underline-offset-2"
              >
                ← Back to password login
              </button>
            )}
          </div>

          {/* Card body */}
          <div className="px-7 py-6 space-y-5">

            {/* ── Password login ── */}
            {mode === "password" && (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                    Email address
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="rounded-sm bg-background/60 border-border/60 focus:border-primary/60 h-10 font-mono text-sm"
                    autoComplete="email"
                    autoFocus
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                    Password
                  </label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="rounded-sm bg-background/60 border-border/60 focus:border-primary/60 h-10"
                    autoComplete="current-password"
                    required
                  />
                </div>
                {error && (
                  <p className="text-[11px] text-destructive font-mono bg-destructive/10 border border-destructive/20 rounded-sm px-3 py-2">
                    {error}
                  </p>
                )}
                <Button type="submit"
                  className="w-full h-10 rounded-xl font-sans text-[13px] font-semibold tracking-normal"
                  disabled={!email.trim() || !password || busy}>
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
                <button
                  type="button"
                  onClick={() => { setMode("otp-request"); setError(null); setInfo(null); }}
                  className="w-full text-center text-[10px] font-mono text-muted-foreground/50 hover:text-primary underline underline-offset-2 pt-1"
                >
                  Forgot password? Use a one-time login code instead
                </button>
              </form>
            )}

            {/* ── OTP request ── */}
            {mode === "otp-request" && (
              <form onSubmit={handleOtpRequest} className="space-y-4">
                <p className="text-[11px] font-mono text-muted-foreground/70 leading-relaxed">
                  Enter your email and we'll send a one-time code. No password needed.
                </p>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                    Email address
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="rounded-sm bg-background/60 border-border/60 focus:border-primary/60 h-10 font-mono text-sm"
                    autoComplete="email"
                    autoFocus
                    required
                  />
                </div>
                {error && (
                  <p className="text-[11px] text-destructive font-mono bg-destructive/10 border border-destructive/20 rounded-sm px-3 py-2">
                    {error}
                  </p>
                )}
                <Button type="submit"
                  className="w-full h-10 rounded-xl font-sans text-[13px] font-semibold tracking-normal"
                  disabled={!email.trim() || busy}>
                  {busy ? "Sending…" : "Send login code"}
                </Button>
              </form>
            )}

            {/* ── OTP verify ── */}
            {mode === "otp-verify" && (
              <form onSubmit={handleOtpVerify} className="space-y-4">
                {info && (
                  <p className="text-[11px] font-mono text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-sm px-3 py-2">
                    {info}
                  </p>
                )}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                    6-digit code
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    className="rounded-sm bg-background/60 border-border/60 focus:border-primary/60 h-10 font-mono text-lg tracking-[0.3em] text-center"
                    autoFocus
                    required
                  />
                </div>
                {error && (
                  <p className="text-[11px] text-destructive font-mono bg-destructive/10 border border-destructive/20 rounded-sm px-3 py-2">
                    {error}
                  </p>
                )}
                <Button type="submit"
                  className="w-full h-10 rounded-xl font-sans text-[13px] font-semibold tracking-normal"
                  disabled={otpCode.length !== 6 || busy}>
                  {busy ? "Verifying…" : "Verify code"}
                </Button>
                <button
                  type="button"
                  onClick={() => { setMode("otp-request"); setError(null); setInfo(null); setOtpCode(""); }}
                  className="w-full text-center text-[10px] font-mono text-muted-foreground/50 hover:text-primary underline underline-offset-2 pt-1"
                >
                  Didn't receive it? Send a new code
                </button>
              </form>
            )}

            {oidcConfigured && mode === "password" && (
              <div className="border-t border-border/40 pt-4 space-y-3">
                <p className="text-[9px] font-mono text-muted-foreground/30 text-center uppercase tracking-widest">or continue with</p>
                <a href="/api/auth/oidc/start"
                  className="flex items-center justify-center w-full h-10 rounded-sm border border-border/60 bg-background/40 hover:bg-background/70 transition-colors font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
                  Company SSO
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center space-y-1.5">
          <p className="text-[10px] font-mono text-muted-foreground/30">
            Access is by invitation only. Contact your administrator if you need an account.
          </p>
          <p className="text-[9px] font-mono text-muted-foreground/20 uppercase tracking-wider">
            Confidential · Authorised users only · All activity is logged
          </p>
        </div>

      </div>
    </div>
  );
}

// ── Route guard — Admin-only ───────────────────────────────────────────────────

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return (
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <AccessDenied />
        </Suspense>
      </Layout>
    );
  }
  return <>{children}</>;
}

// ── Router ────────────────────────────────────────────────────────────────────

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/">
          <Layout><Dashboard /></Layout>
        </Route>
        <Route path="/pipeline">
          <Layout><Pipeline /></Layout>
        </Route>
        <Route path="/targets/new">
          <Layout><NewTarget /></Layout>
        </Route>
        <Route path="/targets/:id/ic-brief">
          <IcBriefPage />
        </Route>
        <Route path="/targets/:id">
          <Layout><TargetDetail /></Layout>
        </Route>
        <Route path="/actions">
          <Layout><Actions /></Layout>
        </Route>
        <Route path="/import">
          <Layout><ImportWizard /></Layout>
        </Route>
        <Route path="/copilot">
          <Layout><Copilot /></Layout>
        </Route>
        <Route path="/weekly-review">
          <Layout><WeeklyReview /></Layout>
        </Route>
        <Route path="/diligence-review">
          <Layout><DiligenceReview /></Layout>
        </Route>
        <Route path="/document-review">
          <Layout><DocumentReview /></Layout>
        </Route>
        <Route path="/launch-readiness">
          <Layout><LaunchReadiness /></Layout>
        </Route>
        <Route path="/analytics">
          <Layout><Analytics /></Layout>
        </Route>
        <Route path="/doctrine">
          <Layout><Doctrine /></Layout>
        </Route>
        <Route path="/admin">
          <RequireAdmin><Layout><AdminPage /></Layout></RequireAdmin>
        </Route>
        <Route path="/settings/password">
          <Layout><SettingsPasswordPage /></Layout>
        </Route>
        <Route path="*">
          <Layout><NotFound /></Layout>
        </Route>
      </Switch>
    </Suspense>
  );
}

// ── App root ──────────────────────────────────────────────────────────────────

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => isTokenValid());

  // Detect accept-invite route — must render before auth gate so unauthenticated
  // recipients can reach the page. Check pathname after stripping base path.
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const pathWithoutBase = window.location.pathname.replace(base, "") || "/";
  const isAcceptInvite = pathWithoutBase.startsWith("/accept-invite");

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="ringside-theme-v2">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {isAcceptInvite ? (
            <Suspense fallback={<PageLoader />}>
              <AcceptInvitePage onLogin={() => setIsAuthenticated(true)} />
            </Suspense>
          ) : isAuthenticated ? (
            <AuthProvider>
              <WouterRouter base={base}>
                <Router />
              </WouterRouter>
            </AuthProvider>
          ) : (
            <LoginScreen onLogin={() => setIsAuthenticated(true)} />
          )}
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
