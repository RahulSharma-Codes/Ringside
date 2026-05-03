from database import get_session
from models import Target, Milestone, StageChangeLog


db = get_session()

existing = db.query(Target).filter(Target.target_code == "TGT-TEST-001").one_or_none()

if existing:
    print("Test target already exists:", existing.project_name)
else:
    target = Target(
        target_code="TGT-TEST-001",
        project_name="Project Test",
        legal_name="Test Company Private Limited",
        business_unit="Corporate Development",
        sector="Payments",
        subsector="Test Subsector",
        geography_region="Asia",
        country="India",
        sourcing_channel="Internal",
        deal_owner="Rahul Sharma",
        priority_tier="Watchlist",
        strategic_rationale="Dummy opportunity created only to verify Supabase connectivity.",
        strategic_fit_score=60,
        synergy_score=55,
        financial_attractiveness_score=50,
        process_maturity_score=40,
        risk_penalty_score=0,
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

    stage_log = StageChangeLog(
        target_id=target.id,
        previous_stage=None,
        new_stage="Sourcing",
        changed_by="Rahul Sharma",
        change_reason="Initial dummy test record",
    )

    db.add(stage_log)

    db.commit()
    print("Created test target:", target.project_name)

db.close()
