"""Background scheduler for automatic portfolio evaluation."""

import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _run_daily_evaluation(session_factory):
    """Job function: evaluate each user's stocks using their investor profile."""
    from app.models.user import User
    from app.core.utils import get_investor_profile
    from app.services.evaluation_service import evaluate_all_stocks

    logger.info("scheduler: starting daily evaluation at %s", datetime.utcnow().isoformat())
    db = session_factory()
    try:
        users = db.query(User).all()
        total = {"evaluated": [], "skipped": [], "errors": {}}
        for user in users:
            profile = get_investor_profile(user)
            summary = evaluate_all_stocks(db, user_id=user.id, investor_profile=profile)
            total["evaluated"].extend(summary["evaluated"])
            total["skipped"].extend(summary["skipped"])
            total["errors"].update(summary["errors"])
        logger.info(
            "scheduler: daily evaluation complete — evaluated=%s, skipped=%s, errors=%s",
            len(total["evaluated"]),
            len(total["skipped"]),
            list(total["errors"].keys()),
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
