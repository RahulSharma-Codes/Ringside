import { Router } from "express";
import OpenAI from "openai";
import { z } from "zod";
import { buildAiContext } from "../lib/ai-context";
import { db } from "@workspace/db";
import {
  targetsTable,
  milestonesTable,
  interactionsTable,
  actionItemsTable,
  stageChangeLogTable,
  dealDocumentsTable,
} from "@workspace/db";
import { eq, and, inArray, desc, isNull, isNotNull, lt, gte } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

const OPENAI_API_KEY = process.env["OPENAI_API_KEY"];
const model = process.env["OPENAI_MODEL"] ?? "gpt-4o";

let openai: OpenAI | null = null;
if (OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  logger.info({ model }, "AI Copilot initialised");
} else {
  logger.warn("OPENAI_API_KEY is not set — AI Copilot will return setupRequired");
}

// ── Error classifier ─────────────────────────────────────────────────────────

type AiStatusKind = "available" | "key_missing" | "key_invalid" | "billing";

function classifyAiError(err: unknown): {
  status: AiStatusKind;
  setupRequired: boolean;
  billingRequired: boolean;
  message: string;
} {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const httpStatus = typeof e["status"] === "number" ? e["status"] : null;
    const errObj = e["error"] as Record<string, unknown> | undefined;
    const code = errObj?.["code"] ?? e["code"];
    if (httpStatus === 401) {
      return { status: "key_invalid", setupRequired: true, billingRequired: false, message: "Invalid API key" };
    }
    if (httpStatus === 429 || code === "insufficient_quota") {
      return { status: "billing", setupRequired: false, billingRequired: true, message: "Billing or quota issue" };
    }
  }
  return {
    status: "key_invalid",
    setupRequired: true,
    billingRequired: false,
    message: err instanceof Error ? err.message : "Unknown AI error",
  };
}

// ── Status cache (process-lifetime — never re-probed until server restarts) ───

let statusCache: {
  status: AiStatusKind;
  available: boolean;
  setupRequired: boolean;
  billingRequired: boolean;
} | null = null;

// ── Existing chat copilot system prompt ───────────────────────────────────────

const SYSTEM_PROMPT = `You are an M&A pipeline analyst assistant for a corporate development team. You have access to structured pipeline data provided below.

Rules — follow strictly:
- Answer ONLY from the pipeline data provided. Do not invent targets, stages, actions, interactions, risks, or any other facts.
- If the data does not contain enough information to answer a question, say so clearly and briefly.
- Do not claim to have changed, updated, or created anything. You are strictly read-only.
- Do not provide legal, tax, valuation, or financial advice as fact. You may summarise what the data shows, but add a brief note that decisions should involve qualified advisors.
- Use concise executive language — bullet points where appropriate, no unnecessary padding.
- If asked about a target not in the data, say it is not found in the current dataset.`;

function buildContextBlock(context: Awaited<ReturnType<typeof buildAiContext>>): string {
  const lines: string[] = [];

  lines.push(`=== PIPELINE SNAPSHOT (generated ${context.generatedAt}) ===`);
  lines.push(
    `Summary: ${context.summary.totalTargets} targets total, ` +
    `${context.summary.activeTargets} active, ` +
    `${context.summary.openActions} open actions, ` +
    `${context.summary.overdueActions} overdue.`
  );

  lines.push("\n--- TARGETS ---");
  for (const t of context.targets) {
    lines.push(
      `[${t.code}] ${t.name} | Tier: ${t.tier} | Stage: ${t.stage} | Sector: ${t.sector ?? "N/A"} | Active: ${t.isActive}`
    );
  }

  lines.push("\n--- OPEN ACTIONS ---");
  if (context.openActions.length === 0) {
    lines.push("None.");
  } else {
    for (const a of context.openActions) {
      const overdue = a.isOverdue ? " [OVERDUE]" : "";
      lines.push(
        `${a.targetName} | ${a.description} | Owner: ${a.owner ?? "Unassigned"} | Due: ${a.dueDate ?? "N/A"} | Priority: ${a.priority} | Status: ${a.status}${overdue}`
      );
    }
  }

  lines.push("\n--- RECENT INTERACTIONS (last 30 days) ---");
  if (context.recentInteractions.length === 0) {
    lines.push("None in the past 30 days.");
  } else {
    for (const i of context.recentInteractions) {
      lines.push(
        `${i.targetName} | ${i.type} on ${i.date.slice(0, 10)} | Sentiment: ${i.sentiment ?? "N/A"} | ${i.summary}`
      );
    }
  }

  lines.push("\n--- RECENT STAGE CHANGES ---");
  if (context.recentStageChanges.length === 0) {
    lines.push("None.");
  } else {
    for (const s of context.recentStageChanges) {
      lines.push(
        `${s.targetName} | ${s.from ?? "—"} → ${s.to} | By: ${s.changedBy ?? "Unknown"} | At: ${s.changedAt.slice(0, 10)}`
      );
    }
  }

  return lines.join("\n");
}

// ── JSON Schema for strict structured outputs (meeting notes) ─────────────────

const MEETING_NOTES_JSON_SCHEMA = {
  type: "object",
  properties: {
    interaction: {
      type: "object",
      properties: {
        interactionType: { type: "string" },
        summary: { type: "string" },
        participantsInternal: { type: "string" },
        participantsExternal: { type: "string" },
        sentiment: { type: "string" },
        valuationSignal: { type: "string" },
      },
      required: ["interactionType", "summary", "participantsInternal", "participantsExternal", "sentiment", "valuationSignal"],
      additionalProperties: false,
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          owner: { type: "string" },
          dueDate: { type: ["string", "null"] },
          priority: { type: "string" },
        },
        required: ["description", "owner", "dueDate", "priority"],
        additionalProperties: false,
      },
    },
    stageChange: {
      type: "object",
      properties: {
        suggested: { type: "boolean" },
        newStage: { type: "string" },
        reason: { type: "string" },
        confidence: { type: "string" },
      },
      required: ["suggested", "newStage", "reason", "confidence"],
      additionalProperties: false,
    },
    risks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          severity: { type: "string" },
        },
        required: ["title", "detail", "severity"],
        additionalProperties: false,
      },
    },
    followUpQuestions: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["interaction", "actions", "stageChange", "risks", "followUpQuestions"],
  additionalProperties: false,
} as const;

// ── Zod schema for meeting notes suggestions ──────────────────────────────────

const SuggestionsSchema = z.object({
  interaction: z.object({
    interactionType: z.string().default(""),
    summary: z.string().default(""),
    participantsInternal: z.string().default(""),
    participantsExternal: z.string().default(""),
    sentiment: z.string().default(""),
    valuationSignal: z.string().default(""),
  }),
  actions: z.array(
    z.object({
      description: z.string(),
      owner: z.string().default(""),
      dueDate: z.string().nullable().default(null),
      priority: z.string().default("Medium"),
    })
  ).default([]),
  stageChange: z.object({
    suggested: z.boolean().default(false),
    newStage: z.string().default(""),
    reason: z.string().default(""),
    confidence: z.string().default(""),
  }),
  risks: z.array(
    z.object({
      title: z.string(),
      detail: z.string().default(""),
      severity: z.string().default("Medium"),
    })
  ).default([]),
  followUpQuestions: z.array(z.string()).default([]),
});

const MEETING_NOTES_SYSTEM_PROMPT = `You are an M&A deal-capture assistant. Parse raw meeting/call notes and extract structured information.

Return ONLY a valid JSON object matching this exact schema — no extra keys, no markdown, no explanations:
{
  "interaction": {
    "interactionType": "one of: Call | Meeting | Banker Update | Management Discussion | Internal Discussion | Email Summary | Mobile Note | Diligence Finding",
    "summary": "concise 1-3 sentence summary of the discussion",
    "participantsInternal": "comma-separated internal participants if mentioned, else empty string",
    "participantsExternal": "comma-separated external participants if mentioned, else empty string",
    "sentiment": "Positive | Neutral | Negative — only if clearly inferable from tone/content, else empty string",
    "valuationSignal": "any valuation figure, range, or expectation mentioned, else empty string"
  },
  "actions": [
    {
      "description": "clear, actionable task",
      "owner": "name if mentioned, else empty string",
      "dueDate": "YYYY-MM-DD if a specific date is mentioned, else null",
      "priority": "Critical | High | Medium | Low — infer from urgency if possible, else Medium"
    }
  ],
  "stageChange": {
    "suggested": true or false,
    "newStage": "valid pipeline stage name only if stage progression is clearly implied by the notes, else empty string",
    "reason": "brief reason if suggested, else empty string",
    "confidence": "High | Medium | Low"
  },
  "risks": [
    {
      "title": "short risk label",
      "detail": "brief explanation if mentioned",
      "severity": "High | Medium | Low"
    }
  ],
  "followUpQuestions": ["question 1", "question 2"]
}

STRICT RULES:
- Do NOT invent participants, owners, dates, valuations, or stages not clearly stated in the notes.
- Return empty string for text fields with no clear information.
- Return null for dueDate if no specific date is mentioned.
- Return empty arrays if no action items, risks, or follow-up questions are present.
- stageChange.suggested = true only when the notes clearly imply a pipeline stage move.
- Do not provide legal, tax, valuation, or financial advice as fact.`;

// ── Opportunity brief context builder ─────────────────────────────────────────

async function buildOpportunityBriefContext(targetId: number): Promise<string> {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [row] = await db
    .select({
      id: targetsTable.id,
      targetCode: targetsTable.targetCode,
      projectName: targetsTable.projectName,
      sector: targetsTable.sector,
      subsector: targetsTable.subsector,
      priorityTier: targetsTable.priorityTier,
      strategicRationale: targetsTable.strategicRationale,
      dealOwner: targetsTable.dealOwner,
      country: targetsTable.country,
      isActive: targetsTable.isActive,
      currentStage: milestonesTable.currentStage,
      stageEnteredAt: milestonesTable.stageEnteredAt,
    })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(eq(targetsTable.id, targetId));

  if (!row) return "Target not found.";

  const interactions = await db
    .select({
      interactionType: interactionsTable.interactionType,
      interactionDatetime: interactionsTable.interactionDatetime,
      summary: interactionsTable.summary,
      sentiment: interactionsTable.sentiment,
    })
    .from(interactionsTable)
    .where(eq(interactionsTable.targetId, targetId))
    .orderBy(desc(interactionsTable.interactionDatetime))
    .limit(5);

  const allActions = await db
    .select({
      status: actionItemsTable.status,
      dueDate: actionItemsTable.dueDate,
    })
    .from(actionItemsTable)
    .where(and(eq(actionItemsTable.targetId, targetId), isNull(actionItemsTable.workstream)));

  const openActions = allActions.filter((a) => a.status !== "Completed");
  const overdueActions = openActions.filter((a) => a.dueDate && String(a.dueDate) < todayStr);

  const stageHistory = await db
    .select({
      previousStage: stageChangeLogTable.previousStage,
      newStage: stageChangeLogTable.newStage,
      changedBy: stageChangeLogTable.changedBy,
      changedAt: stageChangeLogTable.changedAt,
    })
    .from(stageChangeLogTable)
    .where(eq(stageChangeLogTable.targetId, targetId))
    .orderBy(desc(stageChangeLogTable.changedAt))
    .limit(5);

  const diligenceItems = await db
    .select({ status: actionItemsTable.status })
    .from(actionItemsTable)
    .where(and(eq(actionItemsTable.targetId, targetId), isNotNull(actionItemsTable.workstream)));

  const diligenceTotal = diligenceItems.length;
  const diligenceDone = diligenceItems.filter((d) => d.status === "Completed").length;

  const documents = await db
    .select({ id: dealDocumentsTable.id })
    .from(dealDocumentsTable)
    .where(eq(dealDocumentsTable.targetId, targetId));

  const lines: string[] = [
    `=== OPPORTUNITY BRIEF CONTEXT ===`,
    `Project: ${row.projectName} (${row.targetCode ?? "N/A"})`,
    `Sector: ${row.sector ?? "N/A"}${row.subsector ? ` / ${row.subsector}` : ""}`,
    `Country: ${row.country ?? "N/A"}`,
    `Priority Tier: ${row.priorityTier}`,
    `Current Stage: ${row.currentStage ?? "Unknown"}`,
    `Active: ${row.isActive}`,
    `Deal Owner: ${row.dealOwner ?? "Unassigned"}`,
    `Strategic Rationale: ${row.strategicRationale ?? "Not recorded"}`,
    ``,
    `Open Actions: ${openActions.length} (${overdueActions.length} overdue)`,
    `Diligence: ${diligenceDone}/${diligenceTotal} items complete`,
    `Documents on file: ${documents.length}`,
    ``,
    `--- RECENT INTERACTIONS (last 5) ---`,
  ];

  if (interactions.length === 0) {
    lines.push("None recorded.");
  } else {
    for (const i of interactions) {
      const dt = i.interactionDatetime instanceof Date
        ? i.interactionDatetime.toISOString().slice(0, 10)
        : String(i.interactionDatetime ?? "").slice(0, 10);
      lines.push(
        `[${i.interactionType}] ${dt} | Sentiment: ${i.sentiment ?? "N/A"} | ${i.summary}`
      );
    }
  }

  lines.push(``, `--- STAGE HISTORY (last 5) ---`);
  if (stageHistory.length === 0) {
    lines.push("No stage changes recorded.");
  } else {
    for (const s of stageHistory) {
      const dt = s.changedAt instanceof Date ? s.changedAt.toISOString().slice(0, 10) : String(s.changedAt ?? "").slice(0, 10);
      lines.push(`${s.previousStage ?? "—"} → ${s.newStage} | By: ${s.changedBy ?? "Unknown"} | ${dt}`);
    }
  }

  return lines.join("\n");
}

const OPPORTUNITY_BRIEF_PROMPT = `You are an M&A analyst assistant. Write a concise, leadership-ready opportunity brief from the provided deal data.

Structure the brief with these sections (use markdown headings):
## Overview
## Current Status
## Recent Activity
## Actions & Risks
## Diligence & Documents
## Recommended Next Steps

Rules:
- Use only the data provided. Do not invent facts, targets, or financials.
- Write in executive language — concise bullets where appropriate.
- Flag overdue actions and diligence gaps clearly.
- Do not provide legal, tax, or financial advice as fact.
- Keep the brief under 400 words.`;

// ── Weekly brief system prompt ────────────────────────────────────────────────

const WEEKLY_BRIEF_PROMPT = `You are an M&A pipeline analyst. Write a concise executive weekly review brief from the provided pipeline snapshot.

Structure the brief with these sections (use markdown headings):
## Executive Summary
## Key Movements This Week
## Must-Win Opportunities
## Actions Requiring Attention
## Diligence & Document Gaps
## Recommended Discussion Points

Rules:
- Use only the data provided. Do not invent targets, numbers, or facts.
- Write in concise executive language — bullet points are preferred.
- Flag overdue actions and stalled deals explicitly.
- Do not provide legal, tax, or financial advice as fact.
- Keep the brief under 500 words.`;

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /api/ai/ask (existing)
router.post("/ask", async (req, res) => {
  if (!openai) {
    return res.json({ answer: null, setupRequired: true, error: "OPENAI_API_KEY is not configured" });
  }

  const body = req.body as {
    question?: unknown;
    history?: unknown;
  };

  if (typeof body.question !== "string" || !body.question.trim()) {
    return res.status(400).json({ error: "question is required and must be a non-empty string" });
  }

  const question = body.question.trim();
  const history: { role: "user" | "assistant"; content: string }[] = [];

  if (Array.isArray(body.history)) {
    for (const turn of body.history) {
      if (
        turn &&
        typeof turn === "object" &&
        (turn.role === "user" || turn.role === "assistant") &&
        typeof turn.content === "string"
      ) {
        history.push({ role: turn.role, content: turn.content });
      }
    }
  }

  try {
    const context = await buildAiContext();
    const contextBlock = buildContextBlock(context);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${contextBlock}` },
      ...history,
      { role: "user", content: question },
    ];

    const completion = await openai.chat.completions.create({
      model,
      max_completion_tokens: 1024,
      messages,
    });

    const answer = completion.choices[0]?.message?.content ?? "";
    req.log.info({ model, question: question.slice(0, 80) }, "AI Copilot answered");

    return res.json({ answer, model });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err }, "AI Copilot error");
    return res.json({ answer: null, setupRequired: false, error: message });
  }
});

// GET /api/ai/status
router.get("/status", async (req, res) => {
  if (!openai) {
    const result = { status: "key_missing" as AiStatusKind, available: false, setupRequired: true, billingRequired: false };
    return res.json({ ...result, model });
  }

  if (statusCache) {
    req.log.info("AI status returned from process-lifetime cache");
    return res.json({ ...statusCache, model });
  }

  try {
    await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: "ping" }],
      max_completion_tokens: 1,
    });
    statusCache = { status: "available", available: true, setupRequired: false, billingRequired: false };
    req.log.info("AI status probe: available");
    return res.json({ ...statusCache, model });
  } catch (err) {
    const { status, setupRequired, billingRequired } = classifyAiError(err);
    statusCache = { status, available: false, setupRequired, billingRequired };
    req.log.warn({ err }, "AI status probe failed");
    return res.json({ ...statusCache, model });
  }
});

// POST /api/ai/meeting-notes
router.post("/meeting-notes", async (req, res) => {
  if (!openai) {
    return res.json({ suggestions: null, setupRequired: true, billingRequired: false });
  }

  const body = req.body as {
    targetId?: unknown;
    noteType?: unknown;
    rawNotes?: unknown;
    date?: unknown;
    participants?: unknown;
  };

  if (!body.rawNotes || typeof body.rawNotes !== "string" || !body.rawNotes.trim()) {
    return res.status(400).json({ error: "rawNotes is required" });
  }
  if (!body.noteType || typeof body.noteType !== "string") {
    return res.status(400).json({ error: "noteType is required" });
  }

  const targetId = typeof body.targetId === "number" ? body.targetId : parseInt(String(body.targetId ?? ""), 10);

  let targetContext = "";
  if (!isNaN(targetId)) {
    try {
      const [tRow] = await db
        .select({
          projectName: targetsTable.projectName,
          currentStage: milestonesTable.currentStage,
        })
        .from(targetsTable)
        .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
        .where(eq(targetsTable.id, targetId));

      if (tRow) {
        targetContext = `\nTarget: ${tRow.projectName} | Current Stage: ${tRow.currentStage ?? "Unknown"}`;
      }

      const [recentInters, openActionRows] = await Promise.all([
        db
          .select({
            interactionType: interactionsTable.interactionType,
            summary: interactionsTable.summary,
            interactionDatetime: interactionsTable.interactionDatetime,
          })
          .from(interactionsTable)
          .where(eq(interactionsTable.targetId, targetId))
          .orderBy(desc(interactionsTable.interactionDatetime))
          .limit(3),
        db
          .select({ id: actionItemsTable.id })
          .from(actionItemsTable)
          .where(and(eq(actionItemsTable.targetId, targetId), isNull(actionItemsTable.completedAt))),
      ]);

      if (recentInters.length > 0) {
        targetContext += "\nRecent interactions: " +
          recentInters.map((i) => `${i.interactionType}: ${i.summary.slice(0, 80)}`).join("; ");
      }
      targetContext += `\nOpen actions: ${openActionRows.length}`;
    } catch {
      // context is optional — continue without it
    }
  }

  const noteDate = body.date ? `\nDate: ${body.date}` : "";
  const participants = body.participants ? `\nParticipants mentioned: ${body.participants}` : "";

  const userContent = `Note Type: ${body.noteType}${noteDate}${participants}${targetContext}\n\nRAW NOTES:\n${body.rawNotes}`;

  try {
    // Attempt strict structured outputs first; fall back to JSON-object mode
    let raw: string | null = null;
    try {
      const structured = await openai.chat.completions.create({
        model,
        max_completion_tokens: 2048,
        messages: [
          { role: "system", content: MEETING_NOTES_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "MeetingNotesSuggestions",
            schema: MEETING_NOTES_JSON_SCHEMA,
            strict: true,
          },
        },
      });
      raw = structured.choices[0]?.message?.content ?? null;
      req.log.info({ targetId }, "Meeting notes: strict structured output succeeded");
    } catch (structErr) {
      req.log.warn({ err: structErr }, "Meeting notes: strict structured output failed — falling back to json_object");
    }

    if (raw === null) {
      const fallback = await openai.chat.completions.create({
        model,
        max_completion_tokens: 2048,
        messages: [
          { role: "system", content: MEETING_NOTES_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      });
      raw = fallback.choices[0]?.message?.content ?? "{}";
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      req.log.error({ raw: raw.slice(0, 200) }, "Meeting notes JSON parse failed");
      return res.json({ suggestions: null, error: "Failed to parse AI response" });
    }

    const validated = SuggestionsSchema.safeParse(parsed);
    if (!validated.success) {
      req.log.error({ issues: validated.error.issues }, "Meeting notes Zod validation failed");
      return res.json({ suggestions: null, error: "Failed to parse AI response" });
    }

    req.log.info({ targetId, noteType: body.noteType }, "Meeting notes parsed");
    return res.json({ suggestions: validated.data, model });
  } catch (err) {
    const { setupRequired, billingRequired, message } = classifyAiError(err);
    req.log.error({ err }, "Meeting notes AI error");
    return res.json({ suggestions: null, setupRequired, billingRequired, error: message });
  }
});

// POST /api/ai/opportunity-brief
router.post("/opportunity-brief", async (req, res) => {
  if (!openai) {
    return res.json({ brief: null, setupRequired: true, billingRequired: false });
  }

  const body = req.body as { targetId?: unknown };
  const targetId = typeof body.targetId === "number" ? body.targetId : parseInt(String(body.targetId ?? ""), 10);

  if (isNaN(targetId)) {
    return res.status(400).json({ error: "targetId is required" });
  }

  try {
    const contextBlock = await buildOpportunityBriefContext(targetId);

    const completion = await openai.chat.completions.create({
      model,
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: OPPORTUNITY_BRIEF_PROMPT },
        { role: "user", content: contextBlock },
      ],
    });

    const brief = completion.choices[0]?.message?.content ?? "";
    req.log.info({ targetId }, "Opportunity brief generated");
    return res.json({ brief, model });
  } catch (err) {
    const { setupRequired, billingRequired, message } = classifyAiError(err);
    req.log.error({ err }, "Opportunity brief AI error");
    return res.json({ brief: null, setupRequired, billingRequired, error: message });
  }
});

// POST /api/ai/weekly-brief
router.post("/weekly-brief", async (req, res) => {
  if (!openai) {
    return res.json({ brief: null, setupRequired: true, billingRequired: false });
  }

  try {
    const context = await buildAiContext();
    const contextBlock = buildContextBlock(context);

    // ── Enrichment: stage distribution ────────────────────────────────────
    const stageCounts: Record<string, number> = {};
    for (const t of context.targets) {
      stageCounts[t.stage] = (stageCounts[t.stage] ?? 0) + 1;
    }
    const stageDistLines = Object.entries(stageCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([stage, count]) => `  ${stage}: ${count} target${count !== 1 ? "s" : ""}`);

    // ── Enrichment: targets with no interaction in last 60 days ────────────
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const recentTargetIds = new Set(
      (await db
        .select({ targetId: interactionsTable.targetId })
        .from(interactionsTable)
        .where(gte(interactionsTable.interactionDatetime, sixtyDaysAgo))
      ).map((r) => r.targetId)
    );
    const noInteractionTargets = context.targets
      .filter((t) => t.isActive && !recentTargetIds.has(t.id))
      .map((t) => `${t.name} (${t.stage})`);

    const enrichedBlock = [
      contextBlock,
      "",
      "--- STAGE DISTRIBUTION ---",
      ...(stageDistLines.length > 0 ? stageDistLines : ["No stage data."]),
      "",
      "--- TARGETS WITH NO INTERACTION IN LAST 60 DAYS ---",
      noInteractionTargets.length > 0
        ? noInteractionTargets.join("\n")
        : "All active targets have been contacted within 60 days.",
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model,
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: WEEKLY_BRIEF_PROMPT },
        { role: "user", content: enrichedBlock },
      ],
    });

    const brief = completion.choices[0]?.message?.content ?? "";
    req.log.info("Weekly brief generated");
    return res.json({ brief, model });
  } catch (err) {
    const { setupRequired, billingRequired, message } = classifyAiError(err);
    req.log.error({ err }, "Weekly brief AI error");
    return res.json({ brief: null, setupRequired, billingRequired, error: message });
  }
});

export default router;
