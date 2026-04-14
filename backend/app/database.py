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
        if "portfolio_id" not in stock_columns:
            conn.execute(text("ALTER TABLE stocks ADD COLUMN portfolio_id INTEGER REFERENCES portfolios(id)"))
            conn.commit()

        # --- Thesis columns ---
        result = conn.execute(text("PRAGMA table_info(theses)"))
        thesis_columns = [row[1] for row in result.fetchall()]
        for col, default in [("importance", "'standard'"), ("frozen", "0"), ("source", "'ai'"), ("conviction", "NULL"), ("sort_order", "0"), ("last_confirmed", "NULL")]:
            if col not in thesis_columns:
                conn.execute(text(f"ALTER TABLE theses ADD COLUMN {col} TEXT DEFAULT {default}"))
                conn.commit()

        # --- Stocks watchlist column ---
        result = conn.execute(text("PRAGMA table_info(stocks)"))
        stock_cols2 = [row[1] for row in result.fetchall()]
        if "watchlist" not in stock_cols2:
            conn.execute(text("ALTER TABLE stocks ADD COLUMN watchlist TEXT DEFAULT 'false'"))
            conn.commit()

        # --- Briefings columns ---
        result = conn.execute(text("PRAGMA table_info(briefings)"))
        briefing_columns = [row[1] for row in result.fetchall()]
        if "user_id" not in briefing_columns:
            conn.execute(text("ALTER TABLE briefings ADD COLUMN user_id INTEGER REFERENCES users(id)"))
            conn.commit()
        if "portfolio_id" not in briefing_columns:
            conn.execute(text("ALTER TABLE briefings ADD COLUMN portfolio_id INTEGER REFERENCES portfolios(id)"))
            conn.commit()

        # --- Chat messages columns ---
        result = conn.execute(text("PRAGMA table_info(chat_messages)"))
        chat_columns = [row[1] for row in result.fetchall()]
        if "user_id" not in chat_columns:
            conn.execute(text("ALTER TABLE chat_messages ADD COLUMN user_id INTEGER REFERENCES users(id)"))
            conn.commit()

        # --- Share tokens table ---
        result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='share_tokens'"))
        if not result.fetchone():
            conn.execute(text("""
                CREATE TABLE share_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    token VARCHAR(36) UNIQUE NOT NULL,
                    stock_id INTEGER NOT NULL REFERENCES stocks(id),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_share_tokens_token ON share_tokens (token)"))
            conn.commit()

        # --- Users screener_dismissed column ---
        result = conn.execute(text("PRAGMA table_info(users)"))
        user_columns = [row[1] for row in result.fetchall()]
        if "screener_dismissed" not in user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN screener_dismissed TEXT"))
            conn.commit()

        # --- Migrate stocks unique constraint ---
        _migrate_stocks_unique_constraint(conn)

        # --- Create default user and assign orphaned data ---
        _ensure_default_user(conn)

        # --- Create default portfolios and assign stocks ---
        _ensure_default_portfolios(conn)

        # --- InvestorProfile table ---
        result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='investor_profiles'"))
        if not result.fetchone():
            conn.execute(text("""
                CREATE TABLE investor_profiles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
                    investment_style VARCHAR(20),
                    time_horizon VARCHAR(20),
                    loss_aversion VARCHAR(20),
                    risk_capacity VARCHAR(20),
                    experience_level VARCHAR(20),
                    overconfidence_bias VARCHAR(20),
                    primary_bias VARCHAR(50),
                    archetype_label VARCHAR(100),
                    behavioral_summary TEXT,
                    scenario_predictions TEXT,
                    bias_fingerprint TEXT,
                    wizard_completed BOOLEAN DEFAULT 0 NOT NULL,
                    wizard_skipped BOOLEAN DEFAULT 0 NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            """))
            conn.commit()


def _migrate_stocks_unique_constraint(conn):
    """Replace old UNIQUE(ticker) or UNIQUE(user_id, ticker) with UNIQUE(portfolio_id, ticker)."""
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
        if col_names == ["ticker"] or col_names == ["user_id", "ticker"]:
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
            portfolio_id INTEGER REFERENCES portfolios(id),
            ticker VARCHAR(10) NOT NULL,
            name VARCHAR(255) NOT NULL,
            logo_url VARCHAR(500),
            UNIQUE(portfolio_id, ticker)
        )
    """))
    conn.execute(text("INSERT INTO stocks (id, user_id, portfolio_id, ticker, name, logo_url) SELECT id, user_id, portfolio_id, ticker, name, logo_url FROM _stocks_old"))
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

    for table in ("stocks", "briefings", "chat_messages"):
        conn.execute(text(f"UPDATE {table} SET user_id = :uid WHERE user_id IS NULL"), {"uid": default_uid})
    conn.commit()


def _ensure_default_portfolios(conn):
    """Create a default portfolio for each user that doesn't have one, and assign orphaned stocks."""
    users = conn.execute(text("SELECT id FROM users")).fetchall()
    for (user_id,) in users:
        existing = conn.execute(
            text("SELECT id FROM portfolios WHERE user_id = :uid AND is_default = 1"),
            {"uid": user_id},
        ).fetchone()
        if existing:
            portfolio_id = existing[0]
        else:
            conn.execute(
                text("INSERT INTO portfolios (user_id, name, is_default, created_at) VALUES (:uid, 'Default', 1, datetime('now'))"),
                {"uid": user_id},
            )
            conn.commit()
            row = conn.execute(
                text("SELECT id FROM portfolios WHERE user_id = :uid AND is_default = 1"),
                {"uid": user_id},
            ).fetchone()
            portfolio_id = row[0]

        # Assign stocks without a portfolio to the default one
        conn.execute(
            text("UPDATE stocks SET portfolio_id = :pid WHERE user_id = :uid AND portfolio_id IS NULL"),
            {"pid": portfolio_id, "uid": user_id},
        )
        # Assign briefings without a portfolio to the default one
        conn.execute(
            text("UPDATE briefings SET portfolio_id = :pid WHERE user_id = :uid AND portfolio_id IS NULL"),
            {"pid": portfolio_id, "uid": user_id},
        )
    conn.commit()


def create_all_tables():
    import app.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _run_migrations()
