"""Pydantic models for investment holdings."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class HoldingCreate(BaseModel):
    account_id: str
    symbol: str
    kind: str = "stock"  # stock | crypto
    category: Optional[str] = None  # your sub-group, e.g. "Roth IRA" / "Brokerage" / "Crypto"
    shares: Decimal = Decimal("0")
    manual_price: Optional[Decimal] = None  # override the fetched price


class HoldingUpdate(BaseModel):
    account_id: Optional[str] = None
    symbol: Optional[str] = None
    kind: Optional[str] = None
    category: Optional[str] = None
    shares: Optional[Decimal] = None
    manual_price: Optional[Decimal] = None


class Holding(BaseModel):
    id: str
    account_id: str
    symbol: str
    kind: str
    category: Optional[str] = None
    shares: Decimal
    last_price: Optional[Decimal] = None
    manual_price: Optional[Decimal] = None
    price_updated_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class HoldingBuy(BaseModel):
    """Buy shares using an account's buying power (cash)."""
    account_id: str
    symbol: str
    kind: str = "stock"
    category: Optional[str] = None
    shares: Decimal
    price: Decimal  # per-share price paid
    traded_on: Optional[str] = None  # ISO date; defaults to today
    notes: Optional[str] = None


class InvestmentTransaction(BaseModel):
    id: str
    account_id: Optional[str] = None
    holding_id: Optional[str] = None
    symbol: str
    kind: str
    type: str
    shares: Decimal
    price: Decimal
    amount: Decimal
    traded_on: date
    notes: Optional[str] = None
    created_at: datetime
