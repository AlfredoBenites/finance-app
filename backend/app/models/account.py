"""Pydantic request/response models for accounts."""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class AccountCreate(BaseModel):
    name: str
    account_type: Optional[str] = None
    institution: Optional[str] = None
    balance: Decimal = Decimal("0")
    is_asset: bool = True
    is_active: bool = True


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    account_type: Optional[str] = None
    institution: Optional[str] = None
    balance: Optional[Decimal] = None
    is_asset: Optional[bool] = None
    is_active: Optional[bool] = None
    show_in_buckets: Optional[bool] = None


class Account(BaseModel):
    id: str
    name: str
    account_type: Optional[str] = None
    institution: Optional[str] = None
    balance: Decimal
    is_asset: bool
    is_active: bool
    # When true, the account appears on the Buckets page even with no buckets yet.
    show_in_buckets: bool = False
    created_at: datetime
    updated_at: datetime
