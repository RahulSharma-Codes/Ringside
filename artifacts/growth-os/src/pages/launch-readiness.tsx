import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  CheckCircle2, AlertTriangle, HelpCircle, Loader2,
  Server, KeyRound, CreditCard, Lock, Globe, Database,
  HardDrive, BarChart3, ArrowLeft, ShieldCheck,
} from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

type CheckState = "pass" | "warn" | "unknown" | "loading";

interface CheckItem {
  id: string;
  label: string;
  description: string;
  state: CheckState;
  icon: React.ReactNode;
  guidance?: string;
}

interface AiStatusResponse {
  status: "available" | "key_missing" | "key_invalid" | "billing" | "transient";
  available: boolean;
  setupRequired: boolean;
  billingRequired: boolean;
}

interface LaunchReadinessResponse {
  appPasswordSet: boolean;
  aiKeySet: boolean;
}

function StateIcon({ state }: { state: CheckState }) {
  if (state === "loading") return <Loader2 size={15} className="animate-spin text-muted-foreground" />;
  if (state === "pass") return <CheckCircle2 size={15} className="text-emerald-500" />;
  if (state === "warn") return <AlertTriangle size={15} className="text-amber-500" />;
  return <HelpCircle size={15} className="text-muted-foreground/60" />;
}

function StateBadge({ state }: { state: CheckState }) {
  if (state === "loading") return <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Checking…</span>;
  if (state === "pass") return <span className="text-[10px] font-mono text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">Pass</span>;
  if (state === "warn") return <span className="text-[10px] font-mono text-amber-700 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Attention</span>;
  return <span className="text-[10px] font-mono text-muted-foreground bg-muted border border-border/40 px-2 py-0.5 rounded-full">Informational</span>;
}

export default function LaunchReadiness() {
  const [checks, setChecks] = useState<CheckItem[]>([
    {
      id: "api",
      label: "API server reachable",
      description: "The backend API server is running and responding to requests.",
      state: "loading",
      icon: <Server size={15} className="text-muted-foreground" />,
    },
    {
      id: "ai-key",
      label: "AI key present",
      description: "An OpenAI API key is configured in environment secrets.",
      state: "loading",
      icon: <KeyRound size={15} className="text-muted-foreground" />,
    },
    {
      id: "ai-billing",
      label: "AI billing status",
      description: "The OpenAI account has active billing / quota available.",
      state: "loading",
      icon: <CreditCard size={15} className="text-muted-foreground" />,
    },
    {
      id: "app-password",
      label: "APP_PASSWORD configured",
      description: "A shared access password is set in environment secrets.",
      state: "loading",
      icon: <Lock size={15} className="text-muted-foreground" />,
    },
    {
      id: "email-auth",
      label: "Email-based auth",
      description: "Per-user email/password authentication via Supabase Auth.",
      state: "unknown",
      icon: <ShieldCheck size={15} className="text-muted-foreground" />,
      guidance: "Not yet enabled — see docs/auth-architecture.md for the migration plan.",
    },
    {
      id: "storage",
      label: "Document storage",
      description: "Supabase Storage bucket for deal document uploads.",
      state: "unknown",
      icon: <HardDrive size={15} className="text-muted-foreground" />,
      guidance: "Verify the Supabase Storage bucket is created and the SUPABASE_STORAGE_BUCKET env var is set. No automated check available.",
    },
    {
      id: "domain",
      label: "Custom domain",
      description: "A custom domain for the production deployment.",
      state: "unknown",
      icon: <Globe size={15} className="text-muted-foreground" />,
      guidance: "Configure a custom domain in Replit Deployments settings after publishing. Not required for initial launch.",
    },
    {
      id: "demo-data",
      label: "Demo data",
      description: "Confirm whether demo/test data has been cleared from the pipeline before go-live.",
      state: "unknown",
      icon: <Database size={15} className="text-muted-foreground" />,
      guidance: "Review the Pipeline page and remove any demo or test targets before sharing with the broader team.",
    },
    {
      id: "deployment",
      label: "Deployment readiness",
      description: "The app is published to a stable production URL.",
      state: "unknown",
      icon: <BarChart3 size={15} className="text-muted-foreground" />,
      guidance: "Use the Replit Deployments panel to publish this app. See Replit deployment docs for configuration.",
    },
  ]);

  useEffect(() => {
    let mounted = true;

    const updateCheck = (id: string, patch: Partial<CheckItem>) => {
      if (!mounted) return;
      setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    };

    // Check 1: API server reachable via /api/healthz
    customFetch<{ status: string }>("/api/healthz")
      .then(() => {
        updateCheck("api", { state: "pass", description: "API server is running and healthy." });
      })
      .catch(() => {
        updateCheck("api", { state: "warn", description: "Could not reach /api/healthz — the API server may not be running." });
      });

    // Check 2 & 3: AI key + billing via /api/ai/status
    customFetch<AiStatusResponse>("/api/ai/status")
      .then((s) => {
        if (s.status === "available") {
          updateCheck("ai-key", { state: "pass", description: "OPENAI_API_KEY is set and validated." });
          updateCheck("ai-billing", { state: "pass", description: "OpenAI account has active quota." });
        } else if (s.status === "billing") {
          updateCheck("ai-key", { state: "pass", description: "OPENAI_API_KEY is set." });
          updateCheck("ai-billing", {
            state: "warn",
            description: "Billing issue detected — add OpenAI API credits to your account.",
          });
        } else if (s.status === "key_invalid") {
          updateCheck("ai-key", { state: "warn", description: "API key present but rejected by OpenAI (401)." });
          updateCheck("ai-billing", { state: "unknown" });
        } else if (s.status === "key_missing") {
          updateCheck("ai-key", {
            state: "warn",
            description: "OPENAI_API_KEY is not set. Add it in Replit Secrets to enable AI features.",
          });
          updateCheck("ai-billing", { state: "unknown", description: "Cannot check billing — AI key not set." });
        } else {
          updateCheck("ai-key", { state: "unknown", description: "AI status temporarily unavailable." });
          updateCheck("ai-billing", { state: "unknown" });
        }
      })
      .catch(() => {
        updateCheck("ai-key", { state: "warn", description: "Could not reach /api/ai/status." });
        updateCheck("ai-billing", { state: "warn", description: "Could not reach /api/ai/status." });
      });

    // Check 4: APP_PASSWORD via /api/launch/readiness (public, no auth needed)
    fetch("/api/launch/readiness")
      .then((r) => r.json())
      .then((data: LaunchReadinessResponse) => {
        if (data.appPasswordSet) {
          updateCheck("app-password", { state: "pass", description: "APP_PASSWORD is configured." });
        } else {
          updateCheck("app-password", {
            state: "warn",
            description: "APP_PASSWORD is not set — the app will reject all API requests until it is configured.",
          });
        }
      })
      .catch(() => {
        updateCheck("app-password", { state: "warn", description: "Could not reach /api/launch/readiness." });
      });

    return () => { mounted = false; };
  }, []);

  const passCount = checks.filter((c) => c.state === "pass").length;
  const warnCount = checks.filter((c) => c.state === "warn").length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <Link href="/copilot" className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft size={12} />
          Back to Copilot
        </Link>
        <h1 className="font-mono uppercase tracking-widest text-lg font-bold">Launch Readiness</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A read-only checklist to verify the system is ready for go-live. No secret values are displayed.
        </p>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card/60 text-sm">
        <div className="flex items-center gap-1.5 text-emerald-600 font-mono text-[12px]">
          <CheckCircle2 size={13} />
          {passCount} pass
        </div>
        <div className="w-px h-4 bg-border/60" />
        <div className="flex items-center gap-1.5 text-amber-600 font-mono text-[12px]">
          <AlertTriangle size={13} />
          {warnCount} need attention
        </div>
        <div className="w-px h-4 bg-border/60" />
        <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[12px]">
          <HelpCircle size={13} />
          {checks.filter((c) => c.state === "unknown").length} informational
        </div>
      </div>

      {/* Checklist */}
      <div className="space-y-2">
        {checks.map((check) => (
          <div
            key={check.id}
            className="p-4 rounded-xl border border-border/60 bg-card/60 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="shrink-0 mt-px">{check.icon}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{check.label}</span>
                    <StateBadge state={check.state} />
                  </div>
                  <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
                    {check.description}
                  </p>
                  {check.guidance && (
                    <p className="text-[11px] text-muted-foreground/70 mt-1 leading-relaxed italic">
                      {check.guidance}
                    </p>
                  )}
                </div>
              </div>
              <div className="shrink-0 mt-0.5">
                <StateIcon state={check.state} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground/60 font-mono text-center pt-2">
        This page is visible to authenticated users only. Refresh to re-run checks.
      </p>
    </div>
  );
}
