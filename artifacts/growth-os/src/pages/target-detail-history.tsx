import {
  useGetStageHistory, getGetStageHistoryQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { LinkifiedText } from "@/components/linkified-text";
import { StageChip } from "@/components/stage-chip";
import { format, parseISO } from "date-fns";

interface HistoryTabProps {
  targetId: number;
}

export function HistoryTab({ targetId }: HistoryTabProps) {
  const { data: history, isLoading: loadingHistory } = useGetStageHistory(targetId, {
    query: { enabled: !!targetId, queryKey: getGetStageHistoryQueryKey(targetId) },
  });

  if (loadingHistory) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (!history?.length) {
    return (
      <div className="border border-dashed border-border rounded-sm py-16 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest">
        No stage changes recorded
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
      <div className="space-y-0">
        {history.map((entry, i) => (
          <div key={entry.id} className="relative pl-10 pb-6">
            <div className={`absolute left-[13px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-background ${i === 0 ? "bg-primary" : "bg-muted-foreground/40"}`} />
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
              {entry.changedAt ? format(parseISO(entry.changedAt), "MMM d, yyyy · HH:mm") : "—"}
            </div>
            <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
              {entry.previousStage && (
                <>
                  <StageChip stage={entry.previousStage} size="xs" />
                  <span className="text-muted-foreground text-xs">→</span>
                </>
              )}
              <StageChip stage={entry.newStage} size="xs" />
            </div>
            {entry.changeReason && (
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                <LinkifiedText text={entry.changeReason} />
              </p>
            )}
            {entry.changedBy && (
              <div className="text-[10px] font-mono text-muted-foreground mt-1">by {entry.changedBy}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
