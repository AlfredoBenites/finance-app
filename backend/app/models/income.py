"""Pydantic models for income."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class IncomeCreate(BaseModel):
    income_date: date
    source: str
    category: Optional[str] = None
    amount: Decimal
    account_id: str  # required: which account the money landed in
    notes: Optional[str] = None
    bucket_allocated: bool = False


class IncomeUpdate(BaseModel):
    income_date: Optional[date] = None
    source: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[Decimal] = None
    account_id: Optional[str] = None
    notes: Optional[str] = None
    bucket_allocated: Optional[bool] = None


class Income(BaseModel):
    id: str
    income_date: date
    source: str
    category: Optional[str] = None
    amount: Decimal
    account_id: Optional[str] = None
    notes: Optional[str] = None
    bucket_allocated: bool = False
    allocated_bucket_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
