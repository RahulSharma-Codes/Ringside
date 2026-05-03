import os
from datetime import date

import pandas as pd
import streamlit as st
from sqlalchemy import text

from database import init_db, get_session
from models import Target, Milestone, Interaction, ActionItem, StageChangeLog


st.set_page_config(
    page_title="Inorganic Growth Operating System",
    page_icon="📈",
    layout="wide",
)


def require_login():
    expected_password = os.getenv("APP_PASSWORD")

    if not expected_password:
        st.error("APP_PASSWORD is not configured in Replit Secrets.")
        st.stop()

    if "authenticated" not in st.session_state:
        st.session_state.authenticated = False

    if not st.session_state.authenticated:
        st.title("Inorganic Growth Operating System")
        st.caption("Confidential Corporate Development Platform")

        password = st.text_input("Access Password", type="password")

        if st.button("Login", use_container_width=True):
            if password == expected_password:
                st.session_state.authenticated = True
                st.rerun()
            else:
                st.error("Invalid password.")

        st.stop()


def get_latest_interaction(db, target_id):
    return (
        db.query(Interaction)
        .filter(Interaction.target_id == target_id)
        .order_by(Interaction.interaction_datetime.desc())
        .first()
    )


def get_open_actions(db, target_id):
    return (
        db.query(ActionItem)
        .filter(ActionItem.target_id == target_id)
        .filter(ActionItem.status.in_(["Open", "In Progress", "Blocked"]))
        .order_by(ActionItem.due_date.asc().nulls_last())
        .all()
    )


def render_target_card(db, target):
    milestone = target.milestone
    latest_interaction = get_latest_interaction(db, target.id)
    open_actions = get_open_actions(db, target.id)

    current_stage = milestone.current_stage if milestone else "Sourcing"
    latest_update = latest_interaction.summary if latest_interaction else "No interaction logged yet."

    with st.container(border=True):
        top_left, top_right = st.columns([3, 1])

        with top_left:
            st.subheader(target.project_name)
            st.caption(
                f"{target.target_code} | "
                f"{target.sector or 'Sector N/A'} | "
                f"{target.country or 'Country N/A'} | "
                f"Owner: {target.deal_owner or 'Unassigned'}"
            )
            st.write(target.strategic_rationale or "No strategic rationale captured yet.")

        with top_right:
            st.metric("Priority Score", target.priority_score)
            st.write(f"**Stage:** {current_stage}")
            st.write(f"**Tier:** {target.priority_tier}")

        st.divider()

        st.write("**Latest Update**")
        st.write(latest_update)

        st.write("**Open Actions**")
        if open_actions:
            for action in open_actions[:3]:
                due = action.due_date.strftime("%d %b %Y") if action.due_date else "No due date"
                st.write(f"- {action.description} — {action.owner or 'Unassigned'} — {due}")
        else:
            st.write("No open actions.")

        with st.expander("Update this opportunity"):
            tab1, tab2, tab3 = st.tabs(["Update Stage", "Log Interaction", "Add Action"])

            with tab1:
                stages = [
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
                    "Closed",
                    "On Hold",
                    "Dropped",
                ]

                new_stage = st.selectbox(
                    "New Stage",
                    stages,
                    index=stages.index(current_stage) if current_stage in stages else 0,
                    key=f"stage_{target.id}",
                )

                changed_by = st.text_input(
                    "Changed by",
                    value=target.deal_owner or "",
                    key=f"changed_by_{target.id}",
                )

                reason = st.text_area(
                    "Reason for stage change",
                    key=f"reason_{target.id}",
                )

                if st.button("Save Stage Change", key=f"save_stage_{target.id}", use_container_width=True):
                    if milestone is None:
                        milestone = Milestone(target_id=target.id, current_stage=new_stage)
                        db.add(milestone)
                        previous_stage = None
                    else:
                        previous_stage = milestone.current_stage
                        milestone.current_stage = new_stage

                    log = StageChangeLog(
                        target_id=target.id,
                        previous_stage=previous_stage,
                        new_stage=new_stage,
                        changed_by=changed_by,
                        change_reason=reason,
                    )

                    db.add(log)
                    db.commit()

                    st.success("Stage updated and audit log recorded.")
                    st.rerun()

            with tab2:
                interaction_type = st.selectbox(
                    "Interaction Type",
                    [
                        "Introductory Call",
                        "Management Meeting",
                        "Banker Update",
                        "Internal Discussion",
                        "Site Visit",
                        "Email Update",
                        "Mobile Note",
                        "Investment Committee Discussion",
                    ],
                    key=f"itype_{target.id}",
                )

                summary = st.text_area(
                    "Meeting / Call Summary",
                    placeholder="Capture key update, seller signal, valuation signal, risks, and next steps.",
                    key=f"summary_{target.id}",
                )

                sentiment = st.selectbox(
                    "Sentiment",
                    ["Positive", "Neutral", "Negative", "Unknown"],
                    key=f"sentiment_{target.id}",
                )

                created_by = st.text_input(
                    "Logged by",
                    value=target.deal_owner or "",
                    key=f"created_by_{target.id}",
                )

                if st.button("Log Interaction", key=f"log_interaction_{target.id}", use_container_width=True):
                    if not summary.strip():
                        st.warning("Please enter a summary.")
                    else:
                        interaction = Interaction(
                            target_id=target.id,
                            interaction_type=interaction_type,
                            summary=summary,
                            sentiment=sentiment,
                            created_by=created_by,
                        )

                        db.add(interaction)
                        db.commit()

                        st.success("Interaction logged.")
                        st.rerun()

            with tab3:
                description = st.text_area("Action Description", key=f"action_desc_{target.id}")
                owner = st.text_input("Owner", value=target.deal_owner or "", key=f"action_owner_{target.id}")
                due_date = st.date_input("Due Date", value=None, key=f"due_{target.id}")
                priority = st.selectbox("Priority", ["Critical", "High", "Medium", "Low"], key=f"priority_{target.id}")

                if st.button("Create Action", key=f"create_action_{target.id}", use_container_width=True):
                    if not description.strip():
                        st.warning("Please enter an action description.")
                    else:
                        action = ActionItem(
                            target_id=target.id,
                            description=description,
                            owner=owner,
                            due_date=due_date,
                            priority=priority,
                            status="Open",
                        )

                        db.add(action)
                        db.commit()

                        st.success("Action created.")
                        st.rerun()


def render_pipeline(db):
    st.header("Inorganic Growth Pipeline")

    targets = (
        db.query(Target)
        .filter(Target.is_active == True)
        .order_by(Target.updated_at.desc())
        .all()
    )

    if not targets:
        st.info("No opportunities found. Add your first opportunity.")
        return

    c1, c2, c3 = st.columns(3)

    with c1:
        sectors = sorted({t.sector for t in targets if t.sector})
        sector_filter = st.selectbox("Sector", ["All"] + sectors)

    with c2:
        tiers = sorted({t.priority_tier for t in targets if t.priority_tier})
        tier_filter = st.selectbox("Priority Tier", ["All"] + tiers)

    with c3:
        search = st.text_input("Search")

    filtered = targets

    if sector_filter != "All":
        filtered = [t for t in filtered if t.sector == sector_filter]

    if tier_filter != "All":
        filtered = [t for t in filtered if t.priority_tier == tier_filter]

    if search:
        q = search.lower()
        filtered = [
            t for t in filtered
            if q in t.project_name.lower()
            or q in t.target_code.lower()
            or q in (t.country or "").lower()
            or q in (t.sector or "").lower()
        ]

    st.caption(f"{len(filtered)} opportunities displayed")

    for target in filtered:
        render_target_card(db, target)


def render_add_opportunity(db):
    st.header("Add New Opportunity")

    with st.form("new_target_form"):
        target_code = st.text_input("Target Code", placeholder="TGT-0002 or Project Name")
        project_name = st.text_input("Project / Target Name")
        legal_name = st.text_input("Legal Company Name")
        business_unit = st.text_input("Business Unit", value="Corporate Development")
        sector = st.text_input("Sector")
        subsector = st.text_input("Subsector")
        geography_region = st.text_input("Region")
        country = st.text_input("Country")
        sourcing_channel = st.selectbox("Sourcing Channel", ["Internal", "Direct", "Banker", "Referral", "Inbound", "Strategic Partner"])
        deal_owner = st.text_input("Deal Owner")
        priority_tier = st.selectbox("Priority Tier", ["Must-Win", "Priority 1", "Priority 2", "Watchlist", "On Hold", "Dropped"], index=3)
        strategic_rationale = st.text_area("Strategic Rationale")

        submitted = st.form_submit_button("Create Opportunity", use_container_width=True)

        if submitted:
            if not target_code or not project_name:
                st.error("Target Code and Project / Target Name are required.")
            else:
                existing = db.query(Target).filter(Target.target_code == target_code).one_or_none()

                if existing:
                    st.error("That Target Code already exists. Use a unique code.")
                else:
                    target = Target(
                        target_code=target_code,
                        project_name=project_name,
                        legal_name=legal_name,
                        business_unit=business_unit,
                        sector=sector,
                        subsector=subsector,
                        geography_region=geography_region,
                        country=country,
                        sourcing_channel=sourcing_channel,
                        deal_owner=deal_owner,
                        priority_tier=priority_tier,
                        strategic_rationale=strategic_rationale,
                    )

                    db.add(target)
                    db.flush()

                    milestone = Milestone(
                        target_id=target.id,
                        current_stage="Sourcing",
                        nda_status="Not Sent",
                        data_room_access="No",
                    )

                    db.add(milestone)

                    log = StageChangeLog(
                        target_id=target.id,
                        previous_stage=None,
                        new_stage="Sourcing",
                        changed_by=deal_owner,
                        change_reason="Initial opportunity creation",
                    )

                    db.add(log)
                    db.commit()

                    st.success("Opportunity created.")
                    st.rerun()


def render_dashboard(db):
    st.header("Executive Dashboard")

    targets = db.query(Target).filter(Target.is_active == True).all()
    actions = (
        db.query(ActionItem)
        .filter(ActionItem.status.in_(["Open", "In Progress", "Blocked"]))
        .all()
    )

    active_count = len(targets)
    must_win_count = len([t for t in targets if t.priority_tier == "Must-Win"])
    avg_score = round(sum([t.priority_score for t in targets]) / active_count, 1) if active_count else 0
    overdue_count = len([a for a in actions if a.due_date and a.due_date < date.today()])

    k1, k2, k3, k4 = st.columns(4)
    k1.metric("Active Opportunities", active_count)
    k2.metric("Must-Win Assets", must_win_count)
    k3.metric("Average Priority Score", avg_score)
    k4.metric("Overdue Actions", overdue_count)

    st.subheader("Pipeline Distribution")

    stage_data = []
    for target in targets:
        if target.milestone:
            stage_data.append({"Stage": target.milestone.current_stage, "Target": target.project_name})

    if stage_data:
        df = pd.DataFrame(stage_data)
        chart_df = df.groupby("Stage").size().reset_index(name="Count")
        st.bar_chart(chart_df, x="Stage", y="Count")
    else:
        st.info("No stage data available.")

    st.subheader("Priority-Ranked Opportunities")

    ranked = sorted(targets, key=lambda t: t.priority_score, reverse=True)

    for target in ranked[:5]:
        with st.container(border=True):
            st.write(f"**{target.project_name}**")
            st.caption(f"{target.sector or 'Sector N/A'} | {target.country or 'Country N/A'} | {target.priority_tier}")
            st.progress(target.priority_score / 100)
            st.write(target.strategic_rationale or "No strategic rationale captured.")


def render_action_tracker(db):
    st.header("Action Tracker")

    actions = (
        db.query(ActionItem)
        .filter(ActionItem.status.in_(["Open", "In Progress", "Blocked"]))
        .order_by(ActionItem.due_date.asc().nulls_last())
        .all()
    )

    if not actions:
        st.info("No open actions.")
        return

    for action in actions:
        target = db.query(Target).filter(Target.id == action.target_id).one_or_none()
        overdue = action.due_date and action.due_date < date.today()

        with st.container(border=True):
            st.write(f"**{action.description}**")
            st.caption(f"Target: {target.project_name if target else 'Unknown'} | Owner: {action.owner or 'Unassigned'}")
            st.write(f"Priority: **{action.priority}** | Status: **{action.status}**")
            st.write(f"Due Date: {action.due_date or 'No due date'}")

            if overdue:
                st.error("Overdue")

            if st.button("Mark Completed", key=f"complete_{action.id}", use_container_width=True):
                action.status = "Completed"
                db.commit()
                st.success("Action completed.")
                st.rerun()


def main():
    init_db()
    require_login()

    db = get_session()

    st.sidebar.title("Inorganic Growth OS")

    page = st.sidebar.radio(
        "Navigate",
        [
            "Dashboard",
            "Pipeline",
            "New Opportunity",
            "Action Tracker",
        ],
    )

    if page == "Dashboard":
        render_dashboard(db)
    elif page == "Pipeline":
        render_pipeline(db)
    elif page == "New Opportunity":
        render_add_opportunity(db)
    elif page == "Action Tracker":
        render_action_tracker(db)

    db.close()


if __name__ == "__main__":
    main()
