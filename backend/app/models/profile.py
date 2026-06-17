"""Pydantic request/response models for profiles."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ProfileCreate(BaseModel):
    """Fields the client sends when creating a profile."""
    name: str
    color: Optional[str] = None
    avatar_initials: Optional[str] = None
    is_active: bool = True


class ProfileUpdate(BaseModel):
    """Fields the client may send when updating a profile. All optional."""
    name: Optional[str] = None
    color: Optional[str] = None
    avatar_initials: Optional[str] = None
    is_active: Optional[bool] = None


class Profile(BaseModel):
    """A profile as returned to the client."""
    id: str
    name: str
    color: Optional[str] = None
    avatar_initials: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
