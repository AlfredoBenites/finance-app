"""FastAPI entry point.

Run from the backend/ folder:
    uvicorn app.main:app --reload
"""
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import get_current_user
from app.routers import (
    accounts,
    buckets,
    cashback_rules,
    categories,
    credit_cards,
    dashboard,
    holdings,
    income,
    profiles,
    shares,
    transaction_groups,
    transactions,
)

app = FastAPI(title="Finance Tracker API")

# Allow the local Vite dev server to call the API during development.
# Regex covers localhost/127.0.0.1 on ANY port, so a Vite port other than 5173
# (e.g. 5174 when 5173 is taken) won't be blocked by CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profiles.router)
app.include_router(credit_cards.router)
app.include_router(transactions.router)
app.include_router(transaction_groups.router)
app.include_router(buckets.router)
app.include_router(accounts.router)
app.include_router(dashboard.router)
app.include_router(shares.router)
app.include_router(cashback_rules.router)
app.include_router(categories.router)
app.include_router(income.router)
app.include_router(holdings.router)


@app.get("/")
def root():
    """Friendly landing info so the bare URL isn't a confusing 404."""
    return {
        "service": "Finance Tracker API",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/me")
def me(user=Depends(get_current_user)):
    """Returns the logged-in user. Proves the auth token round-trips."""
    return {"id": user.id, "email": user.email}
