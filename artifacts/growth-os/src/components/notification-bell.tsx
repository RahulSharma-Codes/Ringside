import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { PulsingBadge } from "@/components/animated-page";
import { Bell, Check, CheckCheck, AlertTriangle, Clock, FileWarning, Zap, X } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUnreadCount,
  useListNotifications,
  useGenerateNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  getGetUnreadCountQueryKey,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  stage_stagnation:     <Clock size={13} className="text-amber-500 shrink-0" />,
  must_win_no_activity: <Zap size={13} className="text-destructive shrink-0" />,
  nda_expiring:         <FileWarning size={13} className="text-amber-400 shrink-0" />,
};

function getIcon(type: string) {
  if (type.startsWith("action_overdue")) return <AlertTriangle size={13} className="text-destructive shrink-0" />;
  return TYPE_ICONS[type] ?? <Bell size={13} className="text-muted-foreground shrink-0" />;
}

const LAST_GENERATE_KEY = "notif_last_generate";
const STALE_MS = 15 * 60 * 1000;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();

  const unreadQ = useGetUnreadCount({
    query: { queryKey: getGetUnreadCountQueryKey(), refetchInterval: 60_000, enabled: !!user },
  });
  const notifQ = useListNotifications({
    query: { queryKey: getListNotificationsQueryKey(), enabled: open && !!user },
  });
  const generate = useGenerateNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const unreadCount = unreadQ.data?.count ?? 0;

  // On mount, generate if stale (only when authenticated)
  useEffect(() => {
    if (!user) return;
    const last = Number(localStorage.getItem(LAST_GENERATE_KEY) ?? 0);
    if (Date.now() - last > STALE_MS) {
      generate.mutate(undefined, {
        onSuccess: () => {
          localStorage.setItem(LAST_GENERATE_KEY, String(Date.now()));
          qc.invalidateQueries({ queryKey: getGetUnreadCountQueryKey() });
          qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        },
      });
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleClickNotification(id: number, linkPath: string | null | undefined) {
    await markRead.mutateAsync({ id });
    qc.invalidateQueries({ queryKey: getGetUnreadCountQueryKey() });
    qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    setOpen(false);
    if (linkPath) navigate(linkPath);
  }

  async function handleMarkAll() {
    await markAll.mutateAsync(undefined);
    qc.invalidateQueries({ queryKey: getGetUnreadCountQueryKey() });
    qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
  }

  const notifications = notifQ.data ?? [];

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg text-sidebar-foreground/60 hover:text-foreground hover:bg-white/8 transition-colors"
        title="Notifications"
      >
        <Bell size={15} />
        <PulsingBadge
          count={unreadCount}
          className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 rounded-full bg-destructive text-white font-mono text-[8px] font-bold flex items-center justify-center px-0.5 leading-none"
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl border border-border/80 bg-card/95 backdrop-blur-md shadow-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Bell size={13} className="text-muted-foreground" />
              <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">
                Notifications
              </span>
              {unreadCount > 0 && (
                <Badge className="font-mono text-[9px] px-1.5 py-0 h-4 bg-destructive text-white border-0">
                  {unreadCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAll}
                  title="Mark all read"
                  className="text-[10px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
                >
                  <CheckCheck size={11} />
                  All read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Body */}
          <ScrollArea className="max-h-[400px]">
            {notifQ.isLoading ? (
              <div className="flex items-center justify-center h-24 text-[11px] text-muted-foreground font-mono">
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 gap-1.5">
                <Check size={18} className="text-muted-foreground/40" />
                <span className="text-[11px] text-muted-foreground/60 font-mono">All caught up</span>
              </div>
            ) : (
              <div className="py-1">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClickNotification(n.id, n.linkPath)}
                    className={`w-full text-left px-3 py-2.5 flex gap-2.5 items-start hover:bg-muted/60 transition-colors border-b border-border/30 last:border-0 ${
                      !n.isRead ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="mt-0.5">{getIcon(n.type)}</div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[11px] leading-snug ${!n.isRead ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                        {n.title}
                      </div>
                      <div className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                        {n.body}
                      </div>
                      <div className="text-[9px] font-mono text-muted-foreground/50 mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                    {!n.isRead && (
                      <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
