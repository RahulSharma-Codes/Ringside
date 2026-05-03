from database import init_db, get_session
from models import LookupValue


LOOKUPS = {
    "pipeline_stage": [
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
    ],
    "priority_tier": [
        "Must-Win",
        "Priority 1",
        "Priority 2",
        "Watchlist",
        "On Hold",
        "Dropped",
    ],
    "interaction_type": [
        "Introductory Call",
        "Management Meeting",
        "Banker Update",
        "Internal Discussion",
        "Site Visit",
        "Email Update",
        "Mobile Note",
        "Investment Committee Discussion",
    ],
    "rag_status": [
        "Not Started",
        "Red",
        "Amber",
        "Green",
    ],
    "action_priority": [
        "Critical",
        "High",
        "Medium",
        "Low",
    ],
}


def seed_lookups():
    db = get_session()

    for category, values in LOOKUPS.items():
        for index, value in enumerate(values):
            existing = (
                db.query(LookupValue)
                .filter(
                    LookupValue.category == category,
                    LookupValue.value == value,
                )
                .one_or_none()
            )

            if existing is None:
                db.add(
                    LookupValue(
                        category=category,
                        value=value,
                        sort_order=index,
                    )
                )

    db.commit()
    db.close()


if __name__ == "__main__":
    init_db()
    seed_lookups()
    print("Supabase tables created and lookup values seeded.")
