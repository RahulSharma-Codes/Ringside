import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import { createHash } from "crypto";
import { db, getRequestCompanyId } from "@workspace/db";
import { auditEventsTable } from "@workspace/db";

const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

const router = Router();

// ── Hash-chain helpers ─────────────────────────────────────────────────────────

const CHAINED_EVENT_CLASSES = ["stage_", "ic_"];

function shouldChain(eventType: string): boolean {
  return CHAINED_EVENT_CLASSES.some((prefix) => eventType.startsWith(prefix));
}

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

async function getLastHash(targetId: number, eventType: string): Promise<string | null> {
  const prefix = CHAINED_EVENT_CLASSES.find((p) => eventType.startsWith(p));
  if (!prefix) return null;

  const rows = await db
    .select({ hashSelf: auditEventsTable.hashSelf })
    .from(auditEventsTable)
    .where(
      and(
        eq(auditEventsTable.targetId, targetId),
      )
    )
    .orderBy(desc(auditEventsTable.occurredAt))
    .limit(1);

  return rows[0]?.hashSelf ?? null;
}

// ── Exported writer utility (used by other routes) ────────────────────────────

export async function writeAuditEvent(
  eventType: string,
  targetId: number | null,
  actor: string | null | undefined,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    let hashPrev: string | null = null;
    let hashSelf: string | null = null;

    if (targetId && shouldChain(eventType)) {
      hashPrev = await getLastHash(targetId, eventType);
      const canonical = JSON.stringify({ eventType, targetId, actor, payload });
      hashSelf = sha256((hashPrev ?? "GENESIS") + canonical);
    }

    await db.insert(auditEventsTable).values({
      companyId: getRequestCompanyId() ?? DEFAULT_COMPANY_ID,
      eventType,
      targetId,
      userIdentifier: actor ?? null,
      payload,
      hashPrev,
      hashSelf,
    });
  } catch (err) {
    // Never let audit failures break the main operation
    console.error("[audit] write failed:", err);
  }
}

// ── GET /api/audit/target/:id ──────────────────────────────────────────────────

router.get("/target/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const events = await db
    .select()
    .from(auditEventsTable)
    .where(eq(auditEventsTable.targetId, id))
    .orderBy(desc(auditEventsTable.occurredAt))
    .limit(200);

  return res.json(events);
});

// ── GET /api/audit/verify/:id ─────────────────────────────────────────────────

router.get("/verify/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const events = await db
    .select()
    .from(auditEventsTable)
    .where(
      and(
        eq(auditEventsTable.targetId, id),
      )
    )
    .orderBy(auditEventsTable.occurredAt);

  // Only verify chained events
  const chained = events.filter((e) => shouldChain(e.eventType) && e.hashSelf);

  if (chained.length === 0) {
    return res.json({ valid: true, checkedCount: 0, firstBrokenAt: null });
  }

  let firstBrokenAt: string | null = null;
  let prevHash: string | null = null;

  for (const evt of chained) {
    const canonical = JSON.stringify({
      eventType: evt.eventType,
      targetId: evt.targetId,
      actor: evt.userIdentifier,
      payload: evt.payload,
    });
    const expectedHash = sha256((prevHash ?? "GENESIS") + canonical);

    if (evt.hashSelf !== expectedHash) {
      firstBrokenAt = evt.occurredAt.toISOString();
      break;
    }
    prevHash = evt.hashSelf;
  }

  return res.json({
    valid: firstBrokenAt === null,
    checkedCount: chained.length,
    firstBrokenAt,
  });
});

export default router;
