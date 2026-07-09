import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { icProposalsTable, icVotesTable, icCpsTable, milestonesTable } from "@workspace/db";
import { z } from "zod";
import { logger } from "../lib/logger";
import { writeAuditEvent } from "./audit";
import { canAccessTarget } from "../lib/target-access";

const router = Router();

const CreateIcProposalBodySchema = z.object({
  submittedBy: z.string().nullish(),
  recommendedTerms: z.string().nullish(),
  keyRisks: z.string().nullish(),
  memoNote: z.string().nullish(),
  votingDeadline: z.string().nullish(),
});

const AddIcVoterBodySchema = z.object({
  voterName: z.string().min(1),
});

const CastIcVoteBodySchema = z.object({
  vote: z.enum(["Approve", "Approve with Conditions", "Reject", "Recuse"]),
  rationale: z.string().min(1),
  conditions: z.array(z.string()).nullish(),
});

const UpdateIcCpBodySchema = z.object({
  ownerName: z.string().nullish(),
  targetDate: z.string().nullish(),
  status: z.enum(["Open", "Closed"]).optional(),
});

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toDateString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function formatProposal(p: typeof icProposalsTable.$inferSelect) {
  return {
    ...p,
    submittedAt: toIso(p.submittedAt),
    outcomeAt: toIso(p.outcomeAt),
    votingDeadline: toDateString(p.votingDeadline),
  };
}

function formatVote(v: typeof icVotesTable.$inferSelect) {
  return {
    ...v,
    castAt: toIso(v.castAt),
    conditions: (v.conditions as string[] | null) ?? null,
  };
}

function formatCp(cp: typeof icCpsTable.$inferSelect) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isSlipping =
    cp.status === "Open" &&
    !!cp.targetDate &&
    new Date(cp.targetDate) < today;
  return {
    ...cp,
    targetDate: toDateString(cp.targetDate),
    closedAt: toIso(cp.closedAt),
    isSlipping,
  };
}

function computeTally(votes: typeof icVotesTable.$inferSelect[]) {
  return {
    total: votes.length,
    voted: votes.filter((v) => v.castAt !== null).length,
    approve: votes.filter((v) => v.vote === "Approve").length,
    approveWithConditions: votes.filter((v) => v.vote === "Approve with Conditions").length,
    reject: votes.filter((v) => v.vote === "Reject").length,
    recuse: votes.filter((v) => v.vote === "Recuse").length,
  };
}

function computeOutcome(
  votes: typeof icVotesTable.$inferSelect[],
): "Approved" | "Approved with Conditions" | "Rejected" | null {
  const cast = votes.filter((v) => v.castAt !== null && v.vote !== null && v.vote !== "Recuse");
  if (cast.length === 0) return null;
  const rejectCount = cast.filter((v) => v.vote === "Reject").length;
  const conditionCount = cast.filter((v) => v.vote === "Approve with Conditions").length;
  const approveCount = cast.filter((v) => v.vote === "Approve").length;

  if (rejectCount > 0) return "Rejected";
  if (conditionCount > 0) return "Approved with Conditions";
  if (approveCount > 0) return "Approved";
  return null;
}

function getStageSuggestion(outcome: string | null): string | null {
  if (outcome === "Approved" || outcome === "Approved with Conditions") {
    return "Ready to move to Definitive Agreements (SPA Negotiation)";
  }
  if (outcome === "Rejected") {
    return "Consider flagging for Dropped — rejection reason should be recorded";
  }
  return null;
}

async function buildProposalDetail(proposalId: number) {
  const [proposal] = await db
    .select()
    .from(icProposalsTable)
    .where(eq(icProposalsTable.id, proposalId));
  if (!proposal) return null;

  const [votes, cps] = await Promise.all([
    db.select().from(icVotesTable).where(eq(icVotesTable.proposalId, proposalId)).orderBy(icVotesTable.id),
    db.select().from(icCpsTable).where(eq(icCpsTable.proposalId, proposalId)).orderBy(icCpsTable.id),
  ]);

  const tally = computeTally(votes);
  return {
    proposal: formatProposal(proposal),
    votes: votes.map(formatVote),
    cps: cps.map(formatCp),
    voteTally: tally,
    stageSuggestion: getStageSuggestion(proposal.outcome),
  };
}

// GET /api/targets/:id/ic-proposals
router.get("/targets/:id/ic-proposals", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  if (!(await canAccessTarget(req, targetId))) return res.status(404).json({ error: "Target not found" });

  const proposals = await db
    .select()
    .from(icProposalsTable)
    .where(eq(icProposalsTable.targetId, targetId))
    .orderBy(desc(icProposalsTable.submittedAt));

  return res.json(proposals.map(formatProposal));
});

// POST /api/targets/:id/ic-proposals
router.post("/targets/:id/ic-proposals", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  if (!(await canAccessTarget(req, targetId))) return res.status(404).json({ error: "Target not found" });

  const parsed = CreateIcProposalBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const body = parsed.data;
  const [created] = await db
    .insert(icProposalsTable)
    .values({
      targetId,
      submittedBy: body.submittedBy ?? null,
      recommendedTerms: body.recommendedTerms ?? null,
      keyRisks: body.keyRisks ?? null,
      memoNote: body.memoNote ?? null,
      votingDeadline: body.votingDeadline ?? null,
      status: "Voting Open",
    })
    .returning();

  await writeAuditEvent("ic_proposal_submitted", targetId, body.submittedBy ?? null, {
    proposalId: created!.id,
    votingDeadline: created!.votingDeadline,
  });

  return res.status(201).json(formatProposal(created!));
});

// GET /api/ic-proposals/:id
router.get("/ic-proposals/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const detail = await buildProposalDetail(id);
  if (!detail) return res.status(404).json({ error: "Not found" });
  if (!(await canAccessTarget(req, detail.proposal.targetId))) {
    return res.status(404).json({ error: "Not found" });
  }

  return res.json(detail);
});

// POST /api/ic-proposals/:id/voters  — add a voter
router.post("/ic-proposals/:id/voters", async (req, res) => {
  const proposalId = parseInt(req.params.id, 10);
  if (isNaN(proposalId)) return res.status(400).json({ error: "Invalid id" });

  const [proposal] = await db
    .select()
    .from(icProposalsTable)
    .where(eq(icProposalsTable.id, proposalId));
  if (!proposal) return res.status(404).json({ error: "Proposal not found" });
  if (!(await canAccessTarget(req, proposal.targetId))) {
    return res.status(404).json({ error: "Proposal not found" });
  }
  if (proposal.status === "Resolved") {
    return res.status(400).json({ error: "Cannot add voter to resolved proposal" });
  }

  const parsed = AddIcVoterBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [created] = await db
    .insert(icVotesTable)
    .values({ proposalId, voterName: parsed.data.voterName })
    .returning();

  return res.status(201).json(formatVote(created!));
});

// POST /api/ic-votes/:id/cast — cast a vote (immutable after casting)
router.post("/ic-votes/:id/cast", async (req, res) => {
  const voteId = parseInt(req.params.id, 10);
  if (isNaN(voteId)) return res.status(400).json({ error: "Invalid id" });

  const [voteRow] = await db
    .select()
    .from(icVotesTable)
    .where(eq(icVotesTable.id, voteId));
  if (!voteRow) return res.status(404).json({ error: "Vote not found" });
  if (voteRow.castAt !== null) {
    return res.status(400).json({ error: "Vote already cast — immutable" });
  }

  const [proposal] = await db
    .select()
    .from(icProposalsTable)
    .where(eq(icProposalsTable.id, voteRow.proposalId));
  if (!proposal || proposal.status === "Resolved") {
    return res.status(400).json({ error: "Proposal is already resolved" });
  }
  if (!(await canAccessTarget(req, proposal.targetId))) {
    return res.status(404).json({ error: "Vote not found" });
  }

  const parsed = CastIcVoteBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const body = parsed.data;

  // Enforce: "Approve with Conditions" requires at least one non-empty condition
  if (body.vote === "Approve with Conditions") {
    const nonEmpty = (body.conditions ?? []).filter((c) => c.trim());
    if (nonEmpty.length === 0) {
      return res.status(400).json({
        error: "Approve with Conditions requires at least one condition",
      });
    }
  }

  const now = new Date();
  const [updated] = await db
    .update(icVotesTable)
    .set({
      vote: body.vote,
      rationale: body.rationale,
      conditions: (body.conditions && body.conditions.length > 0) ? body.conditions : null,
      castAt: now,
    })
    .where(eq(icVotesTable.id, voteId))
    .returning();

  await writeAuditEvent("ic_vote_cast", proposal.targetId, voteRow.voterName, {
    proposalId: voteRow.proposalId,
    voteId: voteRow.id,
    vote: body.vote,
  });

  return res.json(formatVote(updated!));
});

// POST /api/ic-proposals/:id/resolve — compute and lock outcome
router.post("/ic-proposals/:id/resolve", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [proposal] = await db
    .select()
    .from(icProposalsTable)
    .where(eq(icProposalsTable.id, id));
  if (!proposal) return res.status(404).json({ error: "Not found" });
  if (!(await canAccessTarget(req, proposal.targetId))) {
    return res.status(404).json({ error: "Not found" });
  }
  if (proposal.status === "Resolved") {
    return res.status(400).json({ error: "Proposal already resolved" });
  }

  const votes = await db
    .select()
    .from(icVotesTable)
    .where(eq(icVotesTable.proposalId, id));

  // ── Resolution guardrails ─────────────────────────────────────────────────
  // Allow resolve only when:
  //   (a) all voters have acted (including recusals), OR
  //   (b) the voting deadline has passed (force-close with outstanding votes)
  const allPending = votes.filter((v) => v.castAt === null);
  const deadlinePassed =
    proposal.votingDeadline && new Date(proposal.votingDeadline) < new Date();

  const allNonRecusedVoted = votes.every(
    (v) => v.castAt !== null, // every voter (including recusals) has acted
  );

  if (!allNonRecusedVoted && !deadlinePassed) {
    const pendingNames = votes
      .filter((v) => v.castAt === null)
      .map((v) => v.voterName)
      .join(", ");
    return res.status(400).json({
      error: `Cannot resolve: ${allPending.length} voter(s) haven't voted yet (${pendingNames}). Resolve after all votes are cast or the voting deadline has passed.`,
    });
  }

  const outcome = computeOutcome(votes);
  if (!outcome) {
    return res.status(400).json({ error: "No qualifying votes cast — cannot determine outcome" });
  }

  const now = new Date();
  await db
    .update(icProposalsTable)
    .set({ status: "Resolved", outcome, outcomeAt: now })
    .where(eq(icProposalsTable.id, id));

  await writeAuditEvent("ic_decision_recorded", proposal.targetId, null, {
    proposalId: id,
    outcome,
    totalVotes: votes.length,
    votedCount: votes.filter((v) => v.castAt !== null).length,
  });

  // ── Auto-create CP items from Approve-with-Conditions votes ───────────────
  if (outcome === "Approved with Conditions") {
    const conditionVotes = votes.filter(
      (v) => v.vote === "Approve with Conditions" && v.conditions,
    );
    for (const cv of conditionVotes) {
      const conditions = (cv.conditions as string[] | null) ?? [];
      for (const cond of conditions) {
        if (cond.trim()) {
          await db.insert(icCpsTable).values({
            proposalId: id,
            description: cond.trim(),
            ownerName: cv.voterName,   // seed owner from the voter who raised the condition
            status: "Open",
          });
        }
      }
    }
  }

  // ── Auto-flag deal as Dropped when rejected ───────────────────────────────
  if (outcome === "Rejected") {
    // Update the most recent milestone for this target to currentStage = "Dropped"
    const [milestone] = await db
      .select()
      .from(milestonesTable)
      .where(eq(milestonesTable.targetId, proposal.targetId))
      .orderBy(desc(milestonesTable.id))
      .limit(1);
    if (milestone) {
      await db
        .update(milestonesTable)
        .set({ currentStage: "Dropped", stageEnteredAt: now, updatedAt: now })
        .where(eq(milestonesTable.id, milestone.id));
    }
  }

  const detail = await buildProposalDetail(id);
  return res.json(detail);
});

// GET /api/ic-proposals/:id/cps
router.get("/ic-proposals/:id/cps", async (req, res) => {
  const proposalId = parseInt(req.params.id, 10);
  if (isNaN(proposalId)) return res.status(400).json({ error: "Invalid id" });

  const [proposalForCps] = await db
    .select()
    .from(icProposalsTable)
    .where(eq(icProposalsTable.id, proposalId));
  if (!proposalForCps) return res.status(404).json({ error: "Proposal not found" });
  if (!(await canAccessTarget(req, proposalForCps.targetId))) {
    return res.status(404).json({ error: "Proposal not found" });
  }

  const cps = await db
    .select()
    .from(icCpsTable)
    .where(eq(icCpsTable.proposalId, proposalId))
    .orderBy(icCpsTable.id);

  return res.json(cps.map(formatCp));
});

// PUT /api/ic-cps/:cpId
router.put("/ic-cps/:cpId", async (req, res) => {
  const cpId = parseInt(req.params.cpId, 10);
  if (isNaN(cpId)) return res.status(400).json({ error: "Invalid id" });

  const [existing] = await db
    .select()
    .from(icCpsTable)
    .where(eq(icCpsTable.id, cpId));
  if (!existing) return res.status(404).json({ error: "CP not found" });

  const [cpProposal] = await db
    .select()
    .from(icProposalsTable)
    .where(eq(icProposalsTable.id, existing.proposalId));
  if (!cpProposal || !(await canAccessTarget(req, cpProposal.targetId))) {
    return res.status(404).json({ error: "CP not found" });
  }

  const parsed = UpdateIcCpBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const body = parsed.data;
  const updates: Partial<typeof icCpsTable.$inferInsert> = {};
  if (body.ownerName !== undefined) updates.ownerName = body.ownerName ?? null;
  if (body.targetDate !== undefined) updates.targetDate = body.targetDate ?? null;
  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "Closed" && !existing.closedAt) {
      updates.closedAt = new Date();
    } else if (body.status === "Open") {
      updates.closedAt = null;
    }
  }

  const [updated] = await db
    .update(icCpsTable)
    .set(updates)
    .where(eq(icCpsTable.id, cpId))
    .returning();

  if (body.status === "Closed" && existing.status !== "Closed") {
    const [proposal] = await db
      .select()
      .from(icProposalsTable)
      .where(eq(icProposalsTable.id, existing.proposalId));
    if (proposal) {
      await writeAuditEvent("ic_cp_satisfied", proposal.targetId, null, {
        cpId,
        description: existing.description,
        proposalId: existing.proposalId,
      });
    }
  }

  return res.json(formatCp(updated!));
});

export { router as icProposalsRouter };
export default router;
