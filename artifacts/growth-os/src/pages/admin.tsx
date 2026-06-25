import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, UserPlus, RefreshCw, Loader2, CheckCircle2, AlertTriangle, Users,
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
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  createdAt: string;
}

const ROLE_COLORS: Record<string, string> = {
  Admin: "bg-primary/20 text-primary border-primary/30",
  Member: "bg-muted/50 text-muted-foreground border-border/50",
  Viewer: "bg-muted/30 text-muted-foreground/60 border-border/30",
};

export default function AdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [inviteRole, setInviteRole] = useState("Member");
  const [invitePassword, setInvitePassword] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpOpen, setOtpOpen] = useState(false);

  const { data: users, isLoading, refetch } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () => customFetch("/api/admin/users"),
  });

  const inviteUser = useMutation({
    mutationFn: (data: { email: string; displayName: string; role: string; temporaryPassword: string }) =>
      customFetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: "User invited" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setInviteOpen(false);
      setInviteEmail(""); setInviteDisplayName(""); setInviteRole("Member"); setInvitePassword("");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      customFetch(`/api/admin/users/${id}/role`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) }),
    onSuccess: () => {
      toast({ title: "Role updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: () => toast({ title: "Error updating role", variant: "destructive" }),
  });

  const requestOtp = useMutation({
    mutationFn: (email: string) =>
      customFetch<{ ok: boolean; code?: string; message?: string }>("/api/auth/otp/request", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      }),
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

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-tight flex items-center gap-2">
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
          <Button size="sm" onClick={() => setInviteOpen(true)} className="rounded-sm font-mono text-[10px] uppercase h-7 px-2.5 gap-1.5">
            <UserPlus size={11} /> Invite User
          </Button>
        </div>
      </div>

      {/* OTP Generator */}
      <div className="rounded-sm border border-border/50 bg-card/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield size={13} className="text-primary" />
          <span className="font-mono text-[11px] uppercase tracking-wider font-semibold">Generate Login Code (OTP)</span>
        </div>
        <p className="text-[10px] text-muted-foreground/60 font-mono">
          Generate a 6-digit one-time login code for a user. Share the code with them directly.
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
            {requestOtp.isPending ? <Loader2 size={10} className="animate-spin" /> : <Shield size={10} />}
            Generate
          </Button>
        </div>
        {generatedCode && (
          <div className="flex items-center gap-3 p-2.5 rounded-sm border border-primary/30 bg-primary/10">
            <CheckCircle2 size={13} className="text-primary shrink-0" />
            <div>
              <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">One-time code for {otpEmail}</div>
              <div className="font-mono text-2xl font-bold tracking-[0.3em] text-primary mt-0.5">{generatedCode}</div>
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
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-sm bg-muted/20 animate-pulse" />)}
          </div>
        )}

        {!isLoading && (!users || users.length === 0) && (
          <div className="text-center py-10 text-muted-foreground/40 font-mono text-[11px]">
            No users yet. Invite the first user to get started.
          </div>
        )}

        {users?.map((user) => (
          <div key={user.id} className="flex items-center justify-between p-3 rounded-sm border border-border/40 bg-card/40 hover:bg-card/60 transition-colors">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[12px] font-medium">{user.displayName ?? user.email}</span>
                <Badge variant="outline" className={`text-[9px] font-mono px-1.5 py-0 ${ROLE_COLORS[user.role] ?? ROLE_COLORS.Member}`}>
                  {user.role}
                </Badge>
              </div>
              <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                {user.displayName ? user.email + " · " : ""}
                Joined {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
              </div>
            </div>
            <Select
              value={user.role}
              onValueChange={(role) => updateRole.mutate({ id: user.id, role })}
            >
              <SelectTrigger className="w-28 h-6 rounded-sm bg-background/50 font-mono text-[10px] border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-sm font-mono text-[11px]">
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="Member">Member</SelectItem>
                <SelectItem value="Viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md border-border bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-base">Invite User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Email <span className="text-destructive">*</span></label>
              <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" className="rounded-sm bg-background/50 font-mono text-[11px]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Display Name</label>
              <Input value={inviteDisplayName} onChange={(e) => setInviteDisplayName(e.target.value)} placeholder="Jane Smith" className="rounded-sm bg-background/50 font-mono text-[11px]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Role</label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="rounded-sm bg-background/50 font-mono text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-sm">
                  <SelectItem value="Admin" className="font-mono text-[11px]">Admin</SelectItem>
                  <SelectItem value="Member" className="font-mono text-[11px]">Member</SelectItem>
                  <SelectItem value="Viewer" className="font-mono text-[11px]">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Temporary Password</label>
              <Input
                type="password"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                placeholder="Optional — they can also use OTP"
                className="rounded-sm bg-background/50 font-mono text-[11px]"
              />
              <p className="text-[9px] text-muted-foreground/50 font-mono">If left blank, user must log in via OTP code (generated from this admin panel).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)} className="rounded-sm font-mono text-[10px] uppercase">Cancel</Button>
            <Button
              onClick={() => inviteUser.mutate({ email: inviteEmail, displayName: inviteDisplayName, role: inviteRole, temporaryPassword: invitePassword })}
              disabled={!inviteEmail || inviteUser.isPending}
              className="rounded-sm font-mono text-[10px] uppercase"
            >
              {inviteUser.isPending ? <Loader2 size={10} className="animate-spin mr-1" /> : null}
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
