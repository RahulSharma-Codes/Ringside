import { db } from "@workspace/db";
import {
  targetsTable,
  interactionsTable,
  actionItemsTable,
  stageChangeLogTable,
} from "@workspace/db";
import { logger } from "./lib/logger";

async function seed() {
  const existing = await db.select().from(targetsTable).limit(1);
  if (existing.length > 0) {
    logger.info("Database already seeded, skipping.");
    return;
  }

  logger.info("Seeding database...");

  const targets = await db
    .insert(targetsTable)
    .values([
      {
        targetCode: "TGT-001",
        projectName: "Project Apollo",
        legalName: "Apollo Technologies GmbH",
        sector: "Technology",
        subsector: "Enterprise Software",
        geographyRegion: "DACH",
        country: "Germany",
        dealOwner: "Sarah Chen",
        dealChampion: "Marcus Webb",
        executiveSponsor: "James Thornton",
        priorityTier: "Must-Win",
        strategicRationale: "Market-leading ERP platform with 300+ enterprise clients in DACH — plugs critical gap in our mid-market product suite and accelerates EU expansion by 3 years.",
        currentStage: "Confirmatory Due Diligence",
        strategicFitScore: 88,
        synergyScore: 75,
        financialAttractivenessScore: 70,
        processMaturityScore: 80,
        riskPenaltyScore: 8,
      },
      {
        targetCode: "TGT-002",
        projectName: "Project Titan",
        legalName: "Titan Analytics Corp",
        sector: "Technology",
        subsector: "Data & Analytics",
        geographyRegion: "North America",
        country: "USA",
        dealOwner: "Marcus Webb",
        dealChampion: "Lisa Park",
        executiveSponsor: "James Thornton",
        priorityTier: "Priority 1",
        strategicRationale: "AI-native analytics platform with proprietary ML pipeline — transformative to our data practice and brings 40+ data science PhDs.",
        currentStage: "Management Meeting",
        strategicFitScore: 82,
        synergyScore: 85,
        financialAttractivenessScore: 60,
        processMaturityScore: 55,
        riskPenaltyScore: 12,
      },
      {
        targetCode: "TGT-003",
        projectName: "Project Meridian",
        legalName: "Meridian Health Systems Ltd",
        sector: "Healthcare",
        subsector: "HealthTech",
        geographyRegion: "UK & Ireland",
        country: "UK",
        dealOwner: "Lisa Park",
        dealChampion: "David Okafor",
        executiveSponsor: "Rachel Kim",
        priorityTier: "Priority 1",
        strategicRationale: "NHS-approved patient data platform covering 60% of UK NHS trusts — instantly opens regulated healthcare vertical we have been targeting.",
        currentStage: "NDA / CIM",
        strategicFitScore: 78,
        synergyScore: 68,
        financialAttractivenessScore: 72,
        processMaturityScore: 45,
        riskPenaltyScore: 15,
      },
      {
        targetCode: "TGT-004",
        projectName: "Project Nexus",
        legalName: "Nexus Payments BV",
        sector: "Fintech",
        subsector: "Payments Infrastructure",
        geographyRegion: "Benelux",
        country: "Netherlands",
        dealOwner: "David Okafor",
        dealChampion: "Sarah Chen",
        executiveSponsor: "James Thornton",
        priorityTier: "Priority 2",
        strategicRationale: "Real-time payment rails with SEPA Instant coverage — complements our treasury product and reduces dependency on third-party payment processors.",
        currentStage: "Outreach",
        strategicFitScore: 65,
        synergyScore: 72,
        financialAttractivenessScore: 68,
        processMaturityScore: 30,
        riskPenaltyScore: 5,
      },
      {
        targetCode: "TGT-005",
        projectName: "Project Orion",
        legalName: "Orion Logistics Pty Ltd",
        sector: "Supply Chain",
        subsector: "Logistics SaaS",
        geographyRegion: "Asia Pacific",
        country: "Australia",
        dealOwner: "Marcus Webb",
        dealChampion: "Lisa Park",
        executiveSponsor: "Rachel Kim",
        priorityTier: "Watchlist",
        strategicRationale: "Port-to-shelf visibility platform with strong APAC carrier integrations — extends our supply chain offering into high-growth Pacific markets.",
        currentStage: "Sourcing",
        strategicFitScore: 55,
        synergyScore: 50,
        financialAttractivenessScore: 58,
        processMaturityScore: 20,
        riskPenaltyScore: 3,
      },
    ])
    .returning();

  // Seed stage change logs
  for (const target of targets) {
    await db.insert(stageChangeLogTable).values({
      targetId: target.id,
      previousStage: null,
      newStage: "Sourcing",
      changedBy: "System",
      changeReason: "Initial opportunity creation",
    });
    if (target.currentStage !== "Sourcing") {
      await db.insert(stageChangeLogTable).values({
        targetId: target.id,
        previousStage: "Sourcing",
        newStage: target.currentStage,
        changedBy: target.dealOwner ?? "System",
        changeReason: "Advanced through pipeline",
      });
    }
  }

  // Seed interactions
  await db.insert(interactionsTable).values([
    {
      targetId: targets[0].id,
      interactionType: "Management Meeting",
      summary: "Full day management presentation with CFO and CTO. Team demonstrated strong technology stack and product roadmap. Seller flagged preference for strategic buyer over PE. Key risk: legacy on-prem clients may require migration incentives.",
      sentiment: "Positive",
      participantsInternal: "Sarah Chen, Marcus Webb, James Thornton",
      participantsExternal: "Klaus Müller (CEO), Anke Bauer (CFO)",
      promoterWillingness: "High",
      valuationSignal: "Expecting 14-16x EBITDA",
      createdBy: "Sarah Chen",
    },
    {
      targetId: targets[0].id,
      interactionType: "Banker Update",
      summary: "Rothschild indicated 3 other bidders in process. Process letter expected by end of month. Seller timeline is firm — closing expected Q4.",
      sentiment: "Neutral",
      participantsInternal: "Sarah Chen",
      participantsExternal: "Antoine Lefebvre (Rothschild)",
      createdBy: "Sarah Chen",
    },
    {
      targetId: targets[1].id,
      interactionType: "Introductory Call",
      summary: "Strong first call with CEO. Team has been approached by 3 strategic buyers in last 6 months but not yet in a formal process. Founder-led, willing to consider earnout structure to bridge valuation gap.",
      sentiment: "Positive",
      participantsInternal: "Marcus Webb, Lisa Park",
      participantsExternal: "Dr. Priya Nair (CEO & Co-Founder)",
      promoterWillingness: "Medium",
      valuationSignal: "Ballpark $180-220M",
      createdBy: "Marcus Webb",
    },
    {
      targetId: targets[2].id,
      interactionType: "Internal Discussion",
      summary: "Investment committee pre-read completed. Legal flagged NHS data sovereignty requirements as significant compliance item — need external NHS specialist engaged before Preliminary DD.",
      sentiment: "Neutral",
      participantsInternal: "Lisa Park, David Okafor, Rachel Kim",
      createdBy: "Lisa Park",
    },
  ]);

  // Seed action items
  await db.insert(actionItemsTable).values([
    {
      targetId: targets[0].id,
      description: "Complete financial model with management case vs. base case scenarios",
      owner: "Sarah Chen",
      dueDate: "2026-05-15",
      priority: "Critical",
      status: "In Progress",
    },
    {
      targetId: targets[0].id,
      description: "Engage EY for legal and tax due diligence on German entity structure",
      owner: "Marcus Webb",
      dueDate: "2026-05-10",
      priority: "High",
      status: "Open",
    },
    {
      targetId: targets[0].id,
      description: "Prepare non-binding offer letter for IC review",
      owner: "Sarah Chen",
      dueDate: "2026-05-20",
      priority: "High",
      status: "Open",
    },
    {
      targetId: targets[1].id,
      description: "Schedule technical deep-dive with CTO on ML infrastructure architecture",
      owner: "Lisa Park",
      dueDate: "2026-05-12",
      priority: "High",
      status: "Open",
    },
    {
      targetId: targets[1].id,
      description: "Validate revenue quality — breakdown recurring vs. one-time professional services",
      owner: "Marcus Webb",
      dueDate: "2026-05-08",
      priority: "Critical",
      status: "Completed",
    },
    {
      targetId: targets[2].id,
      description: "Engage NHS regulatory specialist (Browne Jacobson) for data sovereignty advice",
      owner: "David Okafor",
      dueDate: "2026-05-06",
      priority: "Critical",
      status: "Open",
    },
    {
      targetId: targets[3].id,
      description: "Initial desk research: SEPA Instant market share, competitive positioning vs. Volt and TrueLayer",
      owner: "David Okafor",
      dueDate: "2026-05-20",
      priority: "Medium",
      status: "Open",
    },
  ]);

  logger.info("Seed complete.");
}

seed().catch((err) => {
  logger.error({ err }, "Seed failed");
  process.exit(1);
});
