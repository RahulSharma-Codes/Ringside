import React, { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

// Auth token storage — stores either a raw APP_PASSWORD (legacy) or a JWT
const AUTH_TOKEN_KEY = "ig_os_auth_token";

setAuthTokenGetter(() => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
});

// ── Login screen — OTP only ────────────────────────────────────────────────────

type LoginMode = "otp-email" | "otp-code";

interface OtpState {
  email: string;
  code: string;
  /** The in-app generated code returned by the server (shown for UX since no email delivery yet) */
  serverCode: string | null;
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<LoginMode>("otp-email");
  const [otp, setOtp] = useState<OtpState>({ email: "", code: "", serverCode: null });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oidcConfig, setOidcConfig] = useState<{ configured: boolean; clientId?: string; issuer?: string; authorizationEndpoint?: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/oidc/config")
      .then((r) => r.json())
      .then((d) => setOidcConfig(d))
      .catch(() => setOidcConfig({ configured: false }));
  }, []);

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
      setOtp((prev) => ({ ...prev, serverCode: data.code ?? null }));
      setMode("otp-code");
    } catch {
      setError("Could not send OTP. Please try again.");
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
      onLogin();
    } catch {
      setError("Verification failed. Please try again.");
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

          {/* ── OTP step 1: enter email ── */}
          {mode === "otp-email" && (
            <form onSubmit={handleOtpRequest} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Email Address
                </label>
                <Input
                  type="email"
                  value={otp.email}
                  onChange={(e) => setOtp((p) => ({ ...p, email: e.target.value }))}
                  placeholder="you@example.com"
                  className="rounded-sm bg-background/50"
                  autoFocus
                />
                <p className="text-[9px] text-muted-foreground/40 font-mono">
                  A 6-digit code will be generated for your email.
                </p>
              </div>
              {error && <p className="text-sm text-destructive font-mono">{error}</p>}
              <Button type="submit" className="w-full rounded-sm font-mono uppercase text-[11px]" disabled={!otp.email.trim() || isSubmitting}>
                {isSubmitting ? "Generating…" : "Get Code"}
              </Button>
            </form>
          )}

          {/* ── OTP step 2: enter code ── */}
          {mode === "otp-code" && (
            <form onSubmit={handleOtpVerify} className="space-y-4">
              {otp.serverCode && (
                <div className="rounded-sm border border-primary/30 bg-primary/10 p-3 space-y-1">
                  <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                    Your one-time code (shown here — enter below)
                  </p>
                  <p className="font-mono text-2xl font-bold tracking-[0.3em] text-primary">{otp.serverCode}</p>
                  <p className="text-[9px] font-mono text-muted-foreground/40">Expires in 10 minutes</p>
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

// ── Router ────────────────────────────────────────────────────────────────────

function Router() {
  const { isAdmin } = useAuth();
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
        {isAdmin ? <Layout><AdminPage /></Layout> : <Layout><NotFound /></Layout>}
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

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {isAuthenticated ? (
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </AuthProvider>
        ) : (
          <LoginScreen onLogin={() => setIsAuthenticated(true)} />
        )}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
