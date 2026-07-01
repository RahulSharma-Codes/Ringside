import React, { useState, useEffect } from "react";
import { Loader2, CheckCircle2, AlertTriangle, Lock, User } from "lucide-react";
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
      // Navigate away from /accept-invite so isAcceptInvite gate clears
      const base = (import.meta.env.BASE_URL as string).replace(/\/$/, "");
      setTimeout(() => {
        window.location.assign(base + "/");
      }, 800);
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

        <div className="border border-border/50 bg-card/40 rounded-sm p-6 space-y-5">
          {/* Loading */}
          {phase === "loading" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 size={20} className="animate-spin text-primary" />
              <p className="text-[11px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                Validating invite…
              </p>
            </div>
          )}

          {/* Invalid */}
          {phase === "invalid" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
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
            <div className="flex flex-col items-center gap-3 py-4 text-center">
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
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 mb-0.5">
                  Invited as
                </p>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{info.email}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-primary/15 text-primary border border-primary/25">
                    {info.role}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Display Name
                </label>
                <div className="relative">
                  <User size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="pl-7 rounded-sm bg-background/50 font-mono text-[11px]"
                  />
                </div>
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
                  "Accept Invitation"
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
