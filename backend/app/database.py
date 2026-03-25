from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _run_migrations():
    """Add any missing columns to existing tables (SQLite ALTER TABLE is safe to run repeatedly)."""
    if "sqlite" not in settings.DATABASE_URL:
        return  # only needed for SQLite; real DBs use proper migrations

    with engine.connect() as conn:
        # Ensure broken_points / confirmed_points / frozen_breaks columns exist in evaluations
        result = conn.execute(text("PRAGMA table_info(evaluations)"))
        columns = [row[1] for row in result.fetchall()]
        if "broken_points" not in columns:
            conn.execute(text("ALTER TABLE evaluations ADD COLUMN broken_points TEXT"))
            conn.commit()

        if "confirmed_points" not in columns:
            conn.execute(text("ALTER TABLE evaluations ADD COLUMN confirmed_points TEXT"))
            conn.commit()

        if "frozen_breaks" not in columns:
            conn.execute(text("ALTER TABLE evaluations ADD COLUMN frozen_breaks TEXT"))
            conn.commit()

        result = conn.execute(text("PRAGMA table_info(stocks)"))
        stock_columns = [row[1] for row in result.fetchall()]
        if "logo_url" not in stock_columns:
            conn.execute(text("ALTER TABLE stocks ADD COLUMN logo_url TEXT"))
            conn.commit()

        # Thesis model additions
        result = conn.execute(text("PRAGMA table_info(theses)"))
        thesis_columns = [row[1] for row in result.fetchall()]
        if "importance" not in thesis_columns:
            conn.execute(text("ALTER TABLE theses ADD COLUMN importance TEXT DEFAULT 'standard'"))
            conn.commit()
        if "frozen" not in thesis_columns:
            conn.execute(text("ALTER TABLE theses ADD COLUMN frozen BOOLEAN DEFAULT 0"))
            conn.commit()
        if "source" not in thesis_columns:
            conn.execute(text("ALTER TABLE theses ADD COLUMN source TEXT DEFAULT 'ai'"))
            conn.commit()


def create_all_tables():
    import app.models  # noqa: F401 — ensures all models are registered with Base
    Base.metadata.create_all(bind=engine)
    _run_migrations()
