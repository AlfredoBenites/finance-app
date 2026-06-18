"""CRUD endpoints for income. Scoped to the logged-in user."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user_id
from app.database import supabase
from app.models.income import Income, IncomeCreate, IncomeUpdate

router = APIRouter(prefix="/api/income", tags=["income"])

TABLE = "income"


@router.get("", response_model=list[Income])
def list_income(
    user_id: str = Depends(get_current_user_id),
    year: Optional[int] = Query(default=None, description="Filter by year, e.g. 2026"),
):
    query = supabase.table(TABLE).select("*").eq("owner_id", user_id)
    if year is not None:
        query = query.gte("income_date", f"{year}-01-01").lt(
            "income_date", f"{year + 1}-01-01"
        )
    return query.order("income_date", desc=True).execute().data


@router.post("", response_model=Income, status_code=201)
def create_income(payload: IncomeCreate, user_id: str = Depends(get_current_user_id)):
    data = payload.model_dump(mode="json")
    data["owner_id"] = user_id
    result = supabase.table(TABLE).insert(data).execute()
    return result.data[0]


@router.put("/{income_id}", response_model=Income)
def update_income(
    income_id: str, payload: IncomeUpdate, user_id: str = Depends(get_current_user_id)
):
    changes = payload.model_dump(mode="json", exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        supabase.table(TABLE)
        .update(changes)
        .eq("id", income_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Income not found")
    return result.data[0]


@router.delete("/{income_id}", status_code=204)
def delete_income(income_id: str, user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table(TABLE)
        .delete()
        .eq("id", income_id)
        .eq("owner_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Income not found")
    return None
