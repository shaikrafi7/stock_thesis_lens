"""Background scheduler for automatic portfolio evaluation."""

import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _run_daily_evaluation(session_factory):
    """Job function: evaluate all stocks with enough selected theses."""
    from app.services.evaluation_service import evaluate_all_stocks

    logger.info("scheduler: starting daily evaluation at %s", datetime.utcnow().isoformat())
    db = session_factory()
    try:
        summary = evaluate_all_stocks(db)
        logger.info(
            "scheduler: daily evaluation complete — evaluated=%s, skipped=%s, errors=%s",
            summary["evaluated"],
            summary["skipped"],
            list(summary["errors"].keys()),
        )
    except Exception as exc:
        logger.error("scheduler: daily evaluation failed: %s", exc)
    finally:
        db.close()


def start_scheduler(session_factory):
    """Start the background scheduler with daily evaluation at 21:30 UTC (~4:30 PM ET)."""
    global _scheduler
    if _scheduler is not None:
        return

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        _run_daily_evaluation,
        trigger="cron",
        hour=21,
        minute=30,
        args=[session_factory],
        id="daily_evaluation",
        name="Daily portfolio evaluation",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("scheduler: started — daily evaluation scheduled at 21:30 UTC")


def stop_scheduler():
    """Stop the background scheduler."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("scheduler: stopped")
