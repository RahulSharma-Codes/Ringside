import React, { useEffect } from "react";
import { useParams } from "wouter";
import { useGetIcBrief, getGetIcBriefQueryKey } from "@workspace/api-client-react";
import { format, parseISO } from "date-fns";

type IcBriefData = {
  target: {
    id: number;
    targetCode: string;
    legalName: string;
    sector?: string | null;
    country?: string | null;
    priorityTier?: string | null;
    currentStage: string;
    priorityScore: number;
    healthScore: "healthy" | "watch" | "at_risk";
    daysInCurrentStage?: number | null;
    openActionCount: number;
    overdueActionCount: number;
    daysSinceLastInteraction?: number | null;
    strategicFitScore: number;
    synergyScore: number;
    financialAttractivenessScore: number;
    processMaturityScore: number;
    riskPenaltyScore: number;
    description?: string | null;
    ownerName?: string | null;
    createdAt?: string | null;
  };
  diligence: {
    total: number;
    completed: number;
    blocked: number;
    overdue: number;
    pct: number;
    missingWorkstreams: string[];
  };
  icSessions: Array<{
    id: number;
    sessionDate?: string | null;
    attendees?: string | null;
    outcome: string;
    conditions?: string | null;
    notes?: string | null;
    createdAt?: string | null;
  }>;
  recentInteractions: Array<{
    id: number;
    interactionType: string;
    summary?: string | null;
    interactionDatetime?: string | null;
    attendees?: string | null;
  }>;
  openActions: Array<{
    id: number;
    description: string;
    status: string;
    priority: string;
    dueDate?: string | null;
    owner?: string | null;
  }>;
  advisors: Array<{
    id: number;
    side: string;
    advisorType: string;
    firmName: string;
    contactName?: string | null;
    conflictsStatus?: string | null;
  }>;
  valuations: Array<{
    id: number;
    methodology: string;
    valueLow?: string | null;
    valuePoint?: string | null;
    valueHigh?: string | null;
    currency: string;
    stageAtRecord?: string | null;
    recordedAt?: string | null;
    notes?: string | null;
  }>;
  economics?: {
    totalEv?: string | null;
    totalEquityValue?: string | null;
    cashPct?: string | null;
    equityPct?: string | null;
    earnoutPct?: string | null;
    irrBase?: string | null;
    irrUpside?: string | null;
    irrDownside?: string | null;
    moicBase?: string | null;
    moicBase2?: string | null;
    paybackYears?: string | null;
  } | null;
  synergies: Array<{
    id: number;
    type: string;
    description: string;
    confidence: string;
    fy1?: number | null;
    fy2?: number | null;
    fy3?: number | null;
    isDisynergy?: boolean | null;
  }>;
  generatedAt: string;
};

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  try { return format(parseISO(s), "d MMM yyyy"); }
  catch { return s; }
}

function fmtDatetime(s?: string | null): string {
  if (!s) return "—";
  try { return format(parseISO(s), "d MMM yyyy, HH:mm"); }
  catch { return s; }
}

function healthLabel(h: string): string {
  if (h === "healthy") return "Healthy";
  if (h === "watch") return "Watch";
  return "At Risk";
}

function healthColor(h: string): string {
  if (h === "healthy") return "#16a34a";
  if (h === "watch") return "#d97706";
  return "#dc2626";
}

function outcomeColor(o: string): string {
  if (o === "Approved") return "#16a34a";
  if (o === "Rejected") return "#dc2626";
  if (o === "Conditional") return "#d97706";
  return "#6b7280";
}

function scoreBar(score: number, max = 10): React.ReactNode {
  const pct = Math.min(100, Math.round((score / max) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: "#e5e7eb", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "#2563eb", borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: "#6b7280", minWidth: 24 }}>{score}</span>
    </div>
  );
}

function ValuationRange(v: IcBriefData["valuations"][number]): string {
  if (v.valuePoint) {
    const low = v.valueLow ? `${v.valueLow} – ` : "";
    const high = v.valueHigh ? ` – ${v.valueHigh}` : "";
    return `${low}${v.valuePoint}${high} ${v.currency}`;
  }
  if (v.valueLow || v.valueHigh) return `${v.valueLow ?? "?"} – ${v.valueHigh ?? "?"} ${v.currency}`;
  return "—";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28, pageBreakInside: "avoid" }}>
      <div style={{
        borderBottom: "2px solid #1e3a5f",
        marginBottom: 10,
        paddingBottom: 4,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#1e3a5f" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr>
      <td style={{ width: 160, color: "#6b7280", fontSize: 11, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em", paddingBottom: 4, paddingRight: 12, verticalAlign: "top" }}>
        {label}
      </td>
      <td style={{ fontSize: 12, color: "#111827", paddingBottom: 4, verticalAlign: "top" }}>
        {value ?? "—"}
      </td>
    </tr>
  );
}

function IcBriefContent({ data }: { data: IcBriefData }) {
  const { target, diligence, icSessions, recentInteractions, openActions, advisors, valuations, economics, synergies, generatedAt } = data;

  const buyAdvisors = advisors.filter(a => a.side === "buy-side");
  const sellAdvisors = advisors.filter(a => a.side === "sell-side");
  const latestValuation = valuations[0] ?? null;
  const totalSynergy = synergies
    .filter(s => !s.isDisynergy)
    .reduce((sum, s) => sum + (s.fy1 ?? 0) + (s.fy2 ?? 0) + (s.fy3 ?? 0), 0);

  return (
    <div style={{
      fontFamily: "Georgia, 'Times New Roman', serif",
      color: "#111827",
      background: "#ffffff",
      maxWidth: 800,
      margin: "0 auto",
      padding: "40px 48px",
      fontSize: 12,
      lineHeight: 1.6,
    }}>
      {/* Header */}
      <div style={{ marginBottom: 32, borderBottom: "3px solid #1e3a5f", paddingBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.15em", color: "#6b7280", marginBottom: 4 }}>
              Investment Committee — Confidential
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#111827", letterSpacing: "-0.01em" }}>
              {target.legalName}
            </h1>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4, fontFamily: "monospace" }}>
              {target.targetCode}
              {target.sector ? ` · ${target.sector}` : ""}
              {target.country ? ` · ${target.country}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              display: "inline-block",
              padding: "4px 10px",
              borderRadius: 4,
              background: "#1e3a5f",
              color: "#ffffff",
              fontSize: 10,
              fontFamily: "monospace",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontWeight: 700,
              marginBottom: 6,
            }}>
              {target.currentStage}
            </div>
            <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>
              Generated {fmtDate(generatedAt)}
            </div>
          </div>
        </div>
      </div>

      {/* Deal Snapshot */}
      <Section title="Deal Snapshot">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          {[
            { label: "Priority Tier", value: target.priorityTier ?? "—" },
            {
              label: "Health",
              value: <span style={{ color: healthColor(target.healthScore), fontWeight: 600 }}>{healthLabel(target.healthScore)}</span>,
            },
            {
              label: "Priority Score",
              value: <span style={{ fontWeight: 700, fontSize: 16 }}>{target.priorityScore}<span style={{ fontSize: 11, color: "#9ca3af" }}>/100</span></span>,
            },
            {
              label: "Days in Stage",
              value: target.daysInCurrentStage != null ? `${target.daysInCurrentStage}d` : "—",
            },
            {
              label: "Open Actions",
              value: (
                <span>
                  {target.openActionCount}
                  {target.overdueActionCount > 0 && (
                    <span style={{ color: "#dc2626", marginLeft: 6, fontSize: 11 }}>({target.overdueActionCount} overdue)</span>
                  )}
                </span>
              ),
            },
            {
              label: "Last Interaction",
              value: target.daysSinceLastInteraction != null ? `${target.daysSinceLastInteraction}d ago` : "—",
            },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{value}</div>
            </div>
          ))}
        </div>
        {target.description && (
          <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.7, margin: 0, fontStyle: "italic" }}>{target.description}</p>
        )}
      </Section>

      {/* Scoring */}
      <Section title="Scoring Breakdown">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {[
              { label: "Strategic Fit", score: target.strategicFitScore },
              { label: "Synergy Potential", score: target.synergyScore },
              { label: "Financial Attractiveness", score: target.financialAttractivenessScore },
              { label: "Process Maturity", score: target.processMaturityScore },
            ].map(({ label, score }) => (
              <tr key={label}>
                <td style={{ width: 200, fontSize: 11, color: "#374151", paddingBottom: 6, paddingRight: 12 }}>{label}</td>
                <td style={{ paddingBottom: 6 }}>{scoreBar(score)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ fontSize: 11, color: "#dc2626", paddingTop: 4 }}>Risk Penalty</td>
              <td style={{ paddingTop: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, height: 6, background: "#fef2f2", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, (target.riskPenaltyScore / 30) * 100)}%`, height: "100%", background: "#dc2626", borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, color: "#dc2626", minWidth: 24 }}>{target.riskPenaltyScore}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* Valuation */}
      {(valuations.length > 0 || economics) && (
        <Section title="Valuation & Economics">
          {latestValuation && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#9ca3af", marginBottom: 6 }}>Latest Valuation</div>
              <table style={{ borderCollapse: "collapse" }}>
                <tbody>
                  <KVRow label="Methodology" value={latestValuation.methodology} />
                  <KVRow label="Value Range" value={ValuationRange(latestValuation)} />
                  {latestValuation.stageAtRecord && <KVRow label="Stage at Record" value={latestValuation.stageAtRecord} />}
                  {latestValuation.recordedAt && <KVRow label="Recorded" value={fmtDate(latestValuation.recordedAt)} />}
                  {latestValuation.notes && <KVRow label="Notes" value={latestValuation.notes} />}
                </tbody>
              </table>
            </div>
          )}
          {valuations.length > 1 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#9ca3af", marginBottom: 6 }}>All Entries ({valuations.length})</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    {["Methodology", "Value", "Currency", "Stage", "Date"].map(h => (
                      <th key={h} style={{ textAlign: "left", paddingBottom: 4, paddingRight: 12, fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#9ca3af", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {valuations.map(v => (
                    <tr key={v.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "4px 12px 4px 0" }}>{v.methodology}</td>
                      <td style={{ padding: "4px 12px 4px 0", fontFamily: "monospace" }}>{ValuationRange(v)}</td>
                      <td style={{ padding: "4px 12px 4px 0" }}>{v.currency}</td>
                      <td style={{ padding: "4px 12px 4px 0" }}>{v.stageAtRecord ?? "—"}</td>
                      <td style={{ padding: "4px 12px 4px 0" }}>{fmtDate(v.recordedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {economics && (
            <div>
              <div style={{ fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#9ca3af", marginBottom: 6 }}>Deal Economics</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "Total EV", value: economics.totalEv },
                  { label: "Total Equity Value", value: economics.totalEquityValue },
                  { label: "IRR Base / Up / Down", value: economics.irrBase ? `${economics.irrBase} / ${economics.irrUpside ?? "—"} / ${economics.irrDownside ?? "—"}` : null },
                  { label: "MOIC Base", value: economics.moicBase },
                  { label: "Payback Years", value: economics.paybackYears ? `${economics.paybackYears}yr` : null },
                  {
                    label: "Consideration Mix",
                    value: [
                      economics.cashPct ? `${economics.cashPct}% cash` : null,
                      economics.equityPct ? `${economics.equityPct}% equity` : null,
                      economics.earnoutPct ? `${economics.earnoutPct}% earn-out` : null,
                    ].filter(Boolean).join(", ") || null,
                  },
                ].filter(({ value }) => value).map(({ label, value }) => (
                  <div key={label} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4, padding: "6px 10px" }}>
                    <div style={{ fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#9ca3af" }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Synergies */}
      {synergies.length > 0 && (
        <Section title={`Synergy Case (${synergies.filter(s => !s.isDisynergy).length} items)`}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {["Type", "Description", "Confidence", "FY1", "FY2", "FY3"].map(h => (
                  <th key={h} style={{ textAlign: "left", paddingBottom: 4, paddingRight: 8, fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#9ca3af", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {synergies.map(s => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "4px 8px 4px 0" }}>
                    <span style={{ display: "inline-block", fontSize: 9, padding: "1px 5px", borderRadius: 3, background: s.isDisynergy ? "#fef2f2" : "#eff6ff", color: s.isDisynergy ? "#dc2626" : "#2563eb", fontFamily: "monospace", textTransform: "uppercase" }}>
                      {s.isDisynergy ? "DIS" : s.type}
                    </span>
                  </td>
                  <td style={{ padding: "4px 8px 4px 0" }}>{s.description}</td>
                  <td style={{ padding: "4px 8px 4px 0", fontSize: 10, color: "#6b7280" }}>{s.confidence}</td>
                  <td style={{ padding: "4px 8px 4px 0", fontFamily: "monospace", fontSize: 11 }}>{s.fy1 != null ? s.fy1 : "—"}</td>
                  <td style={{ padding: "4px 8px 4px 0", fontFamily: "monospace", fontSize: 11 }}>{s.fy2 != null ? s.fy2 : "—"}</td>
                  <td style={{ padding: "4px 8px 4px 0", fontFamily: "monospace", fontSize: 11 }}>{s.fy3 != null ? s.fy3 : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalSynergy > 0 && (
            <div style={{ marginTop: 8, textAlign: "right", fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
              3yr run-rate total: <strong style={{ color: "#111827" }}>{totalSynergy.toLocaleString()}</strong>
            </div>
          )}
        </Section>
      )}

      {/* Diligence */}
      <Section title={`Diligence Readiness — ${diligence.pct}%`}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
            <div style={{
              width: `${diligence.pct}%`,
              height: "100%",
              borderRadius: 4,
              background: diligence.pct === 100 ? "#16a34a" : diligence.pct >= 60 ? "#2563eb" : diligence.pct >= 30 ? "#d97706" : "#dc2626",
            }} />
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
            <span>{diligence.completed} of {diligence.total} items complete</span>
            {diligence.blocked > 0 && <span style={{ color: "#dc2626" }}>{diligence.blocked} blocked</span>}
            {diligence.overdue > 0 && <span style={{ color: "#d97706" }}>{diligence.overdue} overdue</span>}
          </div>
        </div>
        {diligence.missingWorkstreams.length > 0 && diligence.missingWorkstreams.length < 10 && (
          <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>
            No items yet: {diligence.missingWorkstreams.join(", ")}
          </div>
        )}
      </Section>

      {/* IC Sessions */}
      <Section title={`IC History (${icSessions.length} session${icSessions.length !== 1 ? "s" : ""})`}>
        {icSessions.length === 0 ? (
          <div style={{ color: "#9ca3af", fontStyle: "italic", fontSize: 11 }}>No IC sessions recorded</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {icSessions.map(s => (
              <div key={s.id} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 14px", background: "#fafafa" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: outcomeColor(s.outcome) }}>{s.outcome}</span>
                  <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{fmtDate(s.sessionDate)}</span>
                </div>
                {s.attendees && <div style={{ fontSize: 11, color: "#6b7280" }}>Attendees: {s.attendees}</div>}
                {s.conditions && <div style={{ fontSize: 11, color: "#374151", marginTop: 2 }}><strong>Conditions:</strong> {s.conditions}</div>}
                {s.notes && <div style={{ fontSize: 11, color: "#374151", marginTop: 2, fontStyle: "italic" }}>{s.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Advisors */}
      {advisors.length > 0 && (
        <Section title={`Advisors (${advisors.length})`}>
          {buyAdvisors.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#2563eb", marginBottom: 6 }}>Buy-side</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    {["Type", "Firm", "Contact", "Conflicts"].map(h => (
                      <th key={h} style={{ textAlign: "left", paddingBottom: 4, paddingRight: 10, fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#9ca3af" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buyAdvisors.map(a => (
                    <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "4px 10px 4px 0" }}>{a.advisorType}</td>
                      <td style={{ padding: "4px 10px 4px 0", fontWeight: 600 }}>{a.firmName}</td>
                      <td style={{ padding: "4px 10px 4px 0", color: "#6b7280" }}>{a.contactName ?? "—"}</td>
                      <td style={{ padding: "4px 10px 4px 0", color: a.conflictsStatus === "Flagged" ? "#dc2626" : a.conflictsStatus === "Cleared" ? "#16a34a" : "#6b7280" }}>
                        {a.conflictsStatus ?? "Pending"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sellAdvisors.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#d97706", marginBottom: 6 }}>Sell-side (Counterparty)</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    {["Type", "Firm", "Contact", "Conflicts"].map(h => (
                      <th key={h} style={{ textAlign: "left", paddingBottom: 4, paddingRight: 10, fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#9ca3af" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sellAdvisors.map(a => (
                    <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "4px 10px 4px 0" }}>{a.advisorType}</td>
                      <td style={{ padding: "4px 10px 4px 0", fontWeight: 600 }}>{a.firmName}</td>
                      <td style={{ padding: "4px 10px 4px 0", color: "#6b7280" }}>{a.contactName ?? "—"}</td>
                      <td style={{ padding: "4px 10px 4px 0", color: a.conflictsStatus === "Flagged" ? "#dc2626" : a.conflictsStatus === "Cleared" ? "#16a34a" : "#6b7280" }}>
                        {a.conflictsStatus ?? "Pending"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {/* Open Actions */}
      {openActions.length > 0 && (
        <Section title={`Open Actions (${openActions.length})`}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {["Description", "Owner", "Priority", "Due", "Status"].map(h => (
                  <th key={h} style={{ textAlign: "left", paddingBottom: 4, paddingRight: 10, fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#9ca3af" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {openActions.map(a => {
                const isOverdue = a.dueDate && new Date(a.dueDate) < new Date();
                return (
                  <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "4px 10px 4px 0" }}>{a.description}</td>
                    <td style={{ padding: "4px 10px 4px 0", color: "#6b7280" }}>{a.owner ?? "—"}</td>
                    <td style={{ padding: "4px 10px 4px 0", color: a.priority === "Critical" || a.priority === "High" ? "#dc2626" : "#6b7280" }}>{a.priority}</td>
                    <td style={{ padding: "4px 10px 4px 0", color: isOverdue ? "#dc2626" : "#374151", fontFamily: "monospace", fontSize: 10 }}>
                      {fmtDate(a.dueDate)}
                    </td>
                    <td style={{ padding: "4px 10px 4px 0", color: a.status === "Blocked" ? "#dc2626" : "#374151" }}>{a.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {/* Recent Interactions */}
      {recentInteractions.length > 0 && (
        <Section title={`Recent Interactions (last ${recentInteractions.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recentInteractions.map(i => (
              <div key={i.id} style={{ display: "flex", gap: 12, paddingBottom: 6, borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ minWidth: 90, fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>
                  {fmtDate(i.interactionDatetime)}
                </div>
                <div style={{ minWidth: 80, fontSize: 10, textTransform: "uppercase", fontFamily: "monospace", color: "#6b7280" }}>
                  {i.interactionType}
                </div>
                <div style={{ flex: 1, fontSize: 11, color: "#374151" }}>
                  {i.summary ?? <span style={{ color: "#9ca3af", fontStyle: "italic" }}>No summary</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Footer */}
      <div style={{
        marginTop: 40,
        paddingTop: 12,
        borderTop: "1px solid #e5e7eb",
        display: "flex",
        justifyContent: "space-between",
        fontSize: 9,
        fontFamily: "monospace",
        color: "#9ca3af",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}>
        <span>Ringside M&A · Investment Committee Brief · Confidential</span>
        <span>{fmtDatetime(generatedAt)}</span>
      </div>
    </div>
  );
}

export default function IcBriefPage() {
  const params = useParams<{ id: string }>();
  const targetId = parseInt(params.id ?? "0", 10);

  const { data, isLoading, isError } = useGetIcBrief(targetId, {
    query: { enabled: !!targetId && !isNaN(targetId), queryKey: getGetIcBriefQueryKey(targetId) },
  });

  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => {
      window.print();
    }, 500);
    return () => clearTimeout(timer);
  }, [data]);

  if (isLoading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "monospace",
        fontSize: 13,
        color: "#6b7280",
      }}>
        Preparing IC brief…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "monospace",
        fontSize: 13,
        color: "#dc2626",
      }}>
        Could not load IC brief. Please close this tab and try again.
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { margin: 0; }
          .no-print { display: none !important; }
        }
        body { margin: 0; background: #f3f4f6; }
        @media screen {
          body { background: #e5e7eb; }
        }
      `}</style>
      <div
        className="no-print"
        style={{
          position: "fixed",
          top: 12,
          right: 16,
          zIndex: 1000,
          display: "flex",
          gap: 8,
        }}
      >
        <button
          onClick={() => window.print()}
          style={{
            padding: "6px 14px",
            background: "#1e3a5f",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "monospace",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Print / Save PDF
        </button>
      </div>
      <div style={{ minHeight: "100vh", padding: "24px 0" }}>
        <IcBriefContent data={data as unknown as IcBriefData} />
      </div>
    </>
  );
}
