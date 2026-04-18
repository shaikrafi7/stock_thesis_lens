# ThesisArc backend
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import create_all_tables, SessionLocal
from app.core.config import settings
from app.routers import auth, stocks, thesis, evaluate, market_data, portfolio, portfolios, investor_profile, share, audit_log
from app.services.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_all_tables()
    if settings.SCHEDULER_ENABLED.lower() == "true":
        start_scheduler(SessionLocal)
    yield
    stop_scheduler()


app = FastAPI(title="STARC: Stock Thesis Arc", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(stocks.router)
app.include_router(thesis.router)
app.include_router(evaluate.router)
app.include_router(market_data.router)
app.include_router(portfolio.router)
app.include_router(portfolios.router)
app.include_router(investor_profile.router)
app.include_router(share.router)
app.include_router(audit_log.router)


@app.get("/health")
def health():
    return {"status": "ok"}
