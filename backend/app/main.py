"""FastAPI entry point.

Run from the backend/ folder:
    uvicorn app.main:app --reload
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    accounts,
    buckets,
    credit_cards,
    dashboard,
    profiles,
    transactions,
)

app = FastAPI(title="Finance Tracker API")

# Allow the local Vite dev server to call the API during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profiles.router)
app.include_router(credit_cards.router)
app.include_router(transactions.router)
app.include_router(buckets.router)
app.include_router(accounts.router)
app.include_router(dashboard.router)


@app.get("/health")
def health():
    return {"status": "ok"}
