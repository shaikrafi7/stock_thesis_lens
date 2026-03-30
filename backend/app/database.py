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
        return

    with engine.connect() as conn:
        # --- Evaluations columns ---
        result = conn.execute(text("PRAGMA table_info(evaluations)"))
        columns = [row[1] for row in result.fetchall()]
        for col in ("broken_points", "confirmed_points", "frozen_breaks"):
            if col not in columns:
                conn.execute(text(f"ALTER TABLE evaluations ADD COLUMN {col} TEXT"))
                conn.commit()

        # --- Stocks columns ---
        result = conn.execute(text("PRAGMA table_info(stocks)"))
        stock_columns = [row[1] for row in result.fetchall()]
        if "logo_url" not in stock_columns:
            conn.execute(text("ALTER TABLE stocks ADD COLUMN logo_url TEXT"))
            conn.commit()
        if "user_id" not in stock_columns:
            conn.execute(text("ALTER TABLE stocks ADD COLUMN user_id INTEGER REFERENCES users(id)"))
            conn.commit()

        # --- Thesis columns ---
        result = conn.execute(text("PRAGMA table_info(theses)"))
        thesis_columns = [row[1] for row in result.fetchall()]
        for col, default in [("importance", "'standard'"), ("frozen", "0"), ("source", "'ai'")]:
            if col not in thesis_columns:
                conn.execute(text(f"ALTER TABLE theses ADD COLUMN {col} TEXT DEFAULT {default}"))
                conn.commit()

        # --- Briefings columns ---
        result = conn.execute(text("PRAGMA table_info(briefings)"))
        briefing_columns = [row[1] for row in result.fetchall()]
        if "user_id" not in briefing_columns:
            conn.execute(text("ALTER TABLE briefings ADD COLUMN user_id INTEGER REFERENCES users(id)"))
            conn.commit()

        # --- Chat messages columns ---
        result = conn.execute(text("PRAGMA table_info(chat_messages)"))
        chat_columns = [row[1] for row in result.fetchall()]
        if "user_id" not in chat_columns:
            conn.execute(text("ALTER TABLE chat_messages ADD COLUMN user_id INTEGER REFERENCES users(id)"))
            conn.commit()

        # --- Fix stocks table: replace old UNIQUE(ticker) with UNIQUE(user_id, ticker) ---
        _migrate_stocks_unique_constraint(conn)

        # --- Create default user and assign orphaned data ---
        _ensure_default_user(conn)


def _migrate_stocks_unique_constraint(conn):
    """Replace old UNIQUE(ticker) with UNIQUE(user_id, ticker) by recreating the table."""
    result = conn.execute(text("PRAGMA index_list(stocks)"))
    indexes = result.fetchall()
    needs_migration = False
    for idx in indexes:
        idx_name = idx[1]
        idx_unique = idx[2]
        if not idx_unique:
            continue
        idx_cols = conn.execute(text(f"PRAGMA index_info('{idx_name}')")).fetchall()
        col_names = [c[2] for c in idx_cols]
        # Single-column unique on just ticker (not the composite user_id+ticker)
        if col_names == ["ticker"]:
            needs_migration = True
            break

    if not needs_migration:
        return

    conn.execute(text("PRAGMA foreign_keys = OFF"))
    conn.execute(text("ALTER TABLE stocks RENAME TO _stocks_old"))
    conn.execute(text("""
        CREATE TABLE stocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id),
            ticker VARCHAR(10) NOT NULL,
            name VARCHAR(255) NOT NULL,
            logo_url VARCHAR(500),
            UNIQUE(user_id, ticker)
        )
    """))
    conn.execute(text("INSERT INTO stocks SELECT id, user_id, ticker, name, logo_url FROM _stocks_old"))
    conn.execute(text("DROP TABLE _stocks_old"))
    conn.execute(text("PRAGMA foreign_keys = ON"))
    conn.commit()


def _ensure_default_user(conn):
    """Create a default user for existing data that has no user_id."""
    from app.core.auth import hash_password

    row = conn.execute(text("SELECT id FROM users WHERE email = 'default@thesisarc.local'")).fetchone()
    if row:
        default_uid = row[0]
    else:
        conn.execute(text(
            "INSERT INTO users (email, username, hashed_password, created_at) "
            "VALUES ('default@thesisarc.local', 'default', :pw, datetime('now'))"
        ), {"pw": hash_password("default")})
        conn.commit()
        row = conn.execute(text("SELECT id FROM users WHERE email = 'default@thesisarc.local'")).fetchone()
        default_uid = row[0]

    # Assign orphaned records to the default user
    for table in ("stocks", "briefings", "chat_messages"):
        conn.execute(text(f"UPDATE {table} SET user_id = :uid WHERE user_id IS NULL"), {"uid": default_uid})
    conn.commit()


def create_all_tables():
    import app.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _run_migrations()
