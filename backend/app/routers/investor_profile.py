"""Investor profile endpoints — create, read, update, skip wizard."""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.database import get_db
from app.models.investor_profile import InvestorProfile
from app.models.user import User
from app.schemas.investor_profile import InvestorProfileCreate, InvestorProfileRead
from app.services.profile_service import derive_primary_bias, generate_profile_content

router = APIRouter(prefix="/profile", tags=["profile"])


def _profile_to_read(profile: InvestorProfile) -> InvestorProfileRead:
    """Deserialize JSON fields and return schema."""
    data = InvestorProfileRead.model_validate(profile)
    # Deserialize JSON text fields
    if isinstance(profile.scenario_predictions, str):
        try:
            data.scenario_predictions = json.loads(profile.scenario_predictions)
        except Exception:
            data.scenario_predictions = None
    if isinstance(profile.bias_fingerprint, str):
        try:
            data.bias_fingerprint = json.loads(profile.bias_fingerprint)
        except Exception:
            data.bias_fingerprint = None
    return data


@router.get("", response_model=InvestorProfileRead)
def get_profile(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    profile = db.query(InvestorProfile).filter(InvestorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="No investor profile found. Complete the wizard to create one.")
    return _profile_to_read(profile)


@router.post("", response_model=InvestorProfileRead)
def create_profile(
    data: InvestorProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    answers = data.model_dump()
    answers["overconfidence_bias"] = answers.get("overconfidence_bias") or "medium"
    answers["primary_bias"] = derive_primary_bias(answers)

    content = generate_profile_content(answers)

    existing = db.query(InvestorProfile).filter(InvestorProfile.user_id == current_user.id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Profile already exists. Use PUT /profile to update.")

    profile = InvestorProfile(
        user_id=current_user.id,
        investment_style=answers["investment_style"],
        time_horizon=answers["time_horizon"],
        loss_aversion=answers["loss_aversion"],
        risk_capacity=answers["risk_capacity"],
        experience_level=answers["experience_level"],
        overconfidence_bias=answers["overconfidence_bias"],
        primary_bias=answers["primary_bias"],
        archetype_label=content["archetype_label"],
        behavioral_summary=content["behavioral_summary"],
        scenario_predictions=json.dumps(content["scenario_predictions"]),
        bias_fingerprint=json.dumps(content["bias_fingerprint"]),
        wizard_completed=True,
        wizard_skipped=False,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return _profile_to_read(profile)


@router.put("", response_model=InvestorProfileRead)
def update_profile(
    data: InvestorProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = db.query(InvestorProfile).filter(InvestorProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="No profile found. Use POST /profile to create one.")

    answers = data.model_dump()
    answers["overconfidence_bias"] = answers.get("overconfidence_bias") or "medium"
    answers["primary_bias"] = derive_primary_bias(answers)

    content = generate_profile_content(answers)

    profile.investment_style = answers["investment_style"]
    profile.time_horizon = answers["time_horizon"]
    profile.loss_aversion = answers["loss_aversion"]
    profile.risk_capacity = answers["risk_capacity"]
    profile.experience_level = answers["experience_level"]
    profile.overconfidence_bias = answers["overconfidence_bias"]
    profile.primary_bias = answers["primary_bias"]
    profile.archetype_label = content["archetype_label"]
    profile.behavioral_summary = content["behavioral_summary"]
    profile.scenario_predictions = json.dumps(content["scenario_predictions"])
    profile.bias_fingerprint = json.dumps(content["bias_fingerprint"])
    profile.wizard_completed = True
    profile.wizard_skipped = False
    profile.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(profile)
    return _profile_to_read(profile)


@router.post("/skip", response_model=InvestorProfileRead)
def skip_wizard(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    profile = db.query(InvestorProfile).filter(InvestorProfile.user_id == current_user.id).first()
    if not profile:
        profile = InvestorProfile(
            user_id=current_user.id,
            wizard_completed=False,
            wizard_skipped=True,
        )
        db.add(profile)
    else:
        profile.wizard_skipped = True
        profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(profile)
    return _profile_to_read(profile)
