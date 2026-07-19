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

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [oidcConfigured, setOidcConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/oidc/config")
      .then((r) => r.json())
      .then((d: { configured: boolean }) => setOidcConfigured(d.configured))
      .catch(() => {});
  }, []);

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
              Sign in to your account
            </h2>
          </div>

          {/* Card body */}
          <div className="px-7 py-6 space-y-5">
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
            </form>

            {oidcConfigured && (
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
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="ringside-theme-v2">
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
