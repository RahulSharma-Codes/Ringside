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

// ── Login screen ───────────────────────────────────────────────────────────────

type LoginMode = "password" | "otp-email" | "otp-code";

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [serverCode, setServerCode] = useState<string | null>(null);
  const [smtpOn, setSmtpOn] = useState<boolean | null>(null);
  const [oidcConfigured, setOidcConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/state")
      .then((r) => r.json())
      .then((d: { smtpConfigured: boolean }) => setSmtpOn(d.smtpConfigured))
      .catch(() => setSmtpOn(false));
    fetch("/api/auth/oidc/config")
      .then((r) => r.json())
      .then((d: { configured: boolean }) => setOidcConfigured(d.configured))
      .catch(() => {});
  }, []);

  const go = (m: LoginMode) => { setError(null); setMode(m); };

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
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Invalid email or password."); return; }
      window.localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      onLogin();
    } catch { setError("Login failed. Please try again."); }
    finally { setBusy(false); }
  };

  // OTP step 1
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
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not send code. Please try again."); return; }
      setServerCode(data.code ?? null);
      setMode("otp-code");
    } catch { setError("Could not connect. Please try again."); }
    finally { setBusy(false); }
  };

  // OTP step 2
  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length < 6) return;
    setError(null); setBusy(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: otpCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Invalid code."); return; }
      window.localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      onLogin();
    } catch { setError("Verification failed. Please try again."); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-sm border-border bg-card/80 backdrop-blur rounded-sm">
        <CardHeader className="space-y-1 pb-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-primary/60">
            Inorganic Growth Command Center
          </p>
          <CardTitle className="font-mono uppercase tracking-widest text-2xl">Ringside</CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">

          {/* ── Default credentials hint (only when no SMTP and on password screen) ── */}
          {mode === "password" && smtpOn === false && (
            <div className="rounded-sm border border-border/50 bg-muted/30 p-3 space-y-1.5">
              <p className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider font-medium">
                Default sign-in credentials
              </p>
              <div className="space-y-0.5">
                <p className="font-mono text-[11px] text-foreground/80">
                  <span className="text-muted-foreground/50 mr-1">Email</span>
                  rahul.sharma@manipalgroup.info
                </p>
                <p className="font-mono text-[11px] text-foreground/80">
                  <span className="text-muted-foreground/50 mr-1">Password</span>
                  Ringside@123
                </p>
              </div>
              <p className="text-[9px] font-mono text-muted-foreground/40">
                Change your password after signing in via Settings.
              </p>
            </div>
          )}

          {/* ── Password login ── */}
          {mode === "password" && (
            <form onSubmit={handlePasswordLogin} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="rounded-sm bg-background/50"
                  autoComplete="email"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="rounded-sm bg-background/50"
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && <p className="text-[11px] text-destructive font-mono">{error}</p>}
              <Button type="submit" className="w-full rounded-sm font-mono uppercase text-[11px]"
                disabled={!email.trim() || !password || busy}>
                {busy ? "Signing in…" : "Sign In"}
              </Button>
              <div className="text-center pt-1">
                <button type="button" onClick={() => go("otp-email")}
                  className="text-[10px] font-mono text-muted-foreground/50 hover:text-primary underline underline-offset-2 transition-colors">
                  Sign in with a one-time code instead
                </button>
              </div>
            </form>
          )}

          {/* ── OTP: enter email ── */}
          {mode === "otp-email" && (
            <form onSubmit={handleOtpRequest} className="space-y-3">
              <p className="text-[11px] font-mono text-muted-foreground/70 leading-relaxed">
                {smtpOn
                  ? "Enter your email and we'll send a 6-digit login code."
                  : "Enter your email — your login code will appear on screen (email not configured)."}
              </p>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="rounded-sm bg-background/50"
                  autoFocus
                  required
                />
              </div>
              {error && <p className="text-[11px] text-destructive font-mono">{error}</p>}
              <Button type="submit" className="w-full rounded-sm font-mono uppercase text-[11px]"
                disabled={!email.trim() || busy}>
                {busy ? "Sending…" : "Send Code"}
              </Button>
              <div className="text-center pt-1">
                <button type="button" onClick={() => go("password")}
                  className="text-[10px] font-mono text-muted-foreground/50 hover:text-muted-foreground underline underline-offset-2">
                  ← Back to password
                </button>
              </div>
            </form>
          )}

          {/* ── OTP: enter code ── */}
          {mode === "otp-code" && (
            <form onSubmit={handleOtpVerify} className="space-y-3">
              {serverCode ? (
                <div className="rounded-sm border border-primary/30 bg-primary/10 p-3 space-y-2">
                  <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                    Your login code
                  </p>
                  <div className="flex items-center gap-3">
                    <p className="font-mono text-3xl font-bold tracking-[0.35em] text-primary flex-1">{serverCode}</p>
                    <button type="button"
                      onClick={() => navigator.clipboard.writeText(serverCode)}
                      className="text-[9px] font-mono text-primary/60 hover:text-primary border border-primary/30 rounded-sm px-2 py-1 uppercase tracking-wider">
                      Copy
                    </button>
                  </div>
                  <p className="text-[9px] font-mono text-muted-foreground/40">Expires in 10 minutes.</p>
                </div>
              ) : (
                <p className="text-[11px] font-mono text-muted-foreground/70">
                  Check your inbox at <span className="text-primary">{email}</span> for a 6-digit code.
                </p>
              )}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">6-Digit Code</label>
                <Input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="rounded-sm bg-background/50 font-mono text-xl tracking-[0.3em] text-center"
                  maxLength={6}
                  autoFocus
                />
              </div>
              {error && <p className="text-[11px] text-destructive font-mono">{error}</p>}
              <Button type="submit" className="w-full rounded-sm font-mono uppercase text-[11px]"
                disabled={otpCode.length < 6 || busy}>
                {busy ? "Verifying…" : "Verify Code"}
              </Button>
              <div className="text-center pt-1">
                <button type="button" onClick={() => go("otp-email")}
                  className="text-[10px] font-mono text-muted-foreground/50 hover:text-muted-foreground underline underline-offset-2">
                  ← Back
                </button>
              </div>
            </form>
          )}

          {/* ── SSO (when configured) ── */}
          {oidcConfigured && (
            <div className="pt-1 border-t border-border/40 space-y-2">
              <p className="text-[10px] font-mono text-muted-foreground/40 text-center uppercase tracking-wider">or</p>
              <a href="/api/auth/oidc/start"
                className="flex items-center justify-center w-full h-9 rounded-sm border border-border/60 bg-background/40 hover:bg-background/70 transition-colors font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
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
