"""CRUD for investment holdings + a price refresh. Scoped to the logged-in user."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.database import supabase
from app.models.holding import Holding, HoldingCreate, HoldingUpdate
from app.services import prices

router = APIRouter(prefix="/api/holdings", tags=["holdings"])

TABLE = "holdings"


@router.get("", response_model=list[Holding])
def list_holdings(user_id: str = Depends(get_current_user_id)):
    return (
        supabase.table(TABLE).select("*").eq("owner_id", user_id).order("created_at").execute().data
    )


@router.post("", response_model=Holding, status_code=201)
def create_holding(payload: HoldingCreate, user_id: str = Depends(get_current_user_id)):
    data = payload.model_dump(mode="json")
    data["owner_id"] = user_id
    return supabase.table(TABLE).insert(data).execute().data[0]


@router.post("/refresh-prices")
def refresh_prices(user_id: str = Depends(get_current_user_id)):
    """Fetch current prices for all holdings and store them (last_price)."""
    holdings = supabase.table(TABLE).select("id, symbol, kind").eq("owner_id", user_id).execute().data
    crypto = {h["symbol"] for h in holdings if h.get("kind") == "crypto"}
    crypto_prices = prices.fetch_crypto_prices(list(crypto))
    now = datetime.now(timezone.utc).isoformat()
    updated = 0
    for h in holdings:
        price = crypto_prices.get(h["symbol"]) if h.get("kind") == "crypto" else prices.fetch_stock_price(h["symbol"])
        if price is not None:
            supabase.table(TABLE).update({"last_price": str(price), "price_updated_at": now}).eq(
                "id", h["id"]
            ).eq("owner_id", user_id).execute()
            updated += 1
    return {"ok": True, "updated": updated, "total": len(holdings)}


@router.put("/{holding_id}", response_model=Holding)
def update_holding(holding_id: str, payload: HoldingUpdate, user_id: str = Depends(get_current_user_id)):
    changes = payload.model_dump(mode="json", exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = supabase.table(TABLE).update(changes).eq("id", holding_id).eq("owner_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Holding not found")
    return result.data[0]


@router.delete("/{holding_id}", status_code=204)
def delete_holding(holding_id: str, user_id: str = Depends(get_current_user_id)):
    result = supabase.table(TABLE).delete().eq("id", holding_id).eq("owner_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Holding not found")
    return None
