"""Pydantic request/response models for buckets."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class BucketCreate(BaseModel):
    name: str
    target_amount: Optional[Decimal] = None
    current_amount: Decimal = Decimal("0")
    due_date: Optional[date] = None
    category: Optional[str] = None
    notes: Optional[str] = None
    credit_card_id: Optional[str] = None
    account_id: Optional[str] = None
    is_active: bool = True
    is_completed: bool = False
    kind: str = "set_aside"  # spendable | set_aside | not_mine


class BucketUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[Decimal] = None
    current_amount: Optional[Decimal] = None
    due_date: Optional[date] = None
    category: Optional[str] = None
    notes: Optional[str] = None
    credit_card_id: Optional[str] = None
    account_id: Optional[str] = None
    is_active: Optional[bool] = None
    is_completed: Optional[bool] = None
    kind: Optional[str] = None


class Bucket(BaseModel):
    id: str
    name: str
    target_amount: Optional[Decimal] = None
    current_amount: Decimal
    due_date: Optional[date] = None
    category: Optional[str] = None
    notes: Optional[str] = None
    credit_card_id: Optional[str] = None
    account_id: Optional[str] = None
    is_active: bool
    is_completed: bool
    kind: str = "set_aside"
    created_at: datetime
    updated_at: datetime
