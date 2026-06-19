"""Pydantic request/response models for credit cards."""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class CreditCardCreate(BaseModel):
    """Fields the client sends when creating a card."""
    name: str
    issuer: Optional[str] = None
    last_four: Optional[str] = None
    credit_limit: Optional[Decimal] = None
    default_cashback_rate: Optional[Decimal] = None
    color: Optional[str] = None
    due_day: Optional[int] = None
    is_active: bool = True


class CreditCardUpdate(BaseModel):
    """Fields the client may send when updating a card. All optional."""
    name: Optional[str] = None
    issuer: Optional[str] = None
    last_four: Optional[str] = None
    credit_limit: Optional[Decimal] = None
    default_cashback_rate: Optional[Decimal] = None
    color: Optional[str] = None
    due_day: Optional[int] = None
    is_active: Optional[bool] = None


class CreditCard(BaseModel):
    """A credit card as returned to the client."""
    id: str
    name: str
    issuer: Optional[str] = None
    last_four: Optional[str] = None
    credit_limit: Optional[Decimal] = None
    default_cashback_rate: Optional[Decimal] = None
    color: Optional[str] = None
    due_day: Optional[int] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
