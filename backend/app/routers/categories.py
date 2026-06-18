"""User-managed categories + per-merchant default categories. Owner-scoped."""
from postgrest.exceptions import APIError

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.database import supabase
from app.db_errors import is_unique_violation
from app.models.category import (
    Category,
    CategoryCreate,
    MerchantCategory,
    MerchantCategoryCreate,
)

router = APIRouter(prefix="/api", tags=["categories"])


# ---- categories -------------------------------------------------------------

@router.get("/categories", response_model=list[Category])
def list_categories(user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table("categories").select("*").eq("owner_id", user_id).order("name").execute()
    )
    return result.data


@router.post("/categories", response_model=Category, status_code=201)
def create_category(payload: CategoryCreate, user_id: str = Depends(get_current_user_id)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")
    try:
        result = supabase.table("categories").insert(
            {"owner_id": user_id, "name": name}
        ).execute()
    except APIError as e:
        if is_unique_violation(e):
            raise HTTPException(status_code=409, detail="Category already exists")
        raise
    return result.data[0]


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(category_id: str, user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table("categories")
        .delete()
        .eq("id", category_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Category not found")
    return None


# ---- merchant default categories --------------------------------------------

@router.get("/merchant-categories", response_model=list[MerchantCategory])
def list_merchant_categories(user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table("merchant_categories").select("*").eq("owner_id", user_id).execute()
    )
    return result.data


@router.post("/merchant-categories", response_model=MerchantCategory, status_code=201)
def upsert_merchant_category(
    payload: MerchantCategoryCreate, user_id: str = Depends(get_current_user_id)
):
    """Remember the default category for a merchant (insert or update)."""
    merchant = payload.merchant.strip()
    category = payload.category.strip()
    if not merchant or not category:
        raise HTTPException(status_code=400, detail="Merchant and category are required")

    existing = (
        supabase.table("merchant_categories")
        .select("*")
        .eq("owner_id", user_id)
        .eq("merchant", merchant)
        .execute()
    )
    if existing.data:
        result = (
            supabase.table("merchant_categories")
            .update({"category": category})
            .eq("id", existing.data[0]["id"])
            .eq("owner_id", user_id)
            .execute()
        )
    else:
        result = supabase.table("merchant_categories").insert(
            {"owner_id": user_id, "merchant": merchant, "category": category}
        ).execute()
    return result.data[0]
