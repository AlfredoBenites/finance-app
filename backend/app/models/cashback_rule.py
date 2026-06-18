"""Pydantic models for per-category cashback rules."""
from decimal import Decimal

from pydantic import BaseModel


class CashbackRuleCreate(BaseModel):
    category: str
    rate: Decimal


class CashbackRule(BaseModel):
    id: str
    card_id: str
    category: str
    rate: Decimal
