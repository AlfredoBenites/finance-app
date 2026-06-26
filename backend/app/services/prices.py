"""Fetch live prices: Finnhub for stocks, CoinGecko for crypto (free, no key).

Returns None on any failure so callers can fall back to a manual price and never
crash on a flaky/rate-limited API."""
import httpx

from app.config import settings

# CoinGecko's API uses coin *ids*, not tickers. Map the common ones; otherwise
# fall back to the lowercased symbol (works for many: "solana", "cardano", ...).
CRYPTO_IDS = {
    "BTC": "bitcoin", "ETH": "ethereum", "DOGE": "dogecoin", "SOL": "solana",
    "ADA": "cardano", "XRP": "ripple", "LTC": "litecoin", "DOT": "polkadot",
    "AVAX": "avalanche-2", "LINK": "chainlink", "MATIC": "matic-network",
    "SHIB": "shiba-inu", "BCH": "bitcoin-cash", "USDC": "usd-coin", "USDT": "tether",
    "XLM": "stellar", "UNI": "uniswap", "ATOM": "cosmos", "ETC": "ethereum-classic",
}


def fetch_stock_price(symbol):
    """Current price for a stock/ETF ticker via Finnhub. None if unavailable."""
    if not settings.finnhub_api_key:
        return None
    try:
        r = httpx.get(
            "https://finnhub.io/api/v1/quote",
            params={"symbol": symbol.upper(), "token": settings.finnhub_api_key},
            timeout=8,
        )
        c = r.json().get("c")
        return float(c) if c else None  # Finnhub returns c=0 for unknown symbols
    except Exception:
        return None


def fetch_crypto_prices(symbols):
    """Map symbol -> USD price for a batch of crypto symbols (one CoinGecko call)."""
    if not symbols:
        return {}
    ids = {s: CRYPTO_IDS.get(s.upper(), s.lower()) for s in symbols}
    try:
        r = httpx.get(
            "https://api.coingecko.com/api/v3/simple/price",
            params={"ids": ",".join(sorted(set(ids.values()))), "vs_currencies": "usd"},
            timeout=8,
        )
        data = r.json()
        return {s: (float(data[cid]["usd"]) if data.get(cid, {}).get("usd") is not None else None)
                for s, cid in ids.items()}
    except Exception:
        return {s: None for s in symbols}
