"""Pydantic models for user-managed categories and merchant defaults."""
from pydantic import BaseModel


class CategoryCreate(BaseModel):
    name: str


class Category(BaseModel):
    id: str
    name: str


class MerchantCategoryCreate(BaseModel):
    merchant: str
    category: str


class MerchantCategory(BaseModel):
    id: str
    merchant: str
    category: str
