from datetime import datetime, date
from enum import Enum

from sqlalchemy import (
    String,
    Text,
    Date,
    DateTime,
    Boolean,
    Integer,
    Numeric,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class PriorityTier(str, Enum):
    MUST_WIN = "Must-Win"
    PRIORITY_1 = "Priority 1"
    PRIORITY_2 = "Priority 2"
    WATCHLIST = "Watchlist"
    ON_HOLD = "On Hold"
    DROPPED = "Dropped"


class PipelineStage(str, Enum):
    SOURCING = "Sourcing"
    OUTREACH = "Outreach"
    INTRODUCTORY_DISCUSSION = "Introductory Discussion"
    NDA_CIM = "NDA / CIM"
    PRELIMINARY_DD = "Preliminary Due Diligence"
    MANAGEMENT_MEETING = "Management Meeting"
    NON_BINDING_OFFER = "Non-Binding Offer"
    CONFIRMATORY_DD = "Confirmatory Due Diligence"
    BINDING_OFFER = "Binding Offer"
    SPA_NEGOTIATION = "SPA Negotiation"
    INTEGRATION_PLANNING = "Integration Planning"
    CLOSED = "Closed"
    ON_HOLD = "On Hold"
    DROPPED = "Dropped"


class RAGStatus(str, Enum):
    NOT_STARTED = "Not Started"
    RED = "Red"
    AMBER = "Amber"
    GREEN = "Green"


class ActionStatus(str, Enum):
    OPEN = "Open"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    BLOCKED = "Blocked"
    CANCELLED = "Cancelled"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(100), default="Corporate Development")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Target(Base):
    __tablename__ = "targets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    target_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    project_name: Mapped[str] = mapped_column(String(150), nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    business_unit: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(100), nullable=True)
    subsector: Mapped[str | None] = mapped_column(String(100), nullable=True)

    geography_region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)

    sourcing_channel: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sourcing_firm: Mapped[str | None] = mapped_column(String(150), nullable=True)

    deal_owner: Mapped[str | None] = mapped_column(String(150), nullable=True)
    deal_champion: Mapped[str | None] = mapped_column(String(150), nullable=True)
    executive_sponsor: Mapped[str | None] = mapped_column(String(150), nullable=True)

    priority_tier: Mapped[str] = mapped_column(String(50), default=PriorityTier.WATCHLIST.value)
    strategic_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)

    strategic_fit_score: Mapped[int] = mapped_column(Integer, default=50)
    synergy_score: Mapped[int] = mapped_column(Integer, default=50)
    financial_attractiveness_score: Mapped[int] = mapped_column(Integer, default=50)
    process_maturity_score: Mapped[int] = mapped_column(Integer, default=50)
    risk_penalty_score: Mapped[int] = mapped_column(Integer, default=0)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_confidential: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    financials = relationship("FinancialSnapshot", back_populates="target", cascade="all, delete-orphan")
    milestone = relationship("Milestone", back_populates="target", uselist=False, cascade="all, delete-orphan")
    interactions = relationship("Interaction", back_populates="target", cascade="all, delete-orphan")
    actions = relationship("ActionItem", back_populates="target", cascade="all, delete-orphan")
    stage_changes = relationship("StageChangeLog", back_populates="target", cascade="all, delete-orphan")

    @property
    def priority_score(self) -> int:
        gross_score = (
            self.strategic_fit_score * 0.25
            + self.synergy_score * 0.20
            + self.financial_attractiveness_score * 0.20
            + self.process_maturity_score * 0.15
            + 10
            + 10
        )
        final_score = int(max(0, min(100, gross_score - self.risk_penalty_score)))
        return final_score


class FinancialSnapshot(Base):
    __tablename__ = "financial_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    target_id: Mapped[int] = mapped_column(ForeignKey("targets.id"), nullable=False)

    fiscal_period: Mapped[str] = mapped_column(String(50), default="LTM")
    currency: Mapped[str] = mapped_column(String(10), default="USD")

    revenue_low: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    revenue_high: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)

    ebitda_low: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    ebitda_high: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)

    expected_ev_low: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    expected_ev_high: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)

    target_ev_low: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    target_ev_high: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)

    funding_source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source_of_financials: Mapped[str | None] = mapped_column(String(150), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    target = relationship("Target", back_populates="financials")


class Milestone(Base):
    __tablename__ = "milestones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    target_id: Mapped[int] = mapped_column(ForeignKey("targets.id"), unique=True, nullable=False)

    current_stage: Mapped[str] = mapped_column(String(100), default=PipelineStage.SOURCING.value)
    stage_entered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    nda_status: Mapped[str] = mapped_column(String(100), default="Not Sent")
    nda_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    cim_received_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    data_room_access: Mapped[str] = mapped_column(String(100), default="No")
    data_room_access_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    commercial_dd_status: Mapped[str] = mapped_column(String(50), default=RAGStatus.NOT_STARTED.value)
    financial_dd_status: Mapped[str] = mapped_column(String(50), default=RAGStatus.NOT_STARTED.value)
    legal_dd_status: Mapped[str] = mapped_column(String(50), default=RAGStatus.NOT_STARTED.value)
    tax_dd_status: Mapped[str] = mapped_column(String(50), default=RAGStatus.NOT_STARTED.value)
    tech_dd_status: Mapped[str] = mapped_column(String(50), default=RAGStatus.NOT_STARTED.value)

    non_binding_offer_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    binding_offer_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    signing_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    closing_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    drop_reason_category: Mapped[str | None] = mapped_column(String(150), nullable=True)
    drop_reason_detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    target = relationship("Target", back_populates="milestone")


class Interaction(Base):
    __tablename__ = "interactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    target_id: Mapped[int] = mapped_column(ForeignKey("targets.id"), nullable=False)

    interaction_type: Mapped[str] = mapped_column(String(100), nullable=False)
    interaction_datetime: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    participants_internal: Mapped[str | None] = mapped_column(Text, nullable=True)
    participants_external: Mapped[str | None] = mapped_column(Text, nullable=True)

    summary: Mapped[str] = mapped_column(Text, nullable=False)
    sentiment: Mapped[str | None] = mapped_column(String(50), nullable=True)
    promoter_willingness: Mapped[str | None] = mapped_column(String(50), nullable=True)
    valuation_signal: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_by: Mapped[str | None] = mapped_column(String(150), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    target = relationship("Target", back_populates="interactions")


class ActionItem(Base):
    __tablename__ = "actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    target_id: Mapped[int] = mapped_column(ForeignKey("targets.id"), nullable=False)
    interaction_id: Mapped[int | None] = mapped_column(ForeignKey("interactions.id"), nullable=True)

    description: Mapped[str] = mapped_column(Text, nullable=False)
    owner: Mapped[str | None] = mapped_column(String(150), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    priority: Mapped[str] = mapped_column(String(50), default="Medium")
    status: Mapped[str] = mapped_column(String(50), default=ActionStatus.OPEN.value)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    target = relationship("Target", back_populates="actions")


class StageChangeLog(Base):
    __tablename__ = "stage_change_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    target_id: Mapped[int] = mapped_column(ForeignKey("targets.id"), nullable=False)

    previous_stage: Mapped[str | None] = mapped_column(String(100), nullable=True)
    new_stage: Mapped[str] = mapped_column(String(100), nullable=False)

    changed_by: Mapped[str | None] = mapped_column(String(150), nullable=True)
    change_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    target = relationship("Target", back_populates="stage_changes")


class LookupValue(Base):
    __tablename__ = "lookup_values"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    category: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[str] = mapped_column(String(150), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (
        UniqueConstraint("category", "value", name="uq_lookup_category_value"),
    )