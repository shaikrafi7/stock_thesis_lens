"""Pytest configuration and shared fixtures."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.core.auth import get_current_user
from app.main import app

# StaticPool ensures all connections share the same in-memory database,
# so tables created in setup_db are visible to the session used by routes.
TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    """Create tables before each test, drop after."""
    import app.models  # noqa: F401 — registers all models with Base
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def test_user(setup_db):
    """Create a test user so auth-protected routes have a principal."""
    from app.models.user import User
    db = TestSessionLocal()
    user = User(email="test@example.com", username="tester", hashed_password="x")
    db.add(user)
    db.commit()
    db.refresh(user)
    try:
        yield user
    finally:
        db.close()


@pytest.fixture
def client(test_user):
    """FastAPI test client with in-memory DB + stub auth returning test_user."""
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: test_user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
