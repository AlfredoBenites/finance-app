"""Split a group purchase into each participant's share.

Two modes:
- "itemized": each participant has their own order subtotal. Tax is charged on
  that subtotal; tip + delivery + service fees are split evenly per person.
- "even": one shared subtotal; the whole bill (subtotal + tax + tip + fees) is
  divided equally among the participants.

Shares are rounded to cents and reconciled so they sum EXACTLY to the grand total
(any leftover cent goes to the payer). Returns positive owed amounts, in the same
order as `participants`.
"""
from decimal import Decimal, ROUND_HALF_UP


def _cents(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _dec(x) -> Decimal:
    return Decimal(str(x if x is not None else 0))


def compute_shares(
    mode: str,
    tax_rate,
    tip,
    delivery_fee,
    service_fee,
    participants: list,
    subtotal=None,
    payer_profile_id: str = None,
) -> list:
    """Return [{"profile_id", "owed"}] with owed as a positive 2dp Decimal."""
    n = len(participants)
    if n == 0:
        return []

    rate = _dec(tax_rate)
    shared = _dec(tip) + _dec(delivery_fee) + _dec(service_fee)

    if mode == "even":
        total_sub = _dec(subtotal)
        grand = total_sub * (Decimal(1) + rate) + shared
        raw = {p["profile_id"]: grand / n for p in participants}
    else:  # itemized
        subtotals = {p["profile_id"]: _dec(p.get("subtotal")) for p in participants}
        total_sub = sum(subtotals.values(), Decimal(0))
        grand = total_sub * (Decimal(1) + rate) + shared
        per_person_shared = shared / n
        raw = {
            pid: sub + sub * rate + per_person_shared
            for pid, sub in subtotals.items()
        }

    grand = _cents(grand)
    shares = [{"profile_id": p["profile_id"], "owed": _cents(raw[p["profile_id"]])} for p in participants]

    # Reconcile rounding so the shares sum to the grand total exactly.
    residual = grand - sum((s["owed"] for s in shares), Decimal(0))
    if residual != 0:
        idx = next((i for i, s in enumerate(shares) if s["profile_id"] == payer_profile_id), 0)
        shares[idx]["owed"] = _cents(shares[idx]["owed"] + residual)

    return shares
