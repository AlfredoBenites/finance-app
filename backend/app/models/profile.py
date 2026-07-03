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
    default_bucket_id: Optional[str] = None
    is_active: Optional[bool] = None
    cashback_to_profile_id: Optional[str] = None


class Profile(BaseModel):
    """A profile as returned to the client."""
    id: str
    name: str
    color: Optional[str] = None
    avatar_initials: Optional[str] = None
    is_active: bool
    is_primary: bool = False
    default_bucket_id: Optional[str] = None
    # When set, this profile's cashback is also credited to the target profile
    # (e.g. the person who actually covers the card). None = keep it here.
    cashback_to_profile_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
