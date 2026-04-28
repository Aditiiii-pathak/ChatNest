"""
SQLAlchemy database engine, session factory, and declarative base.

Supports both SQLite (dev) and PostgreSQL (prod) via DATABASE_URL.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import DATABASE_URL

# SQLite needs check_same_thread=False for FastAPI's threaded request model.
connect_args: dict = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()