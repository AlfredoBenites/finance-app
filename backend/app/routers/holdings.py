"""CRUD for investment holdings + a price refresh. Scoped to the logged-in user."""
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.database import supabase
from app.models.holding import (
    Holding,
    HoldingBuy,
    HoldingCreate,
    HoldingSell,
    HoldingUpdate,
    InvestmentTransaction,
)
from app.services import prices
from app.services.money_log import log_move

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


@router.get("/transactions", response_model=list[InvestmentTransaction])
def list_investment_transactions(user_id: str = Depends(get_current_user_id)):
    """Buy/sell history, newest first."""
    return (
        supabase.table("investment_transactions")
        .select("*")
        .eq("owner_id", user_id)
        .order("traded_on", desc=True)
        .order("created_at", desc=True)
        .execute()
        .data
    )


@router.post("/buy", response_model=Holding)
def buy_holding(payload: HoldingBuy, user_id: str = Depends(get_current_user_id)):
    """Buy shares with an account's buying power: add the shares to a holding
    (creating it if new), subtract the cost from the account's cash, and log the
    purchase. You can only buy with money already sitting in the account."""
    if payload.shares <= 0:
        raise HTTPException(status_code=400, detail="Shares must be positive.")
    if payload.amount is None and payload.price is None:
        raise HTTPException(status_code=400, detail="Enter a price per share or a total cost.")
    # The exact total wins when given (brokerages round the average price, so
    # shares x price is off by a cent); otherwise derive it from shares x price.
    if payload.amount is not None:
        amount = payload.amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        price = payload.price if payload.price is not None else (amount / payload.shares)
    else:
        price = payload.price
        amount = (payload.shares * price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if price < 0 or amount < 0:
        raise HTTPException(status_code=400, detail="Price and total can't be negative.")

    acc = (
        supabase.table("accounts")
        .select("id, name, balance")
        .eq("id", payload.account_id)
        .eq("owner_id", user_id)
        .execute()
        .data
    )
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    balance = Decimal(str(acc[0]["balance"]))
    if amount > balance:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough buying power (${balance}) in {acc[0]['name']}. Transfer cash into it first.",
        )

    symbol = payload.symbol.strip().upper()
    existing = (
        supabase.table(TABLE)
        .select("*")
        .eq("owner_id", user_id)
        .eq("account_id", payload.account_id)
        .eq("symbol", symbol)
        .eq("kind", payload.kind)
        .execute()
        .data
    )
    if existing:
        holding = existing[0]
        new_shares = Decimal(str(holding["shares"])) + payload.shares
        supabase.table(TABLE).update({"shares": str(new_shares)}).eq("id", holding["id"]).eq(
            "owner_id", user_id
        ).execute()
        holding_id = holding["id"]
    else:
        # Seed last_price with the price paid so the new holding has a value right
        # away (until the next Refresh prices).
        now = datetime.now(timezone.utc).isoformat()
        created = (
            supabase.table(TABLE)
            .insert(
                {
                    "owner_id": user_id,
                    "account_id": payload.account_id,
                    "symbol": symbol,
                    "kind": payload.kind,
                    "category": payload.category,
                    "shares": str(payload.shares),
                    "last_price": str(price),
                    "price_updated_at": now,
                }
            )
            .execute()
            .data[0]
        )
        holding_id = created["id"]

    supabase.table("accounts").update({"balance": str(balance - amount)}).eq(
        "id", payload.account_id
    ).eq("owner_id", user_id).execute()

    traded_on = payload.traded_on or date.today().isoformat()
    supabase.table("investment_transactions").insert(
        {
            "owner_id": user_id,
            "account_id": payload.account_id,
            "holding_id": holding_id,
            "symbol": symbol,
            "kind": payload.kind,
            "type": "buy",
            "shares": str(payload.shares),
            "price": str(price),
            "amount": str(amount),
            "traded_on": traded_on,
            "notes": payload.notes,
        }
    ).execute()

    # Also record the cash leaving the account so it shows in Accounts history.
    log_move(user_id, "account", amount, f"Bought {payload.shares} {symbol} · {acc[0]['name']}")

    return supabase.table(TABLE).select("*").eq("id", holding_id).eq("owner_id", user_id).execute().data[0]


@router.post("/sell")
def sell_holding(payload: HoldingSell, user_id: str = Depends(get_current_user_id)):
    """Sell shares of a holding: reduce its shares (deleting it if it hits zero),
    return the proceeds to the holding's account cash, and log the sale."""
    if payload.shares <= 0:
        raise HTTPException(status_code=400, detail="Shares must be positive.")
    if payload.amount is None and payload.price is None:
        raise HTTPException(status_code=400, detail="Enter a price per share or a total.")

    found = (
        supabase.table(TABLE).select("*").eq("id", payload.holding_id).eq("owner_id", user_id).execute().data
    )
    if not found:
        raise HTTPException(status_code=404, detail="Holding not found")
    holding = found[0]
    owned = Decimal(str(holding["shares"]))
    if payload.shares > owned:
        raise HTTPException(status_code=400, detail=f"You only have {owned} shares to sell.")

    if payload.amount is not None:
        amount = payload.amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        price = payload.price if payload.price is not None else (amount / payload.shares)
    else:
        price = payload.price
        amount = (payload.shares * price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if price < 0 or amount < 0:
        raise HTTPException(status_code=400, detail="Price and total can't be negative.")

    traded_on = payload.traded_on or date.today().isoformat()
    # Log first (holding still exists); the FK nulls holding_id if we delete it.
    supabase.table("investment_transactions").insert(
        {
            "owner_id": user_id,
            "account_id": holding["account_id"],
            "holding_id": holding["id"],
            "symbol": holding["symbol"],
            "kind": holding["kind"],
            "type": "sell",
            "shares": str(payload.shares),
            "price": str(price),
            "amount": str(amount),
            "traded_on": traded_on,
            "notes": payload.notes,
        }
    ).execute()

    new_shares = owned - payload.shares
    if new_shares == 0:
        supabase.table(TABLE).delete().eq("id", holding["id"]).eq("owner_id", user_id).execute()
    else:
        supabase.table(TABLE).update({"shares": str(new_shares)}).eq("id", holding["id"]).eq(
            "owner_id", user_id
        ).execute()

    acc = (
        supabase.table("accounts")
        .select("id, name, balance")
        .eq("id", holding["account_id"])
        .eq("owner_id", user_id)
        .execute()
        .data
    )
    if acc:
        supabase.table("accounts").update({"balance": str(Decimal(str(acc[0]["balance"])) + amount)}).eq(
            "id", acc[0]["id"]
        ).eq("owner_id", user_id).execute()
        log_move(user_id, "account", amount, f"Sold {payload.shares} {holding['symbol']} · {acc[0]['name']}")

    return {"ok": True, "shares_left": float(new_shares)}


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
