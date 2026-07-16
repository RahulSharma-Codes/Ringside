import React, { useState, useEffect } from "react";
import { Loader2, CheckCircle2, AlertTriangle, Lock, User, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { customFetch } from "@workspace/api-client-react";

const AUTH_TOKEN_KEY = "ig_os_auth_token";

interface AcceptInvitePageProps {
  onLogin: () => void;
}

type Phase = "loading" | "invalid" | "form" | "submitting" | "done";

interface InviteInfo {
  email: string;
  role: string;
  displayName: string | null;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  Admin:       { label: "Administrator",  color: "bg-primary/15 text-primary border-primary/30" },
  "Deal Lead": { label: "Deal Lead",      color: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  Member:      { label: "Member",         color: "bg-muted/50 text-muted-foreground border-border/50" },
  "IC Voter":  { label: "IC Voter",       color: "bg-violet-500/15 text-violet-400 border-violet-500/25" },
};

function PasswordStrength({ password }: { password: string }) {
  const hasLength = password.length >= 8;
  const hasUpper  = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const score = [hasLength, hasUpper, hasNumber].filter(Boolean).length;
  const label = !hasLength ? "Too short" : score === 1 ? "Weak" : score === 2 ? "Good" : "Strong";
  const color = !hasLength ? "bg-destructive/60" : score === 1 ? "bg-amber-500" : score === 2 ? "bg-blue-500" : "bg-green-500";
  return (
    <div className="space-y-1 mt-1.5">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-0.5 flex-1 rounded-full transition-all ${i < score ? color : "bg-border/30"}`} />
        ))}
      </div>
      <p className="text-[9px] font-mono text-muted-foreground/40">{label} — min 8 chars, uppercase, number</p>
    </div>
  );
}

export default function AcceptInvitePage({ onLogin }: AcceptInvitePageProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState("");

  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  useEffect(() => {
    if (!token) {
      setPhase("invalid");
      setErrorMsg("No invite token found in the link.");
      return;
    }
    customFetch<{ valid: boolean; email: string; role: string; displayName: string | null }>(
      `/api/auth/invite/validate?token=${encodeURIComponent(token)}`
    )
      .then((data) => {
        setInfo({ email: data.email, role: data.role, displayName: data.displayName });
        setDisplayName(data.displayName ?? "");
        setPhase("form");
      })
      .catch(() => {
        setPhase("invalid");
        setErrorMsg("This invite link is invalid or has already been used. Ask your administrator to send a new one.");
      });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError("");
    if (!password || password.length < 8) {
      setFieldError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setFieldError("Passwords do not match.");
      return;
    }
    setPhase("submitting");
    try {
      const data = await customFetch<{
        ok: boolean;
        token: string;
        user: { id: string; email: string; role: string; displayName: string | null };
      }>("/api/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, displayName: displayName.trim() || null, password }),
      });
      window.localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      setPhase("done");
      const base = (import.meta.env.BASE_URL as string).replace(/\/$/, "");
      setTimeout(() => { window.location.assign(base + "/"); }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setFieldError(msg);
      setPhase("form");
    }
  }

  const roleInfo = info ? (ROLE_LABELS[info.role] ?? ROLE_LABELS.Member) : null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md space-y-6">

        {/* Brand */}
        <div className="text-center space-y-2">
          <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground/40">
            Manipal Group · Corporate Development
          </p>
          <h1 className="font-mono font-bold text-4xl uppercase tracking-[0.15em] text-foreground">
            Ringside
          </h1>
          <p className="text-[11px] font-mono text-muted-foreground/50 tracking-wider uppercase">
            M&amp;A Deal Intelligence Platform
          </p>
        </div>

        {/* Card */}
        <div className="border border-border/60 bg-card/60 backdrop-blur-sm rounded-sm shadow-2xl">

          {/* Loading */}
          {phase === "loading" && (
            <div className="flex flex-col items-center gap-3 p-12">
              <Loader2 size={20} className="animate-spin text-primary" />
              <p className="text-[11px] font-mono text-muted-foreground/50 uppercase tracking-widest">Validating invite…</p>
            </div>
          )}

          {/* Invalid */}
          {phase === "invalid" && (
            <>
              <div className="px-7 pt-7 pb-5 border-b border-border/40">
                <h2 className="font-mono font-semibold text-base text-foreground tracking-tight">
                  Invite link invalid
                </h2>
              </div>
              <div className="px-7 py-8 flex flex-col items-center gap-4 text-center">
                <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-destructive" />
                </div>
                <p className="text-[12px] font-mono text-muted-foreground/70 leading-relaxed max-w-xs">
                  {errorMsg}
                </p>
              </div>
            </>
          )}

          {/* Done */}
          {phase === "done" && (
            <>
              <div className="px-7 pt-7 pb-5 border-b border-border/40">
                <h2 className="font-mono font-semibold text-base text-foreground tracking-tight">Account created</h2>
              </div>
              <div className="px-7 py-8 flex flex-col items-center gap-4 text-center">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 size={20} className="text-green-500" />
                </div>
                <div>
                  <p className="font-mono font-semibold text-sm text-green-500">You're in!</p>
                  <p className="text-[11px] font-mono text-muted-foreground/50 mt-1">Redirecting to the dashboard…</p>
                </div>
              </div>
            </>
          )}

          {/* Form */}
          {(phase === "form" || phase === "submitting") && info && roleInfo && (
            <>
              {/* Card header */}
              <div className="px-7 pt-7 pb-5 border-b border-border/40 space-y-3">
                <div>
                  <h2 className="font-mono font-semibold text-base text-foreground tracking-tight">
                    You've been invited
                  </h2>
                  <p className="text-[11px] font-mono text-muted-foreground/50 mt-0.5">
                    Create your account to get started.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[12px] text-foreground/80">{info.email}</span>
                  <span className={`inline-flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded-sm border ${roleInfo.color}`}>
                    <ShieldCheck size={9} />
                    {roleInfo.label}
                  </span>
                </div>
              </div>

              {/* Form body */}
              <form onSubmit={handleSubmit} className="px-7 py-6 space-y-4">
                {/* Display name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                    Your name <span className="text-muted-foreground/30 normal-case tracking-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <User size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/30" />
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your full name"
                      className="pl-8 rounded-sm bg-background/60 border-border/60 h-10 font-mono text-sm"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="border-t border-border/30 pt-4 space-y-4">
                  {/* Password */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                      Choose a password <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <Lock size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/30" />
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="pl-8 rounded-sm bg-background/60 border-border/60 h-10"
                        autoComplete="new-password"
                        required
                      />
                    </div>
                    {password.length > 0 && <PasswordStrength password={password} />}
                  </div>

                  {/* Confirm */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                      Confirm password <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <Lock size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/30" />
                      <Input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Repeat your password"
                        className="pl-8 rounded-sm bg-background/60 border-border/60 h-10"
                        autoComplete="new-password"
                        required
                      />
                    </div>
                    {confirm.length > 0 && password !== confirm && (
                      <p className="text-[10px] font-mono text-destructive mt-1">Passwords do not match</p>
                    )}
                  </div>
                </div>

                {fieldError && (
                  <p className="text-[11px] text-destructive font-mono bg-destructive/10 border border-destructive/20 rounded-sm px-3 py-2">
                    {fieldError}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={phase === "submitting" || !password || !confirm}
                  className="w-full h-10 rounded-sm font-mono uppercase text-[11px] tracking-wider"
                >
                  {phase === "submitting" ? (
                    <><Loader2 size={12} className="animate-spin mr-2" />Creating account…</>
                  ) : (
                    "Create Account & Sign In"
                  )}
                </Button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[9px] font-mono text-muted-foreground/25 uppercase tracking-wider">
          Confidential · Authorised users only · All activity is logged
        </p>
      </div>
    </div>
  );
}
