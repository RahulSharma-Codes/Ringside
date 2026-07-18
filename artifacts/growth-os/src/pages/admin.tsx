import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, UserPlus, RefreshCw, Loader2, CheckCircle2,
  Users, Trash2, AlertTriangle, MailX, MailCheck, WifiOff, Link2, Copy, Check,
  Eye, EyeOff, X, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { customFetch, useListTargets } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { SkeletonRow } from "@/components/skeleton";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  createdAt: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ALL_ROLES = ["Admin", "Deal Lead", "Member", "IC Voter"] as const;
type Role = (typeof ALL_ROLES)[number];

const ROLE_COLORS: Record<string, string> = {
  Admin:      "bg-primary/20 text-primary border-primary/30",
  "Deal Lead":"bg-blue-500/15 text-blue-600 border-blue-500/25",
  Member:     "bg-muted/50 text-muted-foreground border-border/50",
  "IC Voter": "bg-violet-500/15 text-violet-600 border-violet-500/25",
  Viewer:     "bg-muted/30 text-muted-foreground/60 border-border/30",
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("Member");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  // Access management dialog
  const [accessUser, setAccessUser] = useState<AdminUser | null>(null);
  const [accessSelectedIds, setAccessSelectedIds] = useState<Set<number>>(new Set());

  // OTP generator
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [otpEmail, setOtpEmail] = useState("");

  // Getting-started banner (dismissed per-browser via localStorage)
  const BANNER_KEY = "ringside_admin_smtp_banner_dismissed";
  const [bannerDismissed, setBannerDismissed] = useState(() =>
    typeof window !== "undefined" && window.localStorage.getItem(BANNER_KEY) === "1"
  );
  function dismissBanner() {
    window.localStorage.setItem(BANNER_KEY, "1");
    setBannerDismissed(true);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: users, isLoading, refetch } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () => customFetch("/api/admin/users"),
  });

  const { data: allTargets } = useListTargets();

  const { data: accessData, isLoading: accessLoading } = useQuery<{ targetIds: number[] }>({
    queryKey: ["/api/admin/users", accessUser?.id, "access"],
    queryFn: () => customFetch(`/api/admin/users/${accessUser!.id}/access`),
    enabled: !!accessUser,
  });

  const { data: smtpStatus, isLoading: smtpLoading, refetch: refetchSmtp } =
    useQuery<{ configured: boolean; reachable: boolean }>({
      queryKey: ["/api/auth/smtp/status"],
      queryFn: () => customFetch("/api/auth/smtp/status"),
      staleTime: 5 * 60 * 1000,
      retry: false,
    });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const sendInvite = useMutation({
    mutationFn: (data: { email: string; displayName: string; role: string }) =>
      customFetch<{ ok: boolean; emailed: boolean; inviteUrl?: string }>("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      if (data.emailed) {
        toast({ title: "Invite sent", description: `An invite link was emailed to ${inviteEmail}.` });
        closeInviteDialog();
      } else if (data.inviteUrl) {
        setInviteLink(data.inviteUrl);
      }
    },
    onError: (err: Error) =>
      toast({ title: "Error sending invite", description: err.message, variant: "destructive" }),
  });

  function closeInviteDialog() {
    setInviteOpen(false);
    setInviteEmail("");
    setInviteDisplayName("");
    setInviteRole("Member");
    setInviteLink(null);
    setCopied(false);
  }

  function copyInviteLink() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      customFetch(`/api/admin/users/${id}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      toast({ title: "Role updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: () => toast({ title: "Error updating role", variant: "destructive" }),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) =>
      customFetch(`/api/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "User removed", description: `${deleteTarget?.email} has been deleted.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setDeleteTarget(null);
    },
    onError: () =>
      toast({ title: "Error deleting user", variant: "destructive" }),
  });

  const requestOtp = useMutation({
    mutationFn: (email: string) =>
      customFetch<{ ok: boolean; code?: string; message?: string }>(
        "/api/auth/otp/request",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        },
      ),
    onSuccess: (data) => {
      if (data.code) setGeneratedCode(data.code);
    },
    onError: () => toast({ title: "Error generating OTP", variant: "destructive" }),
  });

  const handleGenerateOtp = () => {
    if (!otpEmail.trim()) return;
    setGeneratedCode(null);
    requestOtp.mutate(otpEmail.trim().toLowerCase());
  };

  const saveAccess = useMutation({
    mutationFn: ({ id, targetIds }: { id: string; targetIds: number[] }) =>
      customFetch(`/api/admin/users/${id}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetIds }),
      }),
    onSuccess: () => {
      toast({ title: "Access updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", accessUser?.id, "access"] });
      setAccessUser(null);
    },
    onError: () => toast({ title: "Error updating access", variant: "destructive" }),
  });

  function openAccessDialog(user: AdminUser) {
    setAccessUser(user);
    setAccessSelectedIds(new Set());
  }

  function toggleAccessTarget(id: number) {
    setAccessSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  React.useEffect(() => {
    if (accessData) setAccessSelectedIds(new Set(accessData.targetIds));
  }, [accessData]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-sans text-xl font-bold tracking-tight flex items-center gap-2">
            <Shield size={18} className="text-primary" />
            Admin Console
          </h1>
          <p className="text-[11px] text-muted-foreground/60 font-mono mt-0.5">
            Manage users and access for this workspace
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-7 px-2">
            <RefreshCw size={12} />
          </Button>
          <Button
            size="sm"
            onClick={() => setInviteOpen(true)}
            className="rounded-sm font-mono text-[10px] uppercase h-7 px-2.5 gap-1.5"
          >
            <UserPlus size={11} /> Invite User
          </Button>
        </div>
      </div>

      {/* Getting-started banner — shown when SMTP is not yet configured and not dismissed */}
      {!smtpLoading && smtpStatus && !smtpStatus.configured && !bannerDismissed && (
        <div className="rounded-sm border border-blue-500/30 bg-blue-500/8 p-4 flex items-start gap-3">
          <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="font-mono text-[11px] font-semibold text-blue-600 uppercase tracking-wider">
              Getting Started — Inviting Users
            </p>
            <p className="text-[10px] font-mono text-blue-700/80 leading-relaxed">
              Email delivery is not configured, so invite links won't be sent automatically.
              To add a new user: click <strong>Invite User</strong> → fill in their email and role
              → copy the link shown and send it to them directly (Slack, WhatsApp, email, etc.).
              They'll click the link, set their password, and are immediately signed in.
            </p>
          </div>
          <button
            onClick={dismissBanner}
            className="text-blue-500/50 hover:text-blue-500 transition-colors shrink-0"
            title="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* SMTP Health Banner */}
      {!smtpLoading && smtpStatus && (
        smtpStatus.configured && !smtpStatus.reachable ? (
          <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2.5">
            <WifiOff size={13} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[11px] font-semibold text-amber-600 uppercase tracking-wider">
                Email Delivery Unavailable
              </div>
              <p className="text-[10px] font-mono text-amber-700/80 leading-relaxed mt-0.5">
                SMTP credentials are configured but the server is not reachable. Login codes
                will fail to deliver until this is fixed. Check{" "}
                <code className="bg-amber-500/15 px-0.5 rounded">SMTP_HOST</code>,{" "}
                <code className="bg-amber-500/15 px-0.5 rounded">SMTP_USER</code>, and{" "}
                <code className="bg-amber-500/15 px-0.5 rounded">SMTP_PASS</code> in your
                environment secrets.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => refetchSmtp()}
              className="h-6 w-6 p-0 text-amber-600/60 hover:text-amber-600 hover:bg-amber-500/20 shrink-0"
              title="Re-check SMTP"
            >
              <RefreshCw size={10} />
            </Button>
          </div>
        ) : smtpStatus.configured && smtpStatus.reachable ? (
          <div className="rounded-sm border border-green-500/30 bg-green-500/8 p-3 flex items-center gap-2.5">
            <MailCheck size={13} className="text-green-500 shrink-0" />
            <span className="font-mono text-[10px] text-green-600">
              SMTP is configured and reachable — login codes will be delivered by email.
            </span>
          </div>
        ) : (
          <div className="rounded-sm border border-border/40 bg-muted/20 p-3 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <MailX size={13} className="text-muted-foreground/50 shrink-0" />
              <span className="font-mono text-[10px] text-muted-foreground/60">
                SMTP is not configured — invite links and login codes won't be emailed.
              </span>
            </div>
            <div className="border-t border-border/30 pt-2.5 space-y-1.5">
              <p className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                To enable email delivery, add these environment secrets:
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[
                  ["SMTP_HOST", "e.g. smtp.gmail.com"],
                  ["SMTP_USER", "your SMTP login email"],
                  ["SMTP_PASS", "app password or token"],
                  ["SMTP_FROM", "sender address (optional)"],
                  ["SMTP_PORT", "587 (optional, default)"],
                ].map(([key, hint]) => (
                  <div key={key} className="flex items-start gap-1.5">
                    <code className="font-mono text-[9px] bg-muted/40 px-1 py-0.5 rounded text-foreground/70 shrink-0">{key}</code>
                    <span className="text-[9px] font-mono text-muted-foreground/40 leading-tight">{hint}</span>
                  </div>
                ))}
              </div>
              <p className="text-[9px] font-mono text-muted-foreground/40 leading-relaxed">
                Add these in the Replit Secrets panel (padlock icon). Restart the API server after saving.
              </p>
            </div>
          </div>
        )
      )}

      {/* OTP Generator */}
      <div className="rounded-sm border border-border/50 bg-card/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield size={13} className="text-primary" />
          <span className="font-mono text-[11px] uppercase tracking-wider font-semibold">
            Generate Login Code (OTP)
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground/60 font-mono">
          Generate a 6-digit one-time login code for a user. Share the code with them directly.
          New users must be created first, then given a code to log in for the first time.
        </p>
        <div className="flex gap-2">
          <Input
            value={otpEmail}
            onChange={(e) => { setOtpEmail(e.target.value); setGeneratedCode(null); }}
            placeholder="user@example.com"
            className="rounded-sm bg-background/50 font-mono text-[11px] h-8 max-w-xs"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateOtp}
            disabled={!otpEmail.trim() || requestOtp.isPending}
            className="rounded-sm font-mono text-[10px] uppercase h-8 px-3 gap-1.5"
          >
            {requestOtp.isPending
              ? <Loader2 size={10} className="animate-spin" />
              : <Shield size={10} />}
            Generate
          </Button>
        </div>
        {generatedCode && (
          <div className="flex items-center gap-3 p-2.5 rounded-sm border border-primary/30 bg-primary/10">
            <CheckCircle2 size={13} className="text-primary shrink-0" />
            <div>
              <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                One-time code for {otpEmail}
              </div>
              <div className="font-mono text-2xl font-bold tracking-[0.3em] text-primary mt-0.5">
                {generatedCode}
              </div>
              <div className="text-[9px] font-mono text-muted-foreground/40 mt-0.5">Expires in 10 minutes</div>
            </div>
          </div>
        )}
      </div>

      {/* User List */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Users size={13} className="text-muted-foreground/60" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Users ({users?.length ?? 0})
          </span>
        </div>

        {isLoading && (
          <div className="rounded-sm border border-border/40 overflow-hidden divide-y divide-border/30">
            {[1, 2, 3].map((i) => (
              <SkeletonRow key={i} cols={3} />
            ))}
          </div>
        )}

        {!isLoading && (!users || users.length === 0) && (
          <div className="text-center py-10 text-muted-foreground/40 font-mono text-[11px]">
            No users yet. Use "Invite User" to create the first account.
          </div>
        )}

        {users?.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between gap-3 p-3 rounded-sm border border-border/40 bg-card/40 hover:bg-card/60 transition-colors"
          >
            {/* User info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[12px] font-medium">
                  {user.displayName ?? user.email}
                </span>
                <Badge
                  variant="outline"
                  className={`text-[9px] font-mono px-1.5 py-0 ${ROLE_COLORS[user.role] ?? ROLE_COLORS.Member}`}
                >
                  {user.role}
                </Badge>
              </div>
              <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                {user.displayName ? user.email + " · " : ""}
                Joined {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
              </div>
            </div>

            {/* Role selector */}
            <Select
              value={user.role}
              onValueChange={(role) => updateRole.mutate({ id: user.id, role })}
            >
              <SelectTrigger className="w-28 h-6 rounded-sm bg-background/50 font-sans text-[10px] border-border/50 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-sm font-sans text-[11px]">
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Manage access button */}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 gap-1 text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 shrink-0 font-mono text-[10px] uppercase"
              onClick={() => openAccessDialog(user)}
              title="Manage deal access"
              disabled={user.role === "Admin"}
            >
              <Eye size={11} /> Access
            </Button>

            {/* Delete button */}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 shrink-0"
              onClick={() => setDeleteTarget(user)}
              title="Remove user"
            >
              <Trash2 size={11} />
            </Button>
          </div>
        ))}
      </div>

      {/* ── Invite Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={inviteOpen} onOpenChange={(o) => { if (!o) closeInviteDialog(); }}>
        <DialogContent className="sm:max-w-md border-border bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-sans font-semibold text-base">
              {inviteLink ? "Share Invite Link" : "Send Invite"}
            </DialogTitle>
          </DialogHeader>

          {/* ── Step 1: invite form ── */}
          {!inviteLink && (
            <>
              <div className="space-y-4 py-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Email <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@company.com"
                    className="rounded-sm bg-background/50 font-mono text-[11px]"
                    type="email"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Display Name <span className="text-muted-foreground/40">(optional)</span>
                  </label>
                  <Input
                    value={inviteDisplayName}
                    onChange={(e) => setInviteDisplayName(e.target.value)}
                    placeholder="Jane Smith"
                    className="rounded-sm bg-background/50 font-mono text-[11px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Role
                  </label>
                  <Select value={inviteRole} onValueChange={(r) => setInviteRole(r as Role)}>
                    <SelectTrigger className="rounded-sm bg-background/50 font-sans text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-sm">
                      {ALL_ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="font-mono text-[11px]">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[9px] text-muted-foreground/50 font-mono">
                    <strong>Admin</strong> — full access · <strong>Deal Lead</strong> — can change stages &amp; run IC ·{" "}
                    <strong>Member</strong> — read + comment · <strong>IC Voter</strong> — vote on proposals
                  </p>
                </div>
                <div className="rounded-sm bg-muted/30 border border-border/40 p-2.5 flex items-start gap-2">
                  <Link2 size={11} className="text-muted-foreground/50 shrink-0 mt-0.5" />
                  <p className="text-[10px] font-mono text-muted-foreground/60 leading-relaxed">
                    The recipient will receive a secure link to set their own password and join.
                    The link expires in 72 hours.
                    {smtpStatus && !smtpStatus.configured && (
                      <> SMTP is not configured — you'll receive a link to share manually.</>
                    )}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={closeInviteDialog}
                  className="rounded-sm font-mono text-[10px] uppercase"
                >
                  Cancel
                </Button>
                <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
                  <Button
                    onClick={() => sendInvite.mutate({ email: inviteEmail, displayName: inviteDisplayName, role: inviteRole })}
                    disabled={!inviteEmail.trim() || sendInvite.isPending}
                    className="rounded-sm font-mono text-[10px] uppercase"
                  >
                    {sendInvite.isPending ? <Loader2 size={10} className="animate-spin mr-1" /> : <UserPlus size={10} className="mr-1" />}
                    Send Invite
                  </Button>
                </motion.div>
              </DialogFooter>
            </>
          )}

          {/* ── Step 2: copy link (SMTP not configured) ── */}
          {inviteLink && (
            <>
              <div className="space-y-4 py-3">
                <div className="flex items-start gap-2.5 rounded-sm bg-green-500/8 border border-green-500/30 p-3">
                  <CheckCircle2 size={13} className="text-green-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-mono font-semibold text-green-600">Invite created for {inviteEmail}</p>
                    <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5 leading-relaxed">
                      SMTP is not configured, so the link wasn't emailed automatically.
                      Copy and share it directly with the recipient.
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Invite Link <span className="text-muted-foreground/40">(expires in 72 hours)</span>
                  </label>
                  <div className="flex gap-1.5">
                    <Input
                      value={inviteLink}
                      readOnly
                      className="rounded-sm bg-background/50 font-mono text-[10px] text-muted-foreground"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={copyInviteLink}
                      className="rounded-sm h-9 px-2.5 shrink-0"
                      title="Copy link"
                    >
                      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                    </Button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
                  <Button
                    onClick={closeInviteDialog}
                    className="rounded-sm font-mono text-[10px] uppercase"
                  >
                    Done
                  </Button>
                </motion.div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Access Management Dialog ────────────────────────────────────── */}
      <Dialog open={!!accessUser} onOpenChange={(o) => { if (!o) setAccessUser(null); }}>
        <DialogContent className="sm:max-w-md border-border bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-sans font-semibold text-base flex items-center gap-2">
              <Eye size={15} className="text-primary" /> Deal Access
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-[10px] font-mono text-muted-foreground/60 leading-relaxed">
              {accessUser?.displayName ?? accessUser?.email} can only see deals checked below.
              Unchecked deals stay hidden from the Pipeline, Dashboard, Actions, and Weekly Review.
            </p>
            <div className="max-h-72 overflow-y-auto space-y-1 border border-border/40 rounded-sm p-2 bg-background/30">
              {accessLoading && (
                <div className="text-center py-6 text-muted-foreground/40 font-mono text-[10px]">
                  Loading…
                </div>
              )}
              {!accessLoading && (!allTargets || allTargets.length === 0) && (
                <div className="text-center py-6 text-muted-foreground/40 font-mono text-[10px]">
                  No deals in the pipeline yet.
                </div>
              )}
              {!accessLoading && allTargets?.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-2 p-1.5 rounded-sm hover:bg-muted/30 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={accessSelectedIds.has(t.id)}
                    onChange={() => toggleAccessTarget(t.id)}
                    className="accent-primary"
                  />
                  <span className="font-mono text-[11px] truncate">
                    {t.targetCode} — {t.projectName}
                  </span>
                </label>
              ))}
            </div>
            {accessSelectedIds.size === 0 && (
              <div className="flex items-start gap-2 rounded-sm bg-amber-500/10 border border-amber-500/30 p-2">
                <EyeOff size={12} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[10px] font-mono text-amber-700/80 leading-relaxed">
                  No deals selected — this user won't see any deals until you grant access.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAccessUser(null)}
              className="rounded-sm font-mono text-[10px] uppercase"
            >
              Cancel
            </Button>
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
              <Button
                onClick={() => accessUser && saveAccess.mutate({ id: accessUser.id, targetIds: [...accessSelectedIds] })}
                disabled={saveAccess.isPending}
                className="rounded-sm font-mono text-[10px] uppercase"
              >
                {saveAccess.isPending ? <Loader2 size={10} className="animate-spin mr-1" /> : null}
                Save Access
              </Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ──────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm border-border bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-sans font-semibold text-base text-destructive">
              Remove User
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-2">
            <p className="text-sm text-muted-foreground">
              This will permanently delete{" "}
              <strong className="font-mono text-foreground">{deleteTarget?.email}</strong> and
              revoke their access. This cannot be undone.
            </p>
            {deleteTarget && (
              <div className="rounded-sm bg-destructive/10 border border-destructive/25 p-2.5">
                <div className="text-[10px] font-mono text-muted-foreground/60 uppercase">User to remove</div>
                <div className="font-mono text-[12px] font-medium mt-0.5">{deleteTarget.displayName ?? deleteTarget.email}</div>
                {deleteTarget.displayName && (
                  <div className="text-[10px] font-mono text-muted-foreground/50">{deleteTarget.email}</div>
                )}
                <Badge
                  variant="outline"
                  className={`mt-1.5 text-[9px] font-mono px-1.5 py-0 ${ROLE_COLORS[deleteTarget.role] ?? ROLE_COLORS.Member}`}
                >
                  {deleteTarget.role}
                </Badge>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="rounded-sm font-mono text-[10px] uppercase"
            >
              Cancel
            </Button>
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
              <Button
                variant="destructive"
                onClick={() => deleteTarget && deleteUser.mutate(deleteTarget.id)}
                disabled={deleteUser.isPending}
                className="rounded-sm font-mono text-[10px] uppercase"
              >
                {deleteUser.isPending ? <Loader2 size={10} className="animate-spin mr-1" /> : null}
                Remove User
              </Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
