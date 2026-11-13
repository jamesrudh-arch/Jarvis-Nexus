"""Database engine, session factory, and PostgreSQL/SQLite initialization."""
from __future__ import annotations

from typing import Any, Dict, Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


connect_args: Dict[str, Any] = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
elif settings.is_postgres:
    # Disable server-side prepared statements by default so Supabase Supavisor
    # Transaction Pooler (:6543, IPv4) and PgBouncer work out of the box.
    connect_args = {"prepare_threshold": None}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    future=True,
)

if settings.DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def init_database_extensions() -> bool:
    """Enable pgvector on PostgreSQL when available; return whether pgvector is active."""
    if not settings.is_postgres:
        return False
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        return True
    except Exception:
        return False


def migrate_legacy_memory_embedding_column(target_engine=None) -> bool:
    """Gate 0 Item 5: rename the legacy memory_records.embedding_json column to
    lexical_fingerprint_json on databases created before the rename.

    Best-effort and idempotent: on a fresh database (create_all already made
    the new column) or an already-migrated one, the ALTER simply fails and is
    swallowed. Works for both SQLite (>= 3.25) and PostgreSQL. Returns True
    when a rename actually happened.
    """
    eng = target_engine or engine
    try:
        with eng.begin() as conn:
            conn.execute(text(
                "ALTER TABLE memory_records RENAME COLUMN embedding_json TO lexical_fingerprint_json"
            ))
        return True
    except Exception:
        return False


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
