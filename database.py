import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase


class Base(DeclarativeBase):
    pass


def get_database_url() -> str:
    """
    Uses Supabase Postgres through DATABASE_URL.
    Falls back to local SQLite only if DATABASE_URL is missing.
    """
    return os.getenv("DATABASE_URL", "sqlite:///inorganic_growth_os.db")


DATABASE_URL = get_database_url()

connect_args = {}

if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}


engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    connect_args=connect_args,
)


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


def init_db():
    """
    Creates database tables based on models.py.
    We will create models.py in the next step.
    """
    from models import (
        User,
        Target,
        FinancialSnapshot,
        Milestone,
        Interaction,
        ActionItem,
        StageChangeLog,
        LookupValue,
    )

    Base.metadata.create_all(bind=engine)


def get_session():
    return SessionLocal()
