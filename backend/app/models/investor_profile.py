from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from app.database import Base


class InvestorProfile(Base):
    __tablename__ = "investor_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)

    # Raw answers from wizard
    investment_style = Column(String(20))   # value | growth | dividend | blend
    time_horizon = Column(String(20))        # short | medium | long
    loss_aversion = Column(String(20))       # low | medium | high
    risk_capacity = Column(String(20))       # low | medium | high
    experience_level = Column(String(20))    # beginner | intermediate | advanced
    overconfidence_bias = Column(String(20)) # low | medium | high
    primary_bias = Column(String(50))        # anchoring | recency | overconfidence | loss_aversion | none

    # AI-generated fields
    archetype_label = Column(String(100))
    behavioral_summary = Column(Text)
    scenario_predictions = Column(Text)  # JSON list
    bias_fingerprint = Column(Text)      # JSON dict

    # Wizard state
    wizard_completed = Column(Boolean, default=False, nullable=False)
    wizard_skipped = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="investor_profile")
