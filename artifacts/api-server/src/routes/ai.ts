import { Router } from "express";
import OpenAI from "openai";
import { buildAiContext } from "../lib/ai-context";
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

// POST /api/ai/ask
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

export default router;
