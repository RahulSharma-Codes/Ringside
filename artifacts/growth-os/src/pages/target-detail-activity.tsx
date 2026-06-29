import {
  useGetActivityFeed, getGetActivityFeedQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GitBranch, MessageSquare, ListChecks, CheckCircle2,
  ClipboardCheck, FolderOpen, Activity as ActivityIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ActivityTabProps {
  targetId: number;
  isActive: boolean;
}

export function ActivityTab({ targetId, isActive }: ActivityTabProps) {
  const { data: activityFeed, isLoading: loadingActivity } = useGetActivityFeed(targetId, {
    query: {
      enabled: !!targetId && isActive,
      queryKey: getGetActivityFeedQueryKey(targetId),
    },
  });

  if (loadingActivity) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((n) => <Skeleton key={n} className="h-14 w-full" />)}
      </div>
    );
  }

  if (!activityFeed?.length) {
    return (
      <div className="border border-dashed border-border rounded-sm py-16 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest flex flex-col items-center gap-2">
        <ActivityIcon size={20} className="text-muted-foreground/40" />
        No activity recorded yet
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-px bg-border/60" />
      <div className="space-y-0">
        {activityFeed.map((event, i) => {
          const Icon = event.type === "stage_changed" ? GitBranch
            : event.type === "interaction" ? MessageSquare
            : event.type === "action_created" ? ListChecks
            : event.type === "action_completed" ? CheckCircle2
            : event.type === "diligence_completed" ? ClipboardCheck
            : FolderOpen;
          const iconColor = event.type === "stage_changed" ? "text-primary"
            : event.type === "interaction" ? "text-blue-400"
            : event.type === "action_created" ? "text-muted-foreground"
            : event.type === "action_completed" ? "text-emerald-500"
            : event.type === "diligence_completed" ? "text-violet-400"
            : "text-amber-400";
          let relativeTime = "";
          try {
            relativeTime = formatDistanceToNow(new Date(event.timestamp), { addSuffix: true });
          } catch {
            relativeTime = "";
          }
          return (
            <div key={i} className="relative pl-10 pb-5">
              <div className="absolute left-[9px] top-1 w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center">
                <Icon size={10} className={iconColor} />
              </div>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-snug">{event.title}</div>
                  {event.detail && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{event.detail}</div>
                  )}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground/60 shrink-0 mt-0.5" title={event.timestamp}>
                  {relativeTime}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
