"""Tests for briefing cache — thesis_state_hash invalidation."""
import uuid
from app.database import Base, engine
from app.models.stock import Stock
from app.models.thesis import Thesis
from app.models.portfolio import Portfolio
from app.models.user import User
from app.routers.portfolio import _compute_thesis_state_hash
from app.database import SessionLocal


def setup_module(module):
    Base.metadata.create_all(bind=engine)


def _make_user_and_portfolio(db):
    uid = uuid.uuid4().hex[:10]
    u = User(email=f"briefcache_{uid}@test.local", username=f"briefcache_{uid}", hashed_password="x")
    db.add(u)
    db.flush()
    p = Portfolio(user_id=u.id, name="Default", is_default=True)
    db.add(p)
    db.flush()
    return u, p


def test_hash_stable_across_calls():
    db = SessionLocal()
    try:
        u, p = _make_user_and_portfolio(db)
        s = Stock(user_id=u.id, portfolio_id=p.id, ticker="AAA", name="Alpha")
        db.add(s)
        db.flush()
        db.add(Thesis(stock_id=s.id, category="competitive_moat", statement="Moat A", selected=True, frozen=False))
        db.commit()

        h1 = _compute_thesis_state_hash(db, p.id)
        h2 = _compute_thesis_state_hash(db, p.id)
        assert h1 == h2
    finally:
        db.close()


def test_hash_changes_when_thesis_added():
    db = SessionLocal()
    try:
        u, p = _make_user_and_portfolio(db)
        s = Stock(user_id=u.id, portfolio_id=p.id, ticker="BBB", name="Beta")
        db.add(s)
        db.flush()
        db.add(Thesis(stock_id=s.id, category="growth_trajectory", statement="Grow", selected=True, frozen=False))
        db.commit()
        h_before = _compute_thesis_state_hash(db, p.id)

        db.add(Thesis(stock_id=s.id, category="risks", statement="Risk A", selected=True, frozen=False))
        db.commit()
        h_after = _compute_thesis_state_hash(db, p.id)

        assert h_before != h_after
    finally:
        db.close()


def test_hash_changes_when_frozen_toggled():
    db = SessionLocal()
    try:
        u, p = _make_user_and_portfolio(db)
        s = Stock(user_id=u.id, portfolio_id=p.id, ticker="CCC", name="Gamma")
        db.add(s)
        db.flush()
        t = Thesis(stock_id=s.id, category="financial_health", statement="Balance", selected=True, frozen=False)
        db.add(t)
        db.commit()
        h_before = _compute_thesis_state_hash(db, p.id)

        t.frozen = True
        db.commit()
        h_after = _compute_thesis_state_hash(db, p.id)
        assert h_before != h_after
    finally:
        db.close()


def test_hash_changes_when_conviction_flipped():
    db = SessionLocal()
    try:
        u, p = _make_user_and_portfolio(db)
        s = Stock(user_id=u.id, portfolio_id=p.id, ticker="DDD", name="Delta")
        db.add(s)
        db.flush()
        t = Thesis(stock_id=s.id, category="valuation", statement="Cheap", selected=True, frozen=False, conviction=None)
        db.add(t)
        db.commit()
        h_before = _compute_thesis_state_hash(db, p.id)

        t.conviction = "like"
        db.commit()
        h_after = _compute_thesis_state_hash(db, p.id)
        assert h_before != h_after
    finally:
        db.close()
