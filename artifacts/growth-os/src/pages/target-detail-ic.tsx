import React, { useState, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  useListIcProposals, getListIcProposalsQueryKey,
  useCreateIcProposal,
  useGetIcProposal, getGetIcProposalQueryKey,
  useAddIcVoter,
  useCastIcVote,
  useResolveIcProposal,
  useUpdateIcCp,
  useListIcSessions, getListIcSessionsQueryKey,
  useCreateIcSession,
  useDeleteIcSession,
  useGetIcMemo, getGetIcMemoQueryKey,
  useRunIcMemo,
  useListValuations,
} from "@workspace/api-client-react";
import type { IcProposal, IcVote, IcCp, IcMemoResult } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Scale, CheckCircle2, XCircle, AlertTriangle, Clock, Users,
  ChevronDown, ChevronRight, Trash2, Lock, Gavel, FileText, Flag,
  Target as TargetIcon, Sparkles, Copy, RefreshCw,
} from "lucide-react";
import { format, parseISO, formatDistanceToNow } from "date-fns";

interface IcTabProps {
  targetId: number;
}

type VoteOption = "Approve" | "Approve with Conditions" | "Reject" | "Recuse";

function outcomeStyle(outcome: string | null | undefined) {
  if (outcome === "Approved") return "bg-emerald-500/10 text-emerald-500 border-emerald-500/25";
  if (outcome === "Approved with Conditions") return "bg-amber-500/10 text-amber-500 border-amber-500/25";
  if (outcome === "Rejected") return "bg-destructive/10 text-destructive border-destructive/25";
  return "bg-muted/50 text-muted-foreground border-border/60";
}

function voteStyle(vote: string | null | undefined) {
  if (vote === "Approve") return "bg-emerald-500/10 text-emerald-500 border-emerald-500/25";
  if (vote === "Approve with Conditions") return "bg-amber-500/10 text-amber-500 border-amber-500/25";
  if (vote === "Reject") return "bg-destructive/10 text-destructive border-destructive/25";
  if (vote === "Recuse") return "bg-muted/50 text-muted-foreground border-border/60";
  return "bg-muted/30 text-muted-foreground/60 border-border/40";
}

function formatDatetime(dt: string | null | undefined) {
  if (!dt) return "—";
  try { return format(parseISO(dt), "MMM d, yyyy"); } catch { return dt; }
}

// ---------------------------------------------------------------------------
// ProposalCard — loads its own detail (votes + CPs)
// ---------------------------------------------------------------------------
function ProposalCard({ proposal, targetId }: { proposal: IcProposal; targetId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canEditDeal, canVote } = useAuth();
  const [expanded, setExpanded] = useState(true);
  const [addVoterOpen, setAddVoterOpen] = useState(false);
  const [voterName, setVoterName] = useState("");
  const [voteDialogOpen, setVoteDialogOpen] = useState(false);
  const [selectedVoteId, setSelectedVoteId] = useState<number | null>(null);
  const [voteChoice, setVoteChoice] = useState<VoteOption>("Approve");
  const [voteRationale, setVoteRationale] = useState("");
  const [voteConditions, setVoteConditions] = useState("");
  const [resolveConfirmOpen, setResolveConfirmOpen] = useState(false);
  const [cpEditOpen, setCpEditOpen] = useState(false);
  const [cpEditId, setCpEditId] = useState<number | null>(null);
  const [cpEditOwner, setCpEditOwner] = useState("");
  const [cpEditDate, setCpEditDate] = useState("");

  const detailKey = getGetIcProposalQueryKey(proposal.id);
  const { data: detail, isLoading: loadingDetail } = useGetIcProposal(proposal.id, {
    query: { enabled: expanded, queryKey: detailKey },
  });

  const addVoter = useAddIcVoter();
  const castVote = useCastIcVote();
  const resolveProposal = useResolveIcProposal();
  const updateCp = useUpdateIcCp();

  const invalidateDetail = () => queryClient.invalidateQueries({ queryKey: detailKey });
  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: getListIcProposalsQueryKey(targetId) });

  const handleAddVoter = () => {
    if (!voterName.trim()) return;
    addVoter.mutate(
      { id: proposal.id, data: { voterName: voterName.trim() } },
      {
        onSuccess: () => {
          toast({ title: "Voter added" });
          setAddVoterOpen(false);
          setVoterName("");
          invalidateDetail();
        },
        onError: () => toast({ title: "Error", description: "Could not add voter", variant: "destructive" }),
      }
    );
  };

  const openVoteDialog = (voteId: number) => {
    setSelectedVoteId(voteId);
    setVoteChoice("Approve");
    setVoteRationale("");
    setVoteConditions("");
    setVoteDialogOpen(true);
  };

  const handleCastVote = () => {
    if (!selectedVoteId || !voteRationale.trim()) return;
    const conditions =
      voteChoice === "Approve with Conditions"
        ? voteConditions.split("\n").map((s) => s.trim()).filter(Boolean)
        : null;
    castVote.mutate(
      {
        id: selectedVoteId,
        data: { vote: voteChoice, rationale: voteRationale, conditions: conditions ?? undefined },
      },
      {
        onSuccess: () => {
          toast({ title: "Vote recorded" });
          setVoteDialogOpen(false);
          invalidateDetail();
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Could not cast vote";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleResolve = () => {
    resolveProposal.mutate(
      { id: proposal.id },
      {
        onSuccess: () => {
          toast({ title: "Proposal resolved", description: `Outcome: ${detail?.proposal.outcome ?? ""}` });
          setResolveConfirmOpen(false);
          invalidateDetail();
          invalidateList();
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Could not resolve";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleCloseCp = (cpId: number, currentStatus: string) => {
    const newStatus = currentStatus === "Closed" ? "Open" : "Closed";
    updateCp.mutate(
      { cpId, data: { status: newStatus } },
      {
        onSuccess: () => {
          toast({ title: newStatus === "Closed" ? "CP closed" : "CP reopened" });
          invalidateDetail();
        },
        onError: () => toast({ title: "Error", description: "Could not update CP", variant: "destructive" }),
      }
    );
  };

  const openCpEdit = (cp: IcCp) => {
    setCpEditId(cp.id);
    setCpEditOwner(cp.ownerName ?? "");
    setCpEditDate(cp.targetDate ?? "");
    setCpEditOpen(true);
  };

  const handleSaveCpEdit = () => {
    if (!cpEditId) return;
    updateCp.mutate(
      { cpId: cpEditId, data: { ownerName: cpEditOwner || null, targetDate: cpEditDate || null } },
      {
        onSuccess: () => {
          toast({ title: "CP updated" });
          setCpEditOpen(false);
          setCpEditId(null);
          invalidateDetail();
        },
        onError: () => toast({ title: "Error", description: "Could not update CP", variant: "destructive" }),
      }
    );
  };

  const isResolved = proposal.status === "Resolved";
  const tally = detail?.voteTally;
  const pendingCount = tally ? tally.total - tally.voted : 0;
  const deadlinePassed =
    proposal.votingDeadline && new Date(proposal.votingDeadline) < new Date();

  return (
    <Card className="bg-card/30 border-border rounded-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className="flex items-center gap-1.5 text-left"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
              <span className="text-[11px] font-mono text-muted-foreground/70">
                Submitted {formatDatetime(proposal.submittedAt)}
                {proposal.submittedBy ? ` by ${proposal.submittedBy}` : ""}
              </span>
            </button>
            {isResolved ? (
              <Badge variant="outline" className={`font-mono text-[10px] uppercase rounded-sm ${outcomeStyle(proposal.outcome)}`}>
                <Lock size={9} className="mr-1" /> {proposal.outcome}
              </Badge>
            ) : (
              <Badge variant="outline" className="font-mono text-[10px] uppercase rounded-sm bg-primary/10 text-primary border-primary/25">
                <Gavel size={9} className="mr-1" /> Voting Open
              </Badge>
            )}
            {proposal.votingDeadline && (
              <span className={`text-[10px] font-mono ${deadlinePassed && !isResolved ? "text-destructive" : "text-muted-foreground"}`}>
                <Clock size={9} className="inline mr-0.5" />
                {isResolved ? formatDatetime(proposal.votingDeadline) : (
                  deadlinePassed ? `Deadline passed (${formatDatetime(proposal.votingDeadline)})` : `Due ${formatDatetime(proposal.votingDeadline)}`
                )}
              </span>
            )}
          </div>
          {!isResolved && canEditDeal && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-sm font-mono text-[10px] uppercase border-border shrink-0 h-7 gap-1"
              onClick={() => setResolveConfirmOpen(true)}
              disabled={resolveProposal.isPending}
            >
              <Lock size={10} /> Resolve
            </Button>
          )}
        </div>

        {/* Vote tally bar */}
        {tally && tally.total > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden flex">
              {tally.approve > 0 && (
                <div className="bg-emerald-500 h-full" style={{ width: `${(tally.approve / tally.total) * 100}%` }} />
              )}
              {tally.approveWithConditions > 0 && (
                <div className="bg-amber-500 h-full" style={{ width: `${(tally.approveWithConditions / tally.total) * 100}%` }} />
              )}
              {tally.reject > 0 && (
                <div className="bg-destructive h-full" style={{ width: `${(tally.reject / tally.total) * 100}%` }} />
              )}
              {tally.recuse > 0 && (
                <div className="bg-muted-foreground/40 h-full" style={{ width: `${(tally.recuse / tally.total) * 100}%` }} />
              )}
            </div>
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
              {tally.voted}/{tally.total} voted
              {pendingCount > 0 && ` · ${pendingCount} pending`}
            </span>
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-4 space-y-4">
          {loadingDetail ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              {/* Proposal text fields */}
              {(proposal.recommendedTerms || proposal.keyRisks || proposal.memoNote) && (
                <div className="space-y-2 text-sm">
                  {proposal.recommendedTerms && (
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 block mb-0.5">Recommended Terms</span>
                      <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{proposal.recommendedTerms}</p>
                    </div>
                  )}
                  {proposal.keyRisks && (
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 block mb-0.5">Key Risks</span>
                      <p className="text-amber-500/80 leading-relaxed whitespace-pre-wrap">{proposal.keyRisks}</p>
                    </div>
                  )}
                  {proposal.memoNote && (
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 block mb-0.5">IC Memo</span>
                      <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{proposal.memoNote}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Voting Panel */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1">
                    <Users size={11} /> Voting Panel
                  </span>
                  {!isResolved && canEditDeal && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 font-mono text-[10px] uppercase text-muted-foreground"
                      onClick={() => setAddVoterOpen(true)}
                    >
                      <Plus size={10} className="mr-0.5" /> Add Voter
                    </Button>
                  )}
                </div>

                {!detail?.votes.length ? (
                  <p className="text-[11px] font-mono text-muted-foreground/50 italic">No voters added yet</p>
                ) : (
                  <div className="space-y-2">
                    {detail.votes.map((vote: IcVote) => (
                      <div key={vote.id} className="flex items-start gap-2 p-2 bg-muted/20 rounded-sm border border-border/40">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-semibold font-mono">{vote.voterName}</span>
                            <Badge
                              variant="outline"
                              className={`font-mono text-[9px] uppercase rounded-sm ${voteStyle(vote.vote)}`}
                            >
                              {vote.castAt ? vote.vote : "Pending"}
                            </Badge>
                            {vote.castAt && (
                              <span className="text-[9px] font-mono text-muted-foreground/60">
                                {formatDatetime(vote.castAt)}
                              </span>
                            )}
                          </div>
                          {vote.rationale && (
                            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{vote.rationale}</p>
                          )}
                          {vote.conditions && vote.conditions.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {vote.conditions.map((c: string, idx: number) => (
                                <div key={idx} className="text-[10px] font-mono text-amber-500/80 pl-2 border-l border-amber-500/30">
                                  {c}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {!vote.castAt && !isResolved && canVote && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-sm font-mono text-[10px] uppercase border-border shrink-0 h-7 gap-1"
                            onClick={() => openVoteDialog(vote.id)}
                          >
                            <Gavel size={10} /> Vote
                          </Button>
                        )}
                        {vote.castAt && (
                          <Lock size={12} className="text-muted-foreground/30 shrink-0 mt-0.5" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Outcome banner */}
              {isResolved && proposal.outcome && (
                <div className={`rounded-sm p-3 border text-sm ${outcomeStyle(proposal.outcome)}`}>
                  <div className="flex items-center gap-2 font-semibold font-mono text-[11px] uppercase">
                    {proposal.outcome === "Approved" && <CheckCircle2 size={14} />}
                    {proposal.outcome === "Approved with Conditions" && <AlertTriangle size={14} />}
                    {proposal.outcome === "Rejected" && <XCircle size={14} />}
                    Outcome: {proposal.outcome}
                  </div>
                  {detail?.stageSuggestion && (
                    <p className="text-[11px] mt-1 font-mono opacity-80">{detail.stageSuggestion}</p>
                  )}
                  {proposal.outcome === "Rejected" && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] font-mono opacity-80">
                      <Flag size={10} /> Consider flagging for Dropped — record rejection reasons in IC sessions log below
                    </div>
                  )}
                </div>
              )}

              {/* CP Register */}
              {isResolved && detail && detail.cps.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-2 flex items-center gap-1">
                    <FileText size={11} /> Conditions Precedent Register
                  </div>
                  <div className="space-y-1.5">
                    {detail.cps.map((cp: IcCp) => (
                      <div
                        key={cp.id}
                        className={`flex items-start gap-2 p-2 rounded-sm border text-sm ${
                          cp.status === "Closed"
                            ? "bg-muted/10 border-border/30 opacity-70"
                            : cp.isSlipping
                            ? "bg-destructive/5 border-destructive/20"
                            : "bg-muted/20 border-border/40"
                        }`}
                      >
                        <button
                          type="button"
                          className={`mt-0.5 shrink-0 rounded-sm ${cp.status === "Closed" ? "text-emerald-500" : "text-muted-foreground/40"}`}
                          onClick={() => handleCloseCp(cp.id, cp.status)}
                          title={cp.status === "Closed" ? "Reopen" : "Close"}
                        >
                          <CheckCircle2 size={14} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[12px] leading-snug ${cp.status === "Closed" ? "line-through text-muted-foreground/50" : ""}`}>
                            {cp.description}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {cp.ownerName && (
                              <span className="text-[10px] font-mono text-muted-foreground/70">{cp.ownerName}</span>
                            )}
                            {cp.targetDate && (
                              <span className={`text-[10px] font-mono ${cp.isSlipping ? "text-destructive" : "text-muted-foreground/70"}`}>
                                <Clock size={9} className="inline mr-0.5" />
                                Due {formatDatetime(cp.targetDate)}
                                {cp.isSlipping && " · Slipping"}
                              </span>
                            )}
                            {cp.status === "Closed" && cp.closedAt && (
                              <span className="text-[10px] font-mono text-emerald-500/70">
                                Closed {formatDatetime(cp.closedAt)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge
                            variant="outline"
                            className={`font-mono text-[9px] uppercase rounded-sm ${
                              cp.status === "Closed" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/25" :
                              cp.isSlipping ? "bg-destructive/10 text-destructive border-destructive/25" :
                              "bg-muted/30 text-muted-foreground/70 border-border/40"
                            }`}
                          >
                            {cp.isSlipping && cp.status !== "Closed" ? "Slipping" : cp.status}
                          </Badge>
                          {cp.status !== "Closed" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-muted-foreground/50 hover:text-foreground"
                              onClick={() => openCpEdit(cp)}
                              title="Edit owner / target date"
                            >
                              <TargetIcon size={10} />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}

      {/* Add Voter Dialog */}
      <Dialog open={addVoterOpen} onOpenChange={setAddVoterOpen}>
        <DialogContent className="sm:max-w-sm rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm uppercase tracking-wider">Add Voter</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Voter name"
              value={voterName}
              onChange={(e) => setVoterName(e.target.value)}
              className="font-mono text-sm rounded-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddVoterOpen(false)} className="rounded-sm font-mono text-[10px] uppercase">Cancel</Button>
            <Button
              onClick={handleAddVoter}
              disabled={!voterName.trim() || addVoter.isPending}
              className="rounded-sm font-mono text-[10px] uppercase"
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vote Dialog */}
      <Dialog open={voteDialogOpen} onOpenChange={setVoteDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm uppercase tracking-wider">Cast Vote</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">Vote</label>
              <Select value={voteChoice} onValueChange={(v) => setVoteChoice(v as VoteOption)}>
                <SelectTrigger className="rounded-sm font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Approve">Approve</SelectItem>
                  <SelectItem value="Approve with Conditions">Approve with Conditions</SelectItem>
                  <SelectItem value="Reject">Reject</SelectItem>
                  <SelectItem value="Recuse">Recuse</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                Rationale <span className="text-destructive">*</span>
              </label>
              <Textarea
                placeholder="State your rationale for this vote..."
                value={voteRationale}
                onChange={(e) => setVoteRationale(e.target.value)}
                rows={3}
                className="rounded-sm font-mono text-sm resize-none"
              />
            </div>
            {voteChoice === "Approve with Conditions" && (
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                  Conditions (one per line) — will seed CP register
                </label>
                <Textarea
                  placeholder={"e.g. Confirm earn-out structure\nResolve IP ownership transfer"}
                  value={voteConditions}
                  onChange={(e) => setVoteConditions(e.target.value)}
                  rows={4}
                  className="rounded-sm font-mono text-sm resize-none"
                />
              </div>
            )}
            <div className="text-[10px] font-mono text-muted-foreground/60 flex items-center gap-1">
              <Lock size={9} /> Votes are immutable once cast
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoteDialogOpen(false)} className="rounded-sm font-mono text-[10px] uppercase">Cancel</Button>
            <Button
              onClick={handleCastVote}
              disabled={
                !voteRationale.trim() ||
                castVote.isPending ||
                (voteChoice === "Approve with Conditions" &&
                  voteConditions.split("\n").map((s) => s.trim()).filter(Boolean).length === 0)
              }
              className={`rounded-sm font-mono text-[10px] uppercase ${
                voteChoice === "Approve" ? "bg-emerald-600 hover:bg-emerald-700" :
                voteChoice === "Reject" ? "bg-destructive hover:bg-destructive/90" : ""
              }`}
            >
              {castVote.isPending ? "Saving..." : "Cast Vote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Confirm */}
      <AlertDialog open={resolveConfirmOpen} onOpenChange={setResolveConfirmOpen}>
        <AlertDialogContent className="rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-sm uppercase tracking-wider">Resolve Proposal?</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-xs text-muted-foreground">
              This will compute the final outcome from all votes cast and lock the proposal. Outcome is immutable after resolving.
              {pendingCount > 0 && ` ${pendingCount} voter(s) haven't voted yet — only allowed if the voting deadline has passed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm font-mono text-[10px] uppercase">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResolve}
              className="rounded-sm font-mono text-[10px] uppercase"
            >
              Resolve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CP Edit Dialog */}
      <Dialog open={cpEditOpen} onOpenChange={(open) => { setCpEditOpen(open); if (!open) setCpEditId(null); }}>
        <DialogContent className="sm:max-w-sm rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm uppercase tracking-wider">Edit CP</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">Owner</label>
              <Input
                placeholder="Responsible owner name"
                value={cpEditOwner}
                onChange={(e) => setCpEditOwner(e.target.value)}
                className="rounded-sm font-mono text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">Target Date</label>
              <Input
                type="date"
                value={cpEditDate}
                onChange={(e) => setCpEditDate(e.target.value)}
                className="rounded-sm font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCpEditOpen(false)} className="rounded-sm font-mono text-[10px] uppercase">Cancel</Button>
            <Button
              onClick={handleSaveCpEdit}
              disabled={updateCp.isPending}
              className="rounded-sm font-mono text-[10px] uppercase"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// IcMemoCard — renders a cached or freshly generated IC memo
// ---------------------------------------------------------------------------
function IcMemoCard({ memo }: { memo: IcMemoResult }) {
  const { toast } = useToast();

  const buildMarkdown = useCallback(() => {
    const lines: string[] = [
      `# IC Memo Draft`,
      ``,
      `## Executive Summary`,
      memo.executiveSummary,
      ``,
      `## Investment Thesis`,
      ...memo.investmentThesis.map((t) => `- ${t}`),
      ``,
      `## Valuation Opinion`,
      memo.valuationOpinion,
      ``,
      `## Key Risks & Mitigants`,
      ...memo.keyRisksAndMitigants.map((r) => `- **Risk:** ${r.risk}  \n  **Mitigant:** ${r.mitigant}`),
    ];
    if (memo.icConditionsOutstanding.length > 0) {
      lines.push(``, `## IC Conditions Outstanding`);
      memo.icConditionsOutstanding.forEach((c) => lines.push(`- ${c}`));
    }
    if (memo.runAt) {
      lines.push(``, `---`, `*Generated ${new Date(memo.runAt).toLocaleString()}*`);
    }
    return lines.join("\n");
  }, [memo]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(buildMarkdown()).then(() => {
      toast({ title: "Copied as Markdown" });
    });
  };

  return (
    <div className="space-y-4 rounded-sm border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-primary" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-primary">IC Memo Draft</span>
          {memo.runAt && (
            <span className="text-[9px] font-mono text-muted-foreground/60">
              · Generated {new Date(memo.runAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 rounded-sm font-mono text-[10px] uppercase border-border gap-1"
          onClick={handleCopy}
        >
          <Copy size={10} /> Copy as Markdown
        </Button>
      </div>

      {/* Executive Summary */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-1.5">
          Executive Summary
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{memo.executiveSummary}</p>
      </div>

      {/* Investment Thesis */}
      {memo.investmentThesis.length > 0 && (
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-1.5">
            Investment Thesis
          </div>
          <ul className="space-y-1">
            {memo.investmentThesis.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground/85">
                <CheckCircle2 size={12} className="text-primary/60 mt-0.5 shrink-0" />
                <span className="leading-snug">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Valuation Opinion */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-1.5">
          Valuation Opinion
        </div>
        <p className="text-sm text-foreground/85 leading-relaxed">{memo.valuationOpinion}</p>
      </div>

      {/* Key Risks & Mitigants */}
      {memo.keyRisksAndMitigants.length > 0 && (
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-1.5">
            Key Risks & Mitigants
          </div>
          <div className="space-y-2">
            {memo.keyRisksAndMitigants.map((r, i) => (
              <div key={i} className="rounded-sm border border-destructive/15 bg-destructive/5 p-2.5 space-y-0.5">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle size={11} className="text-destructive/70 mt-0.5 shrink-0" />
                  <p className="text-[12px] text-foreground/90 font-medium leading-snug">{r.risk}</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug pl-5">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-500/80 mr-1">Mitigant:</span>
                  {r.mitigant}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* IC Conditions Outstanding */}
      {memo.icConditionsOutstanding.length > 0 && (
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-1.5">
            IC Conditions Outstanding
          </div>
          <ul className="space-y-1">
            {memo.icConditionsOutstanding.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-500/90">
                <Clock size={11} className="mt-0.5 shrink-0" />
                <span className="leading-snug">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {memo.icConditionsOutstanding.length === 0 && (
        <div className="text-[11px] font-mono text-emerald-500/80 flex items-center gap-1.5">
          <CheckCircle2 size={12} /> No outstanding IC conditions
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// IcTab — full IC tab
// ---------------------------------------------------------------------------
export function IcTab({ targetId }: IcTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canEditDeal: canEditDealForIcTab } = useAuth();

  // Proposals state
  const [proposalDialogOpen, setProposalDialogOpen] = useState(false);
  const [propSubmittedBy, setPropSubmittedBy] = useState("");
  const [propTerms, setPropTerms] = useState("");
  const [propRisks, setPropRisks] = useState("");
  const [propMemo, setPropMemo] = useState("");
  const [propDeadline, setPropDeadline] = useState("");

  // Sessions state
  const [icAddOpen, setIcAddOpen] = useState(false);
  const [icDeleteOpen, setIcDeleteOpen] = useState(false);
  const [icDeleteId, setIcDeleteId] = useState<number | null>(null);
  const [icDate, setIcDate] = useState("");
  const [icAttendees, setIcAttendees] = useState("");
  const [icOutcome, setIcOutcome] = useState<"Approved" | "Conditional" | "Rejected" | "Deferred">("Approved");
  const [icConditions, setIcConditions] = useState("");
  const [icNotes, setIcNotes] = useState("");

  // IC memo state
  const [memoExpanded, setMemoExpanded] = useState(true);

  const { data: proposals, isLoading: loadingProposals } = useListIcProposals(targetId, {
    query: { queryKey: getListIcProposalsQueryKey(targetId) },
  });

  const { data: icSessions, isLoading: loadingIcSessions } = useListIcSessions(targetId, {
    query: { queryKey: getListIcSessionsQueryKey(targetId) },
  });

  const { data: valuationsData } = useListValuations(targetId);
  const memoQueryKey = getGetIcMemoQueryKey(targetId);
  const { data: memoData, isLoading: loadingMemo } = useGetIcMemo(targetId, {
    query: { queryKey: memoQueryKey },
  });

  const runIcMemo = useRunIcMemo();

  const hasIcSessions = (icSessions?.length ?? 0) > 0;
  const hasValuations = (valuationsData?.length ?? 0) > 0;
  const canGenerateMemo = hasIcSessions && hasValuations;

  const handleGenerateMemo = () => {
    runIcMemo.mutate(
      { targetId },
      {
        onSuccess: (data) => {
          if (data.error && !data.result) {
            toast({ title: "Cannot generate memo", description: data.error, variant: "destructive" });
          } else {
            toast({ title: "IC memo drafted", description: "Review the AI-generated memo below." });
            void queryClient.invalidateQueries({ queryKey: memoQueryKey });
            setMemoExpanded(true);
          }
        },
        onError: () => toast({ title: "Error", description: "Could not generate IC memo", variant: "destructive" }),
      }
    );
  };

  const createProposal = useCreateIcProposal();
  const createIcSession = useCreateIcSession();
  const deleteIcSession = useDeleteIcSession();

  const invalidateProposals = () =>
    queryClient.invalidateQueries({ queryKey: getListIcProposalsQueryKey(targetId) });
  const invalidateIcSessions = () =>
    queryClient.invalidateQueries({ queryKey: getListIcSessionsQueryKey(targetId) });

  const resetProposalForm = () => {
    setPropSubmittedBy("");
    setPropTerms("");
    setPropRisks("");
    setPropMemo("");
    setPropDeadline("");
  };

  const handleCreateProposal = () => {
    createProposal.mutate(
      {
        id: targetId,
        data: {
          submittedBy: propSubmittedBy || null,
          recommendedTerms: propTerms || null,
          keyRisks: propRisks || null,
          memoNote: propMemo || null,
          votingDeadline: propDeadline || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "IC Proposal submitted" });
          setProposalDialogOpen(false);
          resetProposalForm();
          invalidateProposals();
        },
        onError: () => toast({ title: "Error", description: "Could not submit proposal", variant: "destructive" }),
      }
    );
  };

  const resetIcForm = () => {
    setIcDate("");
    setIcAttendees("");
    setIcOutcome("Approved");
    setIcConditions("");
    setIcNotes("");
  };

  const handleCreateIcSession = () => {
    if (!icDate || !icOutcome) return;
    createIcSession.mutate(
      {
        id: targetId,
        data: { sessionDate: icDate, attendees: icAttendees || null, outcome: icOutcome, conditions: icConditions || null, notes: icNotes || null },
      },
      {
        onSuccess: () => {
          toast({ title: "IC Session Recorded" });
          setIcAddOpen(false);
          resetIcForm();
          invalidateIcSessions();
        },
        onError: () => toast({ title: "Error", description: "Could not record IC session", variant: "destructive" }),
      }
    );
  };

  const handleDeleteIcSession = () => {
    if (!icDeleteId) return;
    deleteIcSession.mutate(
      { id: icDeleteId },
      {
        onSuccess: () => {
          toast({ title: "IC Session Deleted" });
          setIcDeleteOpen(false);
          setIcDeleteId(null);
          invalidateIcSessions();
        },
        onError: () => toast({ title: "Error", description: "Could not delete IC session", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-6">

      {/* ===== IC PROPOSALS SECTION ===== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
            <Gavel size={12} />
            IC Proposals
          </div>
          {canEditDealForIcTab && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-sm font-mono text-[10px] uppercase border-border h-7 gap-1"
              onClick={() => setProposalDialogOpen(true)}
            >
              <Plus size={11} /> Submit Proposal
            </Button>
          )}
        </div>

        {loadingProposals ? (
          <Skeleton className="h-24 w-full" />
        ) : !proposals?.length ? (
          <div className="border border-dashed border-border rounded-sm py-10 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest flex flex-col items-center gap-2">
            <Gavel size={18} className="text-muted-foreground/30" />
            No proposals submitted yet
          </div>
        ) : (
          <div className="space-y-3">
            {proposals.map((p) => (
              <ProposalCard key={p.id} proposal={p} targetId={targetId} />
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border/40 pt-2">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
            <Scale size={12} />
            IC Session Log
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-sm font-mono text-[10px] uppercase border-border h-7 gap-1"
            onClick={() => setIcAddOpen(true)}
          >
            <Plus size={11} /> Add Session
          </Button>
        </div>

        {loadingIcSessions ? (
          <Skeleton className="h-24 w-full" />
        ) : !icSessions?.length ? (
          <div className="border border-dashed border-border rounded-sm py-10 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest flex flex-col items-center gap-2">
            <Scale size={18} className="text-muted-foreground/30" />
            No IC sessions recorded
          </div>
        ) : (
          <div className="space-y-3">
            {icSessions.map((session) => {
              const style =
                session.outcome === "Approved"   ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/25" :
                session.outcome === "Conditional" ? "bg-amber-500/10 text-amber-500 border-amber-500/25" :
                session.outcome === "Rejected"   ? "bg-destructive/10 text-destructive border-destructive/25" :
                "bg-muted/50 text-muted-foreground border-border/60";
              return (
                <Card key={session.id} className="bg-card/30 border-border rounded-sm group">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`font-mono text-[10px] uppercase rounded-sm ${style}`}>
                          {session.outcome}
                        </Badge>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {session.sessionDate || "—"}
                        </span>
                        {session.attendees && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            · {session.attendees}
                          </span>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive/60 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={() => { setIcDeleteId(session.id); setIcDeleteOpen(true); }}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </CardHeader>
                  {(session.conditions || session.notes) && (
                    <CardContent className="px-4 pb-4 space-y-1.5">
                      {session.outcome === "Conditional" && session.conditions && (
                        <div className="text-sm text-amber-500/90 leading-relaxed">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mr-1">Conditions:</span>
                          {session.conditions}
                        </div>
                      )}
                      {session.notes && (
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{session.notes}</p>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== IC MEMO SECTION ===== */}
      <div className="border-t border-border/40 pt-2">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            className="flex items-center gap-1.5 text-left"
            onClick={() => setMemoExpanded(!memoExpanded)}
          >
            {memoExpanded ? (
              <ChevronDown size={13} className="text-muted-foreground" />
            ) : (
              <ChevronRight size={13} className="text-muted-foreground" />
            )}
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
              <Sparkles size={12} className="text-primary/70" />
              AI Memo Draft
            </div>
            {memoData?.result && (
              <span className="text-[9px] font-mono text-muted-foreground/50 ml-1">
                · Last generated {memoData.result.runAt ? new Date(memoData.result.runAt).toLocaleDateString() : ""}
              </span>
            )}
          </button>
          <div className="flex items-center gap-2">
            {!canGenerateMemo && (
              <span className="text-[10px] font-mono text-muted-foreground/50">
                {!hasIcSessions ? "Add an IC session first" : "Add a valuation entry first"}
              </span>
            )}
            <Button
              size="sm"
              variant={memoData?.result ? "outline" : "default"}
              className="rounded-sm font-mono text-[10px] uppercase h-7 gap-1"
              onClick={handleGenerateMemo}
              disabled={!canGenerateMemo || runIcMemo.isPending}
              title={
                !canGenerateMemo
                  ? !hasIcSessions
                    ? "Add at least one IC session to enable memo generation"
                    : "Add at least one valuation entry to enable memo generation"
                  : undefined
              }
            >
              {runIcMemo.isPending ? (
                <>
                  <RefreshCw size={10} className="animate-spin" /> Generating…
                </>
              ) : memoData?.result ? (
                <>
                  <RefreshCw size={10} /> Regenerate
                </>
              ) : (
                <>
                  <Sparkles size={10} /> Generate IC Memo
                </>
              )}
            </Button>
          </div>
        </div>

        {memoExpanded && (
          <>
            {loadingMemo ? (
              <Skeleton className="h-24 w-full" />
            ) : memoData?.result ? (
              <IcMemoCard memo={memoData.result} />
            ) : (
              <div className="border border-dashed border-border rounded-sm py-8 text-center text-muted-foreground font-mono text-[11px] tracking-widest flex flex-col items-center gap-2">
                <Sparkles size={18} className="text-muted-foreground/30" />
                <span className="uppercase">No memo generated yet</span>
                {canGenerateMemo && (
                  <span className="text-[10px] normal-case text-muted-foreground/60">
                    Click "Generate IC Memo" to draft a structured memo from deal data
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Submit Proposal Dialog */}
      <Dialog open={proposalDialogOpen} onOpenChange={setProposalDialogOpen}>
        <DialogContent className="sm:max-w-lg rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm uppercase tracking-wider">Submit IC Proposal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">Submitted By</label>
                <Input
                  placeholder="Deal lead name"
                  value={propSubmittedBy}
                  onChange={(e) => setPropSubmittedBy(e.target.value)}
                  className="rounded-sm font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">Voting Deadline</label>
                <Input
                  type="date"
                  value={propDeadline}
                  onChange={(e) => setPropDeadline(e.target.value)}
                  className="rounded-sm font-mono text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">Recommended Terms</label>
              <Textarea
                placeholder="Outline the deal structure, pricing, key terms..."
                value={propTerms}
                onChange={(e) => setPropTerms(e.target.value)}
                rows={3}
                className="rounded-sm font-mono text-sm resize-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">Key Risks</label>
              <Textarea
                placeholder="Summarize main risks for the committee..."
                value={propRisks}
                onChange={(e) => setPropRisks(e.target.value)}
                rows={3}
                className="rounded-sm font-mono text-sm resize-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">IC Memo Link / Note</label>
              <Input
                placeholder="URL or reference to the IC memo document"
                value={propMemo}
                onChange={(e) => setPropMemo(e.target.value)}
                className="rounded-sm font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setProposalDialogOpen(false); resetProposalForm(); }} className="rounded-sm font-mono text-[10px] uppercase">Cancel</Button>
            <Button
              onClick={handleCreateProposal}
              disabled={createProposal.isPending}
              className="rounded-sm font-mono text-[10px] uppercase"
            >
              {createProposal.isPending ? "Submitting..." : "Submit Proposal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add IC Session Dialog */}
      <Dialog open={icAddOpen} onOpenChange={setIcAddOpen}>
        <DialogContent className="sm:max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm uppercase tracking-wider">Log IC Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">Session Date <span className="text-destructive">*</span></label>
              <Input type="date" value={icDate} onChange={(e) => setIcDate(e.target.value)} className="rounded-sm font-mono text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">Outcome <span className="text-destructive">*</span></label>
              <Select value={icOutcome} onValueChange={(v) => setIcOutcome(v as typeof icOutcome)}>
                <SelectTrigger className="rounded-sm font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Conditional">Conditional</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                  <SelectItem value="Deferred">Deferred</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">Attendees</label>
              <Input placeholder="e.g. A. Smith, J. Doe" value={icAttendees} onChange={(e) => setIcAttendees(e.target.value)} className="rounded-sm font-mono text-sm" />
            </div>
            {icOutcome === "Conditional" && (
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">Conditions</label>
                <Textarea placeholder="List conditions..." value={icConditions} onChange={(e) => setIcConditions(e.target.value)} rows={3} className="rounded-sm font-mono text-sm resize-none" />
              </div>
            )}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">Notes</label>
              <Textarea placeholder="Session notes..." value={icNotes} onChange={(e) => setIcNotes(e.target.value)} rows={3} className="rounded-sm font-mono text-sm resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIcAddOpen(false); resetIcForm(); }} className="rounded-sm font-mono text-[10px] uppercase">Cancel</Button>
            <Button onClick={handleCreateIcSession} disabled={!icDate || !icOutcome || createIcSession.isPending} className="rounded-sm font-mono text-[10px] uppercase">
              Save Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete IC Session Confirm */}
      <AlertDialog open={icDeleteOpen} onOpenChange={setIcDeleteOpen}>
        <AlertDialogContent className="rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-sm uppercase tracking-wider">Delete IC Session?</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-xs text-muted-foreground">
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm font-mono text-[10px] uppercase">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteIcSession}
              className="rounded-sm font-mono text-[10px] uppercase bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
