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

const ROLE_COLORS: Record<string, string> = {
  Admin:       "bg-primary/20 text-primary border-primary/30",
  "Deal Lead": "bg-blue-500/15 text-blue-600 border-blue-500/25",
  Member:      "bg-muted/50 text-muted-foreground border-border/50",
  "IC Voter":  "bg-violet-500/15 text-violet-600 border-violet-500/25",
};

function PasswordStrength({ password }: { password: string }) {
  const hasLength = password.length >= 8;
  const hasUpper  = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const score = [hasLength, hasUpper, hasNumber].filter(Boolean).length;
  const label = !hasLength ? "Too short" : score === 1 ? "Weak" : score === 2 ? "Good" : "Strong";
  const color =
    !hasLength  ? "bg-destructive/60"
    : score === 1 ? "bg-amber-500"
    : score === 2 ? "bg-blue-500"
    : "bg-green-500";
  return (
    <div className="space-y-1 mt-1">
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-0.5 flex-1 rounded-full transition-colors ${i < score ? color : "bg-border/40"}`} />
        ))}
      </div>
      <p className="text-[9px] font-mono text-muted-foreground/50">{label} — min 8 chars, upper case, number</p>
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
        setErrorMsg("This invite link is invalid or has expired. Ask your admin to send a new one.");
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
      setTimeout(() => {
        window.location.assign(base + "/");
      }, 900);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setFieldError(msg);
      setPhase("form");
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="text-center mb-8">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50 mb-1">
            Inorganic Growth Command Center
          </p>
          <h1 className="text-2xl font-mono font-bold uppercase tracking-[0.12em] text-foreground">
            Ringside
          </h1>
        </div>

        <div className="border border-border/50 bg-card/40 rounded-sm">

          {/* Loading */}
          {phase === "loading" && (
            <div className="flex flex-col items-center gap-3 p-8">
              <Loader2 size={20} className="animate-spin text-primary" />
              <p className="text-[11px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                Validating invite…
              </p>
            </div>
          )}

          {/* Invalid */}
          {phase === "invalid" && (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle size={18} className="text-destructive" />
              </div>
              <div>
                <p className="font-mono font-semibold text-sm uppercase tracking-tight">
                  Invalid Invite
                </p>
                <p className="text-[11px] font-mono text-muted-foreground/60 mt-1 leading-relaxed">
                  {errorMsg}
                </p>
              </div>
            </div>
          )}

          {/* Done */}
          {phase === "done" && (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 size={18} className="text-green-500" />
              </div>
              <div>
                <p className="font-mono font-semibold text-sm uppercase tracking-tight text-green-600">
                  Account Created
                </p>
                <p className="text-[11px] font-mono text-muted-foreground/60 mt-1">
                  Signing you in…
                </p>
              </div>
            </div>
          )}

          {/* Form */}
          {(phase === "form" || phase === "submitting") && info && (
            <>
              {/* Welcome header */}
              <div className="px-6 pt-6 pb-4 border-b border-border/40 space-y-1">
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">
                  You've been invited to join
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[12px] font-medium text-foreground">{info.email}</span>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-sm border ${ROLE_COLORS[info.role] ?? ROLE_COLORS.Member}`}>
                    <ShieldCheck size={9} className="inline-block mr-1 -mt-px" />
                    {info.role}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-muted-foreground/50 leading-relaxed">
                  Set a password to create your account and start using Ringside.
                </p>
              </div>

              {/* Fields */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Display Name <span className="text-muted-foreground/40">(optional)</span>
                  </label>
                  <div className="relative">
                    <User size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your full name"
                      className="pl-7 rounded-sm bg-background/50 font-mono text-[11px]"
                      autoFocus
                    />
                  </div>
                  <p className="text-[9px] font-mono text-muted-foreground/40">Shown to other team members</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Password <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Lock size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="pl-7 rounded-sm bg-background/50 font-mono text-[11px]"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  {password.length > 0 && <PasswordStrength password={password} />}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Confirm Password <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Lock size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                    <Input
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Repeat password"
                      className="pl-7 rounded-sm bg-background/50 font-mono text-[11px]"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  {confirm.length > 0 && password !== confirm && (
                    <p className="text-[10px] font-mono text-destructive">Passwords do not match</p>
                  )}
                </div>

                {fieldError && (
                  <div className="flex items-start gap-1.5 text-destructive">
                    <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                    <p className="text-[10px] font-mono leading-relaxed">{fieldError}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={phase === "submitting" || !password || !confirm}
                  className="w-full rounded-sm font-mono text-[11px] uppercase tracking-wider h-9"
                >
                  {phase === "submitting" ? (
                    <><Loader2 size={12} className="animate-spin mr-2" /> Creating Account…</>
                  ) : (
                    "Create Account & Sign In"
                  )}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-[9px] font-mono text-muted-foreground/30 mt-4">
          Already have an account? <a href="/" className="underline hover:text-muted-foreground/60">Sign in here</a>
        </p>
      </div>
    </div>
  );
}
