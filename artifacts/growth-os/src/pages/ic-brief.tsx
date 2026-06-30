import React, { useEffect } from "react";
import { useParams } from "wouter";
import {
  useGetIcBrief,
  getGetIcBriefQueryKey,
  type IcBriefResponse,
  type IcBriefTarget,
  type IcBriefDiligence,
  type IcSession,
  type Interaction,
  type ActionItem,
  type Advisor,
  type Valuation,
  type DealEconomics,
  type SynergyEntry,
} from "@workspace/api-client-react";
import { format, parseISO } from "date-fns";

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

function valuationRange(v: Valuation): string {
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
      <div style={{ borderBottom: "2px solid #1e3a5f", marginBottom: 10, paddingBottom: 4 }}>
        <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#1e3a5f" }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: "12px 0", fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
      {text}
    </div>
  );
}

function DealHeader({ target, generatedAt }: { target: IcBriefTarget; generatedAt: string }) {
  const meta: string[] = [];
  if (target.targetCode) meta.push(target.targetCode);
  if (target.dealType) meta.push(target.dealType);
  if (target.sector) meta.push(target.sector);
  if (target.country) meta.push(target.country);

  return (
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
            {meta.join(" · ")}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            display: "inline-block", padding: "4px 10px", borderRadius: 4, background: "#1e3a5f",
            color: "#ffffff", fontSize: 10, fontFamily: "monospace", textTransform: "uppercase",
            letterSpacing: "0.1em", fontWeight: 700, marginBottom: 6,
          }}>
            {target.currentStage}
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>
            Generated {fmtDate(generatedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}

function DealSnapshot({ target }: { target: IcBriefTarget }) {
  const tiles = [
    { label: "Priority Tier", value: target.priorityTier ?? "—" },
    {
      label: "Health",
      value: (
        <span style={{ color: healthColor(target.healthScore), fontWeight: 600 }}>
          {healthLabel(target.healthScore)}
        </span>
      ),
    },
    {
      label: "Priority Score",
      value: (
        <span style={{ fontWeight: 700, fontSize: 16 }}>
          {target.priorityScore}
          <span style={{ fontSize: 11, color: "#9ca3af" }}>/100</span>
        </span>
      ),
    },
    { label: "Days in Stage", value: target.daysInCurrentStage != null ? `${target.daysInCurrentStage}d` : "—" },
    {
      label: "Open Actions",
      value: (
        <span>
          {target.openActionCount}
          {target.overdueActionCount > 0 && (
            <span style={{ color: "#dc2626", marginLeft: 6, fontSize: 11 }}>
              ({target.overdueActionCount} overdue)
            </span>
          )}
        </span>
      ),
    },
    { label: "Last Interaction", value: target.daysSinceLastInteraction != null ? `${target.daysSinceLastInteraction}d ago` : "No interactions" },
  ];

  return (
    <Section title="Deal Snapshot">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        {tiles.map(({ label, value }) => (
          <div key={label} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{value}</div>
          </div>
        ))}
      </div>
      {target.description ? (
        <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.7, margin: 0, fontStyle: "italic" }}>
          {target.description}
        </p>
      ) : (
        <p style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic", margin: 0 }}>No description on record.</p>
      )}
    </Section>
  );
}

function ScoringSection({ target }: { target: IcBriefTarget }) {
  return (
    <Section title="Scoring Breakdown">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {[
            { label: "Strategic Fit", score: target.strategicFitScore ?? 0 },
            { label: "Synergy Potential", score: target.synergyScore ?? 0 },
            { label: "Financial Attractiveness", score: target.financialAttractivenessScore ?? 0 },
            { label: "Process Maturity", score: target.processMaturityScore ?? 0 },
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
                  <div style={{ width: `${Math.min(100, ((target.riskPenaltyScore ?? 0) / 30) * 100)}%`, height: "100%", background: "#dc2626", borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 11, color: "#dc2626", minWidth: 24 }}>{target.riskPenaltyScore ?? 0}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

function ValuationSection({ valuations, economics }: { valuations: Valuation[]; economics?: DealEconomics | null }) {
  const latest = valuations[0] ?? null;
  return (
    <Section title="Valuation & Economics">
      {valuations.length === 0 && !economics ? (
        <EmptyState text="No valuation entries or deal economics recorded yet." />
      ) : (
        <>
          {latest && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#9ca3af", marginBottom: 6 }}>
                Latest Valuation
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "Methodology", value: latest.methodology },
                  { label: "Value Range", value: valuationRange(latest) },
                  { label: "Stage at Record", value: latest.stageAtRecord ?? "—" },
                  { label: "Recorded", value: fmtDate(latest.recordedAt) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4, padding: "6px 10px" }}>
                    <div style={{ fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#9ca3af" }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{value}</div>
                  </div>
                ))}
              </div>
              {latest.notes && (
                <div style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic", marginTop: 6 }}>{latest.notes}</div>
              )}
            </div>
          )}

          {valuations.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#9ca3af", marginBottom: 6 }}>
                All Entries ({valuations.length})
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    {["Methodology", "Value", "Currency", "Stage", "Date"].map(h => (
                      <th key={h} style={{ textAlign: "left", paddingBottom: 4, paddingRight: 10, fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#9ca3af" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {valuations.map(v => (
                    <tr key={v.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "4px 10px 4px 0" }}>{v.methodology}</td>
                      <td style={{ padding: "4px 10px 4px 0", fontFamily: "monospace" }}>{valuationRange(v)}</td>
                      <td style={{ padding: "4px 10px 4px 0" }}>{v.currency}</td>
                      <td style={{ padding: "4px 10px 4px 0" }}>{v.stageAtRecord ?? "—"}</td>
                      <td style={{ padding: "4px 10px 4px 0" }}>{fmtDate(v.recordedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {economics && (
            <div>
              <div style={{ fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#9ca3af", marginBottom: 6 }}>
                Deal Economics
              </div>
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
        </>
      )}
    </Section>
  );
}

function SynergiesSection({ synergies }: { synergies: SynergyEntry[] }) {
  const totalFy = (v: string | null | undefined): number => (v ? parseFloat(v) || 0 : 0);
  const positive = synergies.filter(s => !s.isDisynergy);
  const totalSynergy3yr = positive.reduce((sum, s) => sum + totalFy(s.fy1) + totalFy(s.fy2) + totalFy(s.fy3), 0);

  return (
    <Section title={`Synergy Case (${positive.length} synerg${positive.length !== 1 ? "ies" : "y"})`}>
      {synergies.length === 0 ? (
        <EmptyState text="No synergy case recorded yet. Add synergies in the Synergies tab." />
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {["Type", "Description", "Confidence", "FY1", "FY2", "FY3"].map(h => (
                  <th key={h} style={{ textAlign: "left", paddingBottom: 4, paddingRight: 8, fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#9ca3af" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {synergies.map(s => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "4px 8px 4px 0" }}>
                    <span style={{
                      display: "inline-block", fontSize: 9, padding: "1px 5px", borderRadius: 3,
                      background: s.isDisynergy ? "#fef2f2" : "#eff6ff",
                      color: s.isDisynergy ? "#dc2626" : "#2563eb",
                      fontFamily: "monospace", textTransform: "uppercase",
                    }}>
                      {s.isDisynergy ? "DIS" : s.type}
                    </span>
                  </td>
                  <td style={{ padding: "4px 8px 4px 0" }}>{s.description}</td>
                  <td style={{ padding: "4px 8px 4px 0", fontSize: 10, color: "#6b7280" }}>{s.confidence}</td>
                  <td style={{ padding: "4px 8px 4px 0", fontFamily: "monospace" }}>{s.fy1 != null ? s.fy1 : "—"}</td>
                  <td style={{ padding: "4px 8px 4px 0", fontFamily: "monospace" }}>{s.fy2 != null ? s.fy2 : "—"}</td>
                  <td style={{ padding: "4px 8px 4px 0", fontFamily: "monospace" }}>{s.fy3 != null ? s.fy3 : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalSynergy3yr > 0 && (
            <div style={{ marginTop: 8, textAlign: "right", fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
              3yr run-rate total: <strong style={{ color: "#111827" }}>{totalSynergy3yr.toLocaleString()}</strong>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function DiligenceSection({ diligence }: { diligence: IcBriefDiligence }) {
  const pct = diligence.pct;
  return (
    <Section title={`Diligence Readiness — ${pct}%`}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
          <div style={{
            width: `${pct}%`, height: "100%", borderRadius: 4,
            background: pct === 100 ? "#16a34a" : pct >= 60 ? "#2563eb" : pct >= 30 ? "#d97706" : "#dc2626",
          }} />
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
          <span>{diligence.completed} of {diligence.total} items complete</span>
          {diligence.blocked > 0 && <span style={{ color: "#dc2626" }}>{diligence.blocked} blocked</span>}
          {diligence.overdue > 0 && <span style={{ color: "#d97706" }}>{diligence.overdue} overdue</span>}
        </div>
      </div>
      {diligence.total === 0 && (
        <EmptyState text="No diligence items recorded. Add workstream items in the Diligence tab." />
      )}
      {diligence.missingWorkstreams.length > 0 && diligence.missingWorkstreams.length < 10 && diligence.total > 0 && (
        <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace", marginTop: 4 }}>
          No items yet: {diligence.missingWorkstreams.join(", ")}
        </div>
      )}
    </Section>
  );
}

function IcHistorySection({ icSessions }: { icSessions: IcSession[] }) {
  return (
    <Section title={`IC History (${icSessions.length} session${icSessions.length !== 1 ? "s" : ""})`}>
      {icSessions.length === 0 ? (
        <EmptyState text="No IC sessions recorded for this deal." />
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
  );
}

function AdvisorsSection({ advisors }: { advisors: Advisor[] }) {
  const buyAdvisors = advisors.filter(a => a.side === "buy-side");
  const sellAdvisors = advisors.filter(a => a.side === "sell-side");

  function AdvisorTable({ rows, label, color }: { rows: Advisor[]; label: string; color: string }) {
    return (
      <div style={{ marginBottom: rows.length && sellAdvisors.length ? 14 : 0 }}>
        <div style={{ fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color, marginBottom: 6 }}>{label}</div>
        {rows.length === 0 ? (
          <EmptyState text={`No ${label.toLowerCase()} advisors on record.`} />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {["Type", "Firm", "Contact", "Conflicts"].map(h => (
                  <th key={h} style={{ textAlign: "left", paddingBottom: 4, paddingRight: 10, fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", color: "#9ca3af" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(a => (
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
        )}
      </div>
    );
  }

  return (
    <Section title={`Advisors (${advisors.length})`}>
      {advisors.length === 0 ? (
        <EmptyState text="No advisors recorded. Add buy-side or sell-side advisors in the Stakeholders tab." />
      ) : (
        <>
          <AdvisorTable rows={buyAdvisors} label="Buy-side" color="#2563eb" />
          <AdvisorTable rows={sellAdvisors} label="Sell-side (Counterparty)" color="#d97706" />
        </>
      )}
    </Section>
  );
}

function OpenActionsSection({ openActions }: { openActions: ActionItem[] }) {
  return (
    <Section title={`Open Actions (${openActions.length})`}>
      {openActions.length === 0 ? (
        <EmptyState text="No open actions — all actions are completed or none have been created." />
      ) : (
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
                  <td style={{ padding: "4px 10px 4px 0", color: (a.priority === "Critical" || a.priority === "High") ? "#dc2626" : "#6b7280" }}>{a.priority}</td>
                  <td style={{ padding: "4px 10px 4px 0", color: isOverdue ? "#dc2626" : "#374151", fontFamily: "monospace", fontSize: 10 }}>
                    {fmtDate(a.dueDate)}
                  </td>
                  <td style={{ padding: "4px 10px 4px 0", color: a.status === "Blocked" ? "#dc2626" : "#374151" }}>{a.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function RecentInteractionsSection({ recentInteractions }: { recentInteractions: Interaction[] }) {
  return (
    <Section title={`Recent Interactions (last ${recentInteractions.length})`}>
      {recentInteractions.length === 0 ? (
        <EmptyState text="No interactions recorded. Log calls and meetings in the Interactions tab." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {recentInteractions.map(i => (
            <div key={i.id} style={{ display: "flex", gap: 12, paddingBottom: 6, paddingTop: 6, borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ minWidth: 90, fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>
                {fmtDate(i.interactionDatetime)}
              </div>
              <div style={{ minWidth: 80, fontSize: 10, textTransform: "uppercase", fontFamily: "monospace", color: "#6b7280" }}>
                {i.interactionType}
              </div>
              <div style={{ flex: 1, fontSize: 11, color: "#374151" }}>
                {i.summary || <span style={{ color: "#9ca3af", fontStyle: "italic" }}>No summary</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function IcBriefContent({ data }: { data: IcBriefResponse }) {
  const { target, diligence, icSessions, recentInteractions, openActions, advisors, valuations, economics, synergies, generatedAt } = data;

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
      <DealHeader target={target} generatedAt={generatedAt} />
      <DealSnapshot target={target} />
      <ScoringSection target={target} />
      <ValuationSection valuations={valuations} economics={economics} />
      <SynergiesSection synergies={synergies} />
      <DiligenceSection diligence={diligence} />
      <IcHistorySection icSessions={icSessions} />
      <AdvisorsSection advisors={advisors} />
      <OpenActionsSection openActions={openActions} />
      <RecentInteractionsSection recentInteractions={recentInteractions} />

      <div style={{
        marginTop: 40, paddingTop: 12, borderTop: "1px solid #e5e7eb",
        display: "flex", justifyContent: "space-between",
        fontSize: 9, fontFamily: "monospace", color: "#9ca3af",
        textTransform: "uppercase", letterSpacing: "0.06em",
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
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "100vh", fontFamily: "monospace", fontSize: 13, color: "#6b7280",
      }}>
        Preparing IC brief…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "100vh", fontFamily: "monospace", fontSize: 13, color: "#dc2626",
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
        body { margin: 0; }
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
          onClick={() => {
            try { window.close(); }
            catch { window.history.back(); }
          }}
          style={{
            padding: "6px 14px",
            background: "#ffffff",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "monospace",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Close
        </button>
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

      <div style={{ minHeight: "100vh", padding: "24px 0", background: "#e5e7eb" }}>
        <IcBriefContent data={data} />
      </div>
    </>
  );
}
