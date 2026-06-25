"""Pydantic request/response models for transactions.

Sign convention: purchases are negative, refunds/income positive.
cashback_amount is computed by the backend, never sent by the client.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class TransactionCreate(BaseModel):
    transaction_date: date
    merchant: Optional[str] = None
    category: Optional[str] = None
    amount: Decimal
    profile_id: str
    # Exactly one payment source: a credit card OR an account.
    credit_card_id: Optional[str] = None
    account_id: Optional[str] = None
    cashback_rate: Optional[Decimal] = None
    is_paid_back: bool = False  # a person reimbursed you
    paid_back_date: Optional[date] = None
    paid_to_bank: bool = False  # you paid the card issuer
    notes: Optional[str] = None


class TransactionUpdate(BaseModel):
    transaction_date: Optional[date] = None
    merchant: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[Decimal] = None
    profile_id: Optional[str] = None
    credit_card_id: Optional[str] = None
    account_id: Optional[str] = None
    cashback_rate: Optional[Decimal] = None
    is_paid_back: Optional[bool] = None
    paid_back_date: Optional[date] = None
    paid_to_bank: Optional[bool] = None
    reimbursement_allocated: Optional[bool] = None
    notes: Optional[str] = None


class Transaction(BaseModel):
    id: str
    transaction_date: date
    merchant: Optional[str] = None
    category: Optional[str] = None
    amount: Decimal
    profile_id: str
    credit_card_id: Optional[str] = None
    account_id: Optional[str] = None
    cashback_rate: Optional[Decimal] = None
    cashback_amount: Optional[Decimal] = None
    is_paid_back: bool
    paid_back_date: Optional[date] = None
    paid_to_bank: bool = False
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
