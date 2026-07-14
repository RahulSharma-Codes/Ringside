import { pgTable, serial, text, integer, boolean, timestamp, date, jsonb, bigint, doublePrecision, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Multi-tenancy foundation ─────────────────────────────────────────────────

export const companiesTable = pgTable("companies", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type Company = typeof companiesTable.$inferSelect;

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid("company_id").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  role: text("role").notNull().default("Member"),
  passwordHash: text("password_hash"),
  failedPasswordAttempts: integer("failed_password_attempts").notNull().default(0),
  passwordLockedUntil: timestamp("password_locked_until"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type User = typeof usersTable.$inferSelect;

export const otpAttemptsTable = pgTable("otp_attempts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type OtpAttempt = typeof otpAttemptsTable.$inferSelect;

export const sessionBlocklistTable = pgTable("session_blocklist", {
  id: serial("id").primaryKey(),
  jti: text("jti").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type SessionBlocklist = typeof sessionBlocklistTable.$inferSelect;

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
  strategicFitScore: integer("strategic_fit_score"),
  synergyScore: integer("synergy_score"),
  financialAttractivenessScore: integer("financial_attractiveness_score"),
  processMaturityScore: integer("process_maturity_score"),
  riskPenaltyScore: integer("risk_penalty_score"),
  dealType: text("deal_type"),
  closeReasonCode: text("close_reason_code"),
  phase1VerdictAccuracy: text("phase1_verdict_accuracy"),
  phase1VerdictNote: text("phase1_verdict_note"),
  closeMissTheme: text("close_miss_theme"),
  isActive: boolean("is_active").notNull().default(true),
  isConfidential: boolean("is_confidential").notNull().default(true),
  kanbanSortOrder: integer("kanban_sort_order").notNull().default(0),
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
  workstream: text("workstream"),
  notes: text("notes"),
  evidenceLinks: jsonb("evidence_links").$type<{ label: string; url: string }[]>(),
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

export const dealDocumentsTable = pgTable("deal_documents", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").notNull().references(() => targetsTable.id),
  title: text("title").notNull(),
  documentType: text("document_type").notNull().default("Other"),
  status: text("status").notNull().default("Requested"),
  classification: text("classification").notNull().default("Restricted"),
  owner: text("owner"),
  documentDate: date("document_date"),
  url: text("url"),
  workstream: text("workstream"),
  notes: text("notes"),
  storagePath: text("storage_path"),
  fileName: text("file_name"),
  fileSize: bigint("file_size", { mode: "number" }),
  mimeType: text("mime_type"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDealDocumentSchema = createInsertSchema(dealDocumentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDealDocument = z.infer<typeof insertDealDocumentSchema>;
export type DealDocument = typeof dealDocumentsTable.$inferSelect;

export const icSessionsTable = pgTable("ic_sessions", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").notNull().references(() => targetsTable.id),
  sessionDate: date("session_date").notNull(),
  attendees: text("attendees"),
  outcome: text("outcome").notNull(),
  conditions: text("conditions"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertIcSessionSchema = createInsertSchema(icSessionsTable).omit({ id: true, createdAt: true });
export type InsertIcSession = z.infer<typeof insertIcSessionSchema>;
export type IcSession = typeof icSessionsTable.$inferSelect;

export const valuationsTable = pgTable("valuations", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").notNull().references(() => targetsTable.id),
  version: integer("version").notNull().default(1),
  stageAtRecord: text("stage_at_record"),
  methodology: text("methodology").notNull(),
  valueLow: text("value_low"),
  valuePoint: text("value_point"),
  valueHigh: text("value_high"),
  currency: text("currency").notNull().default("USD"),
  notes: text("notes"),
  recordedBy: text("recorded_by"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export const insertValuationSchema = createInsertSchema(valuationsTable).omit({ id: true, recordedAt: true });
export type InsertValuation = z.infer<typeof insertValuationSchema>;
export type Valuation = typeof valuationsTable.$inferSelect;

export const dealEconomicsTable = pgTable("deal_economics", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").notNull().unique().references(() => targetsTable.id),
  cashPct: text("cash_pct"),
  equityPct: text("equity_pct"),
  earnoutPct: text("earnout_pct"),
  deferredPct: text("deferred_pct"),
  escrowPct: text("escrow_pct"),
  totalEv: text("total_ev"),
  totalEquityValue: text("total_equity_value"),
  irrBase: text("irr_base"),
  irrUpside: text("irr_upside"),
  irrDownside: text("irr_downside"),
  moicBase: text("moic_base"),
  moicUpside: text("moic_upside"),
  moicDownside: text("moic_downside"),
  paybackYears: text("payback_years"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDealEconomicsSchema = createInsertSchema(dealEconomicsTable).omit({ id: true, updatedAt: true });
export type InsertDealEconomics = z.infer<typeof insertDealEconomicsSchema>;
export type DealEconomics = typeof dealEconomicsTable.$inferSelect;

export const synergiesTable = pgTable("synergies", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").notNull().references(() => targetsTable.id),
  type: text("type").notNull(),
  description: text("description").notNull(),
  fy1: doublePrecision("fy1"),
  fy2: doublePrecision("fy2"),
  fy3: doublePrecision("fy3"),
  fy4: doublePrecision("fy4"),
  fy5: doublePrecision("fy5"),
  oneTimeCost: doublePrecision("one_time_cost"),
  confidence: text("confidence").notNull().default("Possible"),
  ownerName: text("owner_name"),
  realisationStartMonth: text("realisation_start_month"),
  realisationStatus: text("realisation_status").notNull().default("Not Started"),
  isDisynergy: boolean("is_disynergy").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSynergySchema = createInsertSchema(synergiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSynergy = z.infer<typeof insertSynergySchema>;
export type Synergy = typeof synergiesTable.$inferSelect;

export const aiPhaseRunsTable = pgTable("ai_phase_runs", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").notNull().references(() => targetsTable.id),
  phase: text("phase").notNull(),
  promptHash: text("prompt_hash"),
  outputJson: jsonb("output_json").notNull(),
  model: text("model"),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type AiPhaseRun = typeof aiPhaseRunsTable.$inferSelect;

export const dealSponsorsTable = pgTable("deal_sponsors", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").notNull().references(() => targetsTable.id),
  name: text("name").notNull(),
  roleTitle: text("role_title"),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type DealSponsor = typeof dealSponsorsTable.$inferSelect;

export const dealAdvisorsTable = pgTable("deal_advisors", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").notNull().references(() => targetsTable.id),
  side: text("side").notNull().default("buy-side"),
  advisorType: text("advisor_type").notNull(),
  firmName: text("firm_name").notNull(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  engagementDate: text("engagement_date"),
  feeStructure: text("fee_structure"),
  conflictsStatus: text("conflicts_status").notNull().default("Pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type DealAdvisor = typeof dealAdvisorsTable.$inferSelect;

export const advisorConflictNotesTable = pgTable("advisor_conflict_notes", {
  id: serial("id").primaryKey(),
  advisorId: integer("advisor_id").notNull().references(() => dealAdvisorsTable.id),
  note: text("note").notNull(),
  author: text("author").notNull(),
  statusAtTime: text("status_at_time").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type AdvisorConflictNote = typeof advisorConflictNotesTable.$inferSelect;

export const ndaRecordsTable = pgTable("nda_records", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").notNull().references(() => targetsTable.id),
  counterparty: text("counterparty"),
  effectiveDate: text("effective_date"),
  expiryDate: text("expiry_date"),
  scope: text("scope").notNull().default("Mutual"),
  termMonths: integer("term_months"),
  docReference: text("doc_reference"),
  status: text("status").notNull().default("Active"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type NdaRecord = typeof ndaRecordsTable.$inferSelect;

export const regulatoryClearancesTable = pgTable("regulatory_clearances", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").notNull().references(() => targetsTable.id),
  category: text("category").notNull(),
  description: text("description"),
  ownerName: text("owner_name"),
  status: text("status").notNull().default("Pending"),
  targetClearanceDate: text("target_clearance_date"),
  evidenceReference: text("evidence_reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type RegulatoryClearance = typeof regulatoryClearancesTable.$inferSelect;

export const auditEventsTable = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  companyId: uuid("company_id").notNull(),
  eventType: text("event_type").notNull(),
  targetId: integer("target_id"),
  userIdentifier: text("user_identifier"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  hashPrev: text("hash_prev"),
  hashSelf: text("hash_self"),
});
export type AuditEvent = typeof auditEventsTable.$inferSelect;

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").references(() => targetsTable.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  linkPath: text("link_path"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type Notification = typeof notificationsTable.$inferSelect;

export const icProposalsTable = pgTable("ic_proposals", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").notNull().references(() => targetsTable.id),
  submittedBy: text("submitted_by"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  recommendedTerms: text("recommended_terms"),
  keyRisks: text("key_risks"),
  memoNote: text("memo_note"),
  votingDeadline: date("voting_deadline"),
  status: text("status").notNull().default("Voting Open"),
  outcome: text("outcome"),
  outcomeAt: timestamp("outcome_at"),
});
export const insertIcProposalSchema = createInsertSchema(icProposalsTable).omit({ id: true, submittedAt: true });
export type InsertIcProposal = z.infer<typeof insertIcProposalSchema>;
export type IcProposal = typeof icProposalsTable.$inferSelect;

export const icVotesTable = pgTable("ic_votes", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull().references(() => icProposalsTable.id),
  voterName: text("voter_name").notNull(),
  vote: text("vote"),
  rationale: text("rationale"),
  conditions: jsonb("conditions").$type<string[]>(),
  castAt: timestamp("cast_at"),
});
export const insertIcVoteSchema = createInsertSchema(icVotesTable).omit({ id: true });
export type InsertIcVote = z.infer<typeof insertIcVoteSchema>;
export type IcVote = typeof icVotesTable.$inferSelect;

export const targetAccessTable = pgTable("target_access", {
  id: serial("id").primaryKey(),
  targetId: integer("target_id").notNull().references(() => targetsTable.id),
  userId: uuid("user_id").notNull().references(() => usersTable.id),
  grantedBy: uuid("granted_by"),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
});
export type TargetAccess = typeof targetAccessTable.$inferSelect;

export const icCpsTable = pgTable("ic_cps", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull().references(() => icProposalsTable.id),
  description: text("description").notNull(),
  ownerName: text("owner_name"),
  targetDate: date("target_date"),
  closedAt: timestamp("closed_at"),
  status: text("status").notNull().default("Open"),
});
export const insertIcCpSchema = createInsertSchema(icCpsTable).omit({ id: true });
export type InsertIcCp = z.infer<typeof insertIcCpSchema>;
export type IcCp = typeof icCpsTable.$inferSelect;
