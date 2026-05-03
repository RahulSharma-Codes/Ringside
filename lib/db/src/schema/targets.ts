import { pgTable, serial, text, integer, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const targetsTable = pgTable("targets", {
  id: serial("id").primaryKey(),
  targetCode: text("target_code").notNull().unique(),
  projectName: text("project_name").notNull(),
  legalName: text("legal_name"),
  businessUnit: text("business_unit"),
  sector: text("sector"),
  subsector: text("subsector"),
  geographyRegion: text("geography_region"),
  country: text("country"),
  sourcingChannel: text("sourcing_channel"),
  sourcingFirm: text("sourcing_firm"),
  dealOwner: text("deal_owner"),
  dealChampion: text("deal_champion"),
  executiveSponsor: text("executive_sponsor"),
  priorityTier: text("priority_tier").notNull().default("Watchlist"),
  strategicRationale: text("strategic_rationale"),
  strategicFitScore: integer("strategic_fit_score").notNull().default(50),
  synergyScore: integer("synergy_score").notNull().default(50),
  financialAttractivenessScore: integer("financial_attractiveness_score").notNull().default(50),
  processMaturityScore: integer("process_maturity_score").notNull().default(50),
  riskPenaltyScore: integer("risk_penalty_score").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  isConfidential: boolean("is_confidential").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTargetSchema = createInsertSchema(targetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTarget = z.infer<typeof insertTargetSchema>;
export type Target = typeof targetsTable.$inferSelect;

export const milestonesTable = pgTable("milestones", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").notNull().references(() => targetsTable.id),
  currentStage: text("current_stage").notNull().default("Sourcing"),
  stageEnteredAt: timestamp("stage_entered_at").notNull().defaultNow(),
  ndaStatus: text("nda_status").notNull().default("Not Sent"),
  ndaDate: date("nda_date"),
  cimReceivedDate: date("cim_received_date"),
  dataRoomAccess: text("data_room_access").notNull().default("No"),
  dataRoomAccessDate: date("data_room_access_date"),
  commercialDdStatus: text("commercial_dd_status").notNull().default("Not Started"),
  financialDdStatus: text("financial_dd_status").notNull().default("Not Started"),
  legalDdStatus: text("legal_dd_status").notNull().default("Not Started"),
  taxDdStatus: text("tax_dd_status").notNull().default("Not Started"),
  techDdStatus: text("tech_dd_status").notNull().default("Not Started"),
  nonBindingOfferDate: date("non_binding_offer_date"),
  bindingOfferDate: date("binding_offer_date"),
  signingDate: date("signing_date"),
  closingDate: date("closing_date"),
  dropReasonCategory: text("drop_reason_category"),
  dropReasonDetail: text("drop_reason_detail"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const interactionsTable = pgTable("interactions", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").notNull().references(() => targetsTable.id),
  interactionType: text("interaction_type").notNull(),
  interactionDatetime: timestamp("interaction_datetime").notNull().defaultNow(),
  participantsInternal: text("participants_internal"),
  participantsExternal: text("participants_external"),
  summary: text("summary").notNull(),
  sentiment: text("sentiment"),
  promoterWillingness: text("promoter_willingness"),
  valuationSignal: text("valuation_signal"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInteractionSchema = createInsertSchema(interactionsTable).omit({ id: true, createdAt: true });
export type InsertInteraction = z.infer<typeof insertInteractionSchema>;
export type Interaction = typeof interactionsTable.$inferSelect;

// The existing Supabase table created by the Python SQLAlchemy app is named "actions".
// Keep the TypeScript export name as actionItemsTable so the rest of the app does not need to change.
export const actionItemsTable = pgTable("actions", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").notNull().references(() => targetsTable.id),
  interactionId: integer("interaction_id"),
  description: text("description").notNull(),
  owner: text("owner"),
  dueDate: date("due_date"),
  priority: text("priority").notNull().default("Medium"),
  status: text("status").notNull().default("Open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertActionItemSchema = createInsertSchema(actionItemsTable).omit({ id: true, createdAt: true, completedAt: true });
export type InsertActionItem = z.infer<typeof insertActionItemSchema>;
export type ActionItem = typeof actionItemsTable.$inferSelect;

export const stageChangeLogTable = pgTable("stage_change_log", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").notNull().references(() => targetsTable.id),
  previousStage: text("previous_stage"),
  newStage: text("new_stage").notNull(),
  changedBy: text("changed_by"),
  changeReason: text("change_reason"),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
});

export const insertStageChangeLogSchema = createInsertSchema(stageChangeLogTable).omit({ id: true, changedAt: true });
export type InsertStageChangeLog = z.infer<typeof insertStageChangeLogSchema>;
export type StageChangeLog = typeof stageChangeLogTable.$inferSelect;
