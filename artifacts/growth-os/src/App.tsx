import React, { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Dashboard from "@/pages/dashboard";
import Pipeline from "@/pages/pipeline";
import NewTarget from "@/pages/new-target";
import TargetDetail from "@/pages/target-detail";
import Actions from "@/pages/actions";
import ImportWizard from "@/pages/import-wizard";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();
const PASSWORD_STORAGE_KEY = "ig_os_app_password";

setAuthTokenGetter(() => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PASSWORD_STORAGE_KEY);
});

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError("Password not accepted. Please try again.");
        return;
      }

      window.localStorage.setItem(PASSWORD_STORAGE_KEY, password);
      onLogin();
    } catch (_error) {
      setError("Could not reach the API server. Check that the Replit app is running.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md border-border bg-card/80 backdrop-blur rounded-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="font-mono uppercase tracking-tight text-xl">Inorganic Growth OS</CardTitle>
          <p className="text-sm text-muted-foreground">Confidential Corporate Development Platform</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Access Password</label>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-sm bg-background/50"
                autoFocus
              />
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button type="submit" className="w-full rounded-sm font-mono uppercase text-[11px]" disabled={!password || isSubmitting}>
              {isSubmitting ? "Checking..." : "Login"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

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
      <Route path="/targets/:id">
        <Layout><TargetDetail /></Layout>
      </Route>
      <Route path="/actions">
        <Layout><Actions /></Layout>
      </Route>
      <Route path="/import">
        <Layout><ImportWizard /></Layout>
      </Route>
      <Route path="*">
        <Layout><NotFound /></Layout>
      </Route>
    </Switch>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.localStorage.getItem(PASSWORD_STORAGE_KEY));
  });

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {isAuthenticated ? (
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        ) : (
          <LoginScreen onLogin={() => setIsAuthenticated(true)} />
        )}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
