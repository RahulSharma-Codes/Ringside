import { eq, and, isNotNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  interactionsTable,
  actionItemsTable,
  dealDocumentsTable,
  targetsTable,
  milestonesTable,
} from "@workspace/db";
import { getStagesForDealType } from "../constants";

export type GateStatus = "met" | "unmet" | "na";
export interface GateItem {
  label: string;
  status: GateStatus;
  detail?: string;
}
export type GateContext = {
  target: typeof targetsTable.$inferSelect;
  milestone: typeof milestonesTable.$inferSelect | null;
  interactions: (typeof interactionsTable.$inferSelect)[];
  diligenceItems: (typeof actionItemsTable.$inferSelect)[];
  documents: (typeof dealDocumentsTable.$inferSelect)[];
};
type GateCheckFn = (ctx: GateContext) => GateItem;

export const PIPELINE_STAGE_SEQUENCE = [
  "Sourcing",
  "Outreach",
  "Introductory Discussion",
  "NDA / CIM",
  "Preliminary Due Diligence",
  "Management Meeting",
  "Non-Binding Offer",
  "Confirmatory Due Diligence",
  "Binding Offer",
  "SPA Negotiation",
  "Integration Planning",
];

export const STAGE_GATE_REQUIREMENTS: Record<string, GateCheckFn[]> = {
  "NDA / CIM": [
    (ctx) => {
      const hasNda = ctx.documents.some(
        (d) =>
          d.documentType?.toLowerCase().includes("nda") ||
          d.title?.toLowerCase().includes("nda"),
      );
      return {
        label: "NDA initiated",
        status: hasNda ? "met" : "unmet",
        detail: hasNda
          ? "NDA document found in vault"
          : "No NDA document found — add to Document Vault",
      };
    },
  ],

  "Preliminary Due Diligence": [
    (ctx) => {
      const ndaExecuted = ctx.documents.some(
        (d) =>
          (d.documentType?.toLowerCase().includes("nda") ||
            d.title?.toLowerCase().includes("nda")) &&
          ["Received", "Executed", "Approved"].includes(d.status ?? ""),
      );
      return {
        label: "NDA executed",
        status: ndaExecuted ? "met" : "unmet",
        detail: ndaExecuted
          ? "NDA marked as Received/Executed"
          : "NDA not yet executed — update status in Document Vault",
      };
    },
    (ctx) => {
      const hasCim = ctx.documents.some(
        (d) =>
          d.documentType?.toLowerCase().includes("cim") ||
          d.title?.toLowerCase().includes("cim") ||
          d.title?.toLowerCase().includes("information memorandum"),
      );
      return {
        label: "CIM / Information Memorandum received",
        status: hasCim ? "met" : "unmet",
        detail: hasCim
          ? "CIM found in vault"
          : "No CIM/Information Memorandum logged",
      };
    },
  ],

  "Non-Binding Offer": [
    (ctx) => {
      const hasMgmtMeeting = ctx.interactions.some(
        (i) =>
          i.interactionType?.toLowerCase().includes("management") ||
          i.interactionType?.toLowerCase().includes("meeting") ||
          i.summary?.toLowerCase().includes("management meeting"),
      );
      return {
        label: "Management meeting logged",
        status: hasMgmtMeeting ? "met" : "unmet",
        detail: hasMgmtMeeting
          ? "Management meeting interaction found"
          : "No management meeting interaction logged",
      };
    },
  ],

  "Confirmatory Due Diligence": [
    (ctx) => {
      const hasNbo = ctx.documents.some(
        (d) =>
          d.documentType?.toLowerCase().includes("nbo") ||
          d.documentType?.toLowerCase().includes("non-binding") ||
          d.documentType?.toLowerCase().includes("letter of intent") ||
          d.documentType?.toLowerCase().includes("loi") ||
          d.title?.toLowerCase().includes("non-binding offer") ||
          d.title?.toLowerCase().includes("loi") ||
          d.title?.toLowerCase().includes("letter of intent"),
      );
      return {
        label: "Non-binding offer / LOI on file",
        status: hasNbo ? "met" : "unmet",
        detail: hasNbo
          ? "NBO/LOI document found"
          : "No Non-Binding Offer or LOI in Document Vault",
      };
    },
  ],

  "Binding Offer": [
    (ctx) => {
      const items = ctx.diligenceItems.filter(
        (i) => i.workstream?.toLowerCase() === "financial",
      );
      if (items.length === 0) {
        return {
          label: "Financial diligence workstream",
          status: "unmet",
          detail: "No financial diligence items found — add to Diligence Workspace",
        };
      }
      const completed = items.filter((i) => i.status === "Completed").length;
      const pct = Math.round((completed / items.length) * 100);
      return {
        label: "Financial diligence workstream",
        status: pct >= 50 ? "met" : "unmet",
        detail: `${completed}/${items.length} items complete (${pct}%)`,
      };
    },
    (ctx) => {
      const items = ctx.diligenceItems.filter(
        (i) => i.workstream?.toLowerCase() === "legal",
      );
      if (items.length === 0) {
        return {
          label: "Legal diligence workstream",
          status: "unmet",
          detail: "No legal diligence items found — add to Diligence Workspace",
        };
      }
      const completed = items.filter((i) => i.status === "Completed").length;
      const pct = Math.round((completed / items.length) * 100);
      return {
        label: "Legal diligence workstream",
        status: pct >= 50 ? "met" : "unmet",
        detail: `${completed}/${items.length} items complete (${pct}%)`,
      };
    },
  ],

  "SPA Negotiation": [
    (ctx) => {
      const coreWs = ["financial", "legal", "tax"];
      const items = ctx.diligenceItems.filter((i) =>
        coreWs.includes(i.workstream?.toLowerCase() ?? ""),
      );
      if (items.length === 0) {
        return {
          label: "Confirmatory due diligence complete",
          status: "unmet",
          detail: "No confirmatory DD items found (Financial/Legal/Tax)",
        };
      }
      const completed = items.filter((i) => i.status === "Completed").length;
      const pct = Math.round((completed / items.length) * 100);
      return {
        label: "Confirmatory due diligence complete",
        status: pct >= 80 ? "met" : "unmet",
        detail: `${completed}/${items.length} core DD items complete (${pct}% — need 80%)`,
      };
    },
    (ctx) => {
      const hasBindingOffer = ctx.documents.some(
        (d) =>
          d.documentType?.toLowerCase().includes("binding") ||
          d.title?.toLowerCase().includes("binding offer") ||
          d.title?.toLowerCase().includes("spa") ||
          d.title?.toLowerCase().includes("share purchase"),
      );
      return {
        label: "Binding offer / SPA draft on file",
        status: hasBindingOffer ? "met" : "unmet",
        detail: hasBindingOffer
          ? "Binding offer or SPA draft found"
          : "No binding offer or SPA draft in Document Vault",
      };
    },
  ],

  Closed: [
    (ctx) => {
      const hasBindingOffer = ctx.documents.some(
        (d) =>
          d.documentType?.toLowerCase().includes("binding") ||
          d.title?.toLowerCase().includes("binding offer"),
      );
      return {
        label: "Binding offer on file",
        status: hasBindingOffer ? "met" : "unmet",
        detail: hasBindingOffer
          ? "Binding offer found"
          : "No binding offer in Document Vault",
      };
    },
    (ctx) => {
      const hasSpa = ctx.documents.some(
        (d) =>
          d.title?.toLowerCase().includes("spa") ||
          d.title?.toLowerCase().includes("share purchase") ||
          d.documentType?.toLowerCase().includes("spa"),
      );
      return {
        label: "SPA / transaction agreement signed",
        status: hasSpa ? "met" : "unmet",
        detail: hasSpa
          ? "SPA document found"
          : "No SPA/transaction agreement in Document Vault",
      };
    },
  ],
};

export function nextPipelineStage(stage: string): string | null {
  const idx = PIPELINE_STAGE_SEQUENCE.indexOf(stage);
  if (idx === -1 || idx >= PIPELINE_STAGE_SEQUENCE.length - 1) return null;
  return PIPELINE_STAGE_SEQUENCE[idx + 1];
}

export function evaluateGates(stage: string, ctx: GateContext, dealType?: string | null): GateItem[] {
  const checks = STAGE_GATE_REQUIREMENTS[stage];
  if (!checks || checks.length === 0) return [];

  const applicableStages = getStagesForDealType(dealType);
  if (!applicableStages.includes(stage)) {
    return checks.map((fn) => {
      const item = fn(ctx);
      return {
        ...item,
        status: "na" as GateStatus,
        detail: `Not applicable for ${dealType ?? "this"} deal type`,
      };
    });
  }

  return checks.map((fn) => fn(ctx));
}

export async function fetchGateContext(
  targetId: number,
  target: typeof targetsTable.$inferSelect,
  milestone: typeof milestonesTable.$inferSelect | null,
): Promise<GateContext> {
  const [interactions, diligenceItems, documents] = await Promise.all([
    db.select().from(interactionsTable).where(eq(interactionsTable.targetId, targetId)),
    db
      .select()
      .from(actionItemsTable)
      .where(and(eq(actionItemsTable.targetId, targetId), isNotNull(actionItemsTable.workstream))),
    db.select().from(dealDocumentsTable).where(eq(dealDocumentsTable.targetId, targetId)),
  ]);
  return { target, milestone, interactions, diligenceItems, documents };
}
