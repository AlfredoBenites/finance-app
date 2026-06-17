"""Pydantic models for profile shares."""
from datetime import datetime

from pydantic import BaseModel


class ShareCreate(BaseModel):
    email: str


class Share(BaseModel):
    id: str
    profile_id: str
    shared_with_email: str
    created_at: datetime
