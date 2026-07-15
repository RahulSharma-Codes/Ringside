import React, { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Dashboard from "@/pages/dashboard";
import Pipeline from "@/pages/pipeline";
import NewTarget from "@/pages/new-target";
import TargetDetail from "@/pages/target-detail";
import Actions from "@/pages/actions";
import ImportWizard from "@/pages/import-wizard";
import Copilot from "@/pages/copilot";
import WeeklyReview from "@/pages/weekly-review";
import DiligenceReview from "@/pages/diligence-review";
import DocumentReview from "@/pages/document-review";
import LaunchReadiness from "@/pages/launch-readiness";
import Analytics from "@/pages/analytics";
import Doctrine from "@/pages/doctrine";
import AdminPage from "@/pages/admin";
import SettingsPasswordPage from "@/pages/settings-password";
import AccessDenied from "@/pages/access-denied";
import NotFound from "@/pages/not-found";
import IcBriefPage from "@/pages/ic-brief";
import AcceptInvitePage from "@/pages/accept-invite";

const queryClient = new QueryClient();

// Auth token storage — always a JWT issued by /api/auth/login or /api/auth/otp/verify
const AUTH_TOKEN_KEY = "ig_os_auth_token";

setAuthTokenGetter(() => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
});

// ── Login screen — password (default) with OTP as backup ───────────────────────

type LoginMode = "password" | "otp-email" | "otp-code" | "set-password";

interface OtpState {
  email: string;
  code: string;
  /** The in-app generated code returned by the server (shown for UX since no email delivery yet) */
  serverCode: string | null;
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<LoginMode>("password");
  const [otp, setOtp] = useState<OtpState>({ email: "", code: "", serverCode: null });
  const [passwordForm, setPasswordForm] = useState({ email: "", password: "" });
  const [newPassword, setNewPassword] = useState({ password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oidcConfig, setOidcConfig] = useState<{ configured: boolean; clientId?: string; issuer?: string; authorizationEndpoint?: string } | null>(null);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/oidc/config")
      .then((r) => r.json())
      .then((d) => setOidcConfig(d))
      .catch(() => setOidcConfig({ configured: false }));
    fetch("/api/auth/state")
      .then((r) => r.json())
      .then((d: { smtpConfigured: boolean }) => setSmtpConfigured(d.smtpConfigured))
      .catch(() => setSmtpConfigured(false));
  }, []);

  // ── Password login ──────────────────────────────────────────────────────────

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordForm.email.trim() || !passwordForm.password) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: passwordForm.email.trim().toLowerCase(), password: passwordForm.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Invalid credentials.");
        return;
      }
      window.localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      if (data.needsPasswordSetup) {
        setMode("set-password");
      } else {
        onLogin();
      }
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── OTP — step 1: request code ──────────────────────────────────────────────

  const handleOtpRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.email.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otp.email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not generate login code. Please try again.");
        return;
      }
      setOtp((prev) => ({ ...prev, serverCode: data.code ?? null }));
      setMode("otp-code");
    } catch {
      setError("Could not connect to server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── OTP — step 2: verify code ───────────────────────────────────────────────

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.code.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otp.email, code: otp.code.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Invalid code.");
        return;
      }
      const data = await res.json();
      window.localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      if (data.needsPasswordSetup) {
        setMode("set-password");
      } else {
        onLogin();
      }
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Set password (after first-time OTP login) ───────────────────────────────

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword.password !== newPassword.confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${window.localStorage.getItem(AUTH_TOKEN_KEY)}`,
        },
        body: JSON.stringify({ password: newPassword.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not set password.");
        return;
      }
      onLogin();
    } catch {
      setError("Could not set password. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md border-border bg-card/80 backdrop-blur rounded-sm">
        <CardHeader className="space-y-2 pb-2">
          <p className="text-[10px] font-mono uppercase tracking-widest text-primary/70">Inorganic Growth Command Center</p>
          <CardTitle className="font-mono uppercase tracking-widest text-2xl leading-tight">Ringside</CardTitle>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your command center for corporate development, diligence, and inorganic growth execution.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* ── Password login (default) ── */}
          {mode === "password" && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              {smtpConfigured === false && (
                <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
                  <p className="text-[9px] font-mono text-amber-700/80 uppercase tracking-wider font-semibold">
                    Development mode
                  </p>
                  <p className="text-[10px] font-mono text-amber-700/70 leading-relaxed">
                    Email delivery is not configured. Default admin:{" "}
                    <span className="font-bold text-amber-700">admin@ringside.local</span>.
                    Use "Forgot password?" below to get a code shown on screen.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Email Address
                </label>
                <Input
                  type="email"
                  value={passwordForm.email}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder={smtpConfigured === false ? "admin@ringside.local" : "you@example.com"}
                  className="rounded-sm bg-background/50"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Password
                </label>
                <Input
                  type="password"
                  value={passwordForm.password}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="••••••••"
                  className="rounded-sm bg-background/50"
                />
                <div className="flex justify-end">
                  <button type="button" onClick={() => { setError(null); setMode("otp-email"); }}
                    className="text-[10px] font-mono text-muted-foreground/50 hover:text-primary underline underline-offset-2 transition-colors">
                    Forgot password? Get a login code instead
                  </button>
                </div>
              </div>
              {error && <p className="text-sm text-destructive font-mono">{error}</p>}
              <Button type="submit" className="w-full rounded-sm font-mono uppercase text-[11px]" disabled={!passwordForm.email.trim() || !passwordForm.password || isSubmitting}>
                {isSubmitting ? "Signing in…" : "Sign In"}
              </Button>
            </form>
          )}

          {/* ── Set password (first-time login, or after OTP fallback) ── */}
          {mode === "set-password" && (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="rounded-sm border border-primary/30 bg-primary/10 p-3 space-y-1">
                <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                  Set a password
                </p>
                <p className="text-sm font-mono text-foreground/80">
                  You're signed in. Set a password now so you can sign in faster next time.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  New Password
                </label>
                <Input
                  type="password"
                  value={newPassword.password}
                  onChange={(e) => setNewPassword((p) => ({ ...p, password: e.target.value }))}
                  placeholder="At least 8 characters"
                  className="rounded-sm bg-background/50"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Confirm Password
                </label>
                <Input
                  type="password"
                  value={newPassword.confirm}
                  onChange={(e) => setNewPassword((p) => ({ ...p, confirm: e.target.value }))}
                  placeholder="Re-enter password"
                  className="rounded-sm bg-background/50"
                />
              </div>
              {error && <p className="text-sm text-destructive font-mono">{error}</p>}
              <Button type="submit" className="w-full rounded-sm font-mono uppercase text-[11px]" disabled={!newPassword.password || isSubmitting}>
                {isSubmitting ? "Saving…" : "Set Password"}
              </Button>
              <div className="flex items-center justify-center">
                <button type="button" onClick={() => onLogin()}
                  className="text-[10px] font-mono text-muted-foreground/50 hover:text-muted-foreground underline underline-offset-2">
                  Skip for now
                </button>
              </div>
            </form>
          )}

          {/* ── OTP step 1: enter email ── */}
          {mode === "otp-email" && (
            <form onSubmit={handleOtpRequest} className="space-y-4">
              {smtpConfigured === false && (
                <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
                  <p className="text-[9px] font-mono text-amber-700/80 uppercase tracking-wider font-semibold">
                    Email delivery not configured
                  </p>
                  <p className="text-[10px] font-mono text-amber-700/70 leading-relaxed">
                    Your code will be displayed on screen after you click Get Code.
                    Default admin email: <span className="font-bold text-amber-700">admin@ringside.local</span>
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Email Address
                </label>
                <Input
                  type="email"
                  value={otp.email}
                  onChange={(e) => setOtp((p) => ({ ...p, email: e.target.value }))}
                  placeholder={smtpConfigured === false ? "admin@ringside.local" : "you@example.com"}
                  className="rounded-sm bg-background/50"
                  autoFocus
                />
                <p className="text-[9px] text-muted-foreground/40 font-mono">
                  {smtpConfigured
                    ? "A 6-digit code will be sent to your email address."
                    : "Enter the registered email address to generate a code."}
                </p>
              </div>
              {error && <p className="text-sm text-destructive font-mono">{error}</p>}
              <Button type="submit" className="w-full rounded-sm font-mono uppercase text-[11px]" disabled={!otp.email.trim() || isSubmitting}>
                {isSubmitting ? "Generating…" : "Get Code"}
              </Button>
              <div className="flex items-center justify-center">
                <button type="button" onClick={() => { setError(null); setMode("password"); }}
                  className="text-[10px] font-mono text-muted-foreground/50 hover:text-muted-foreground underline underline-offset-2">
                  ← Back to password login
                </button>
              </div>
            </form>
          )}

          {/* ── OTP step 2: enter code ── */}
          {mode === "otp-code" && (
            <form onSubmit={handleOtpVerify} className="space-y-4">
              {otp.serverCode ? (
                <div className="rounded-sm border border-primary/30 bg-primary/10 p-4 space-y-2">
                  <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                    Your login code — SMTP not configured, shown here instead
                  </p>
                  <div className="flex items-center gap-3">
                    <p className="font-mono text-3xl font-bold tracking-[0.35em] text-primary flex-1">{otp.serverCode}</p>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(otp.serverCode ?? "")}
                      className="text-[9px] font-mono text-primary/60 hover:text-primary border border-primary/30 hover:border-primary/60 rounded-sm px-2 py-1 transition-colors uppercase tracking-wider"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-[9px] font-mono text-muted-foreground/40">Expires in 10 minutes. Copy it, then enter it below.</p>
                </div>
              ) : (
                <div className="rounded-sm border border-border/40 bg-muted/30 p-3 space-y-1">
                  <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                    Code sent
                  </p>
                  <p className="text-sm font-mono text-foreground/80">
                    Check your email at <span className="text-primary">{otp.email}</span>
                  </p>
                  <p className="text-[9px] font-mono text-muted-foreground/40">Expires in 10 minutes. Check your spam folder if it doesn't arrive.</p>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  6-Digit Code <span className="text-destructive">*</span>
                </label>
                <Input
                  value={otp.code}
                  onChange={(e) => setOtp((p) => ({ ...p, code: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                  placeholder="123456"
                  className="rounded-sm bg-background/50 font-mono text-xl tracking-[0.3em] text-center"
                  maxLength={6}
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-destructive font-mono">{error}</p>}
              <Button type="submit" className="w-full rounded-sm font-mono uppercase text-[11px]" disabled={otp.code.length < 6 || isSubmitting}>
                {isSubmitting ? "Verifying…" : "Verify Code"}
              </Button>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setMode("otp-email")}
                  className="text-[10px] font-mono text-muted-foreground/50 hover:text-muted-foreground underline underline-offset-2">
                  ← Back
                </button>
              </div>
            </form>
          )}

          {/* ── OIDC SSO button — shown on all modes when configured ── */}
          {oidcConfig?.configured && (
            <div className="pt-1 border-t border-border/40 space-y-2">
              <p className="text-[10px] font-mono text-muted-foreground/40 text-center uppercase tracking-wider">or</p>
              <a
                href="/api/auth/oidc/start"
                className="flex items-center justify-center w-full h-9 rounded-sm border border-border/60 bg-background/40 hover:bg-background/70 transition-colors font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                Sign in with Company SSO
              </a>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}

// ── Route guard — Admin-only ───────────────────────────────────────────────────

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return <Layout><AccessDenied /></Layout>;
  }
  return <>{children}</>;
}

// ── Router ────────────────────────────────────────────────────────────────────

function Router() {
  return (
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
  );
}

// ── App root ──────────────────────────────────────────────────────────────────

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.localStorage.getItem(AUTH_TOKEN_KEY));
  });

  // Detect accept-invite route — must render before auth gate so unauthenticated
  // recipients can reach the page. Check pathname after stripping base path.
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const pathWithoutBase = window.location.pathname.replace(base, "") || "/";
  const isAcceptInvite = pathWithoutBase.startsWith("/accept-invite");

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="ringside-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {isAcceptInvite ? (
            <AcceptInvitePage onLogin={() => setIsAuthenticated(true)} />
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
