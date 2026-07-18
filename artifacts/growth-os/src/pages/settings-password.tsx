import React, { useState } from "react";
import { Lock, CheckCircle2, AlertTriangle, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const AUTH_TOKEN_KEY = "ig_os_auth_token";

function PasswordStrength({ password }: { password: string }) {
  const hasLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const score = [hasLength, hasUpper, hasNumber].filter(Boolean).length;
  const label = !hasLength ? "Too short" : score === 1 ? "Weak" : score === 2 ? "Good" : "Strong";
  const color =
    !hasLength ? "bg-destructive/60"
    : score === 1 ? "bg-amber-500"
    : score === 2 ? "bg-blue-500"
    : "bg-green-500";
  return (
    <div className="space-y-1 mt-1">
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-0.5 flex-1 rounded-full transition-colors ${i < score ? color : "bg-border/40"}`}
          />
        ))}
      </div>
      <p className="text-[9px] font-mono text-muted-foreground/50">{label} — min 8 chars, upper case, number</p>
    </div>
  );
}

export default function SettingsPasswordPage() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify({ currentPassword, password }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not update password.");
        return;
      }
      setDone(true);
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
      toast({ title: "Password updated", description: "You can now sign in with your new password." });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="font-sans text-xl font-bold tracking-tight flex items-center gap-2">
          <KeyRound size={18} className="text-primary" />
          Change Password
        </h1>
        <p className="text-[11px] text-muted-foreground/60 font-sans mt-0.5">
          Update the password you use to sign in
        </p>
      </div>

      <div className="border border-border/50 bg-card/40 rounded-sm p-6">
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 size={18} className="text-green-500" />
            </div>
            <div>
              <p className="font-sans font-semibold text-sm text-green-600">
                Password Updated
              </p>
              <p className="text-[11px] font-sans text-muted-foreground/60 mt-1">
                Your new password is active. Use it next time you sign in.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm font-mono text-[10px] uppercase mt-2"
              onClick={() => setDone(false)}
            >
              Change Again
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current password */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Current Password <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Lock size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Your current password"
                  className="pl-7 rounded-sm bg-background/50 font-mono text-[11px]"
                  autoComplete="current-password"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="border-t border-border/30 pt-4 space-y-4">
              {/* New password */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  New Password <span className="text-destructive">*</span>
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

              {/* Confirm */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Confirm New Password <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Lock size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                  <Input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat new password"
                    className="pl-7 rounded-sm bg-background/50 font-mono text-[11px]"
                    autoComplete="new-password"
                    required
                  />
                </div>
                {confirm.length > 0 && password !== confirm && (
                  <p className="text-[10px] font-mono text-destructive">Passwords do not match</p>
                )}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-1.5 text-destructive">
                <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                <p className="text-[10px] font-mono leading-relaxed">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={isSubmitting || !currentPassword || !password || !confirm}
              className="w-full rounded-sm font-mono text-[11px] uppercase tracking-wider h-9"
            >
              {isSubmitting ? (
                <><Loader2 size={12} className="animate-spin mr-2" />Updating…</>
              ) : (
                "Update Password"
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
