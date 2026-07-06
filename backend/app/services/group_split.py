"""Split a group purchase into each participant's share, then aggregate by who
each share is charged to.

Shared costs are entered as amounts (matching a receipt, e.g. DoorDash):
- "itemized": each person has an order subtotal. Tax and discount are split
  PROPORTIONALLY to each subtotal (like a rate / an order-wide discount); tip +
  delivery + service fees are split EVENLY per person.
- "even": one subtotal; the whole bill (subtotal + tax + tip + fees - discount) is
  divided EQUALLY among the participants.

Each participant's share is charged to `charged_to` (defaults to themselves) — so
you can pay for someone (their share becomes your own charge) or have one person
cover another's. Shares are aggregated per charged-to profile, rounded to cents,
and reconciled so the charges sum EXACTLY to the card total (leftover cent → the
payer). Returns [{"profile_id", "owed"}] with positive 2dp Decimal owed.
"""
from decimal import Decimal, ROUND_HALF_UP


def _cents(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _dec(x) -> Decimal:
    return Decimal(str(x if x is not None else 0))


def compute_shares(
    mode: str,
    tax,
    tip,
    delivery_fee,
    service_fee,
    discount,
    participants: list,
    subtotal=None,
    payer_profile_id: str = None,
) -> list:
    n = len(participants)
    if n == 0:
        return []

    tax = _dec(tax)
    discount = _dec(discount)
    even_pool = _dec(tip) + _dec(delivery_fee) + _dec(service_fee)
    even_each = even_pool / n

    def charged_to(p):
        return p.get("charged_to") or p["profile_id"]

    if mode == "even":
        total_sub = _dec(subtotal)
        grand = total_sub + tax + even_pool - discount
        per = grand / n
        per_person = [(charged_to(p), per) for p in participants]
    else:  # itemized
        subs = [_dec(p.get("subtotal")) for p in participants]
        total_sub = sum(subs, Decimal(0))
        grand = total_sub + tax + even_pool - discount
        prop_pool = tax - discount  # split proportionally to each order
        per_person = []
        for p, sub in zip(participants, subs):
            share = sub + even_each
            if total_sub > 0:
                share += (sub / total_sub) * prop_pool
            per_person.append((charged_to(p), share))

    # Aggregate by who each share is charged to (first-seen order).
    agg: dict[str, Decimal] = {}
    order: list[str] = []
    for pid, amt in per_person:
        if pid not in agg:
            agg[pid] = Decimal(0)
            order.append(pid)
        agg[pid] += amt

    grand = _cents(grand)
    shares = [{"profile_id": pid, "owed": _cents(agg[pid])} for pid in order]
    residual = grand - sum((s["owed"] for s in shares), Decimal(0))
    if residual != 0:
        idx = next((i for i, s in enumerate(shares) if s["profile_id"] == payer_profile_id), 0)
        shares[idx]["owed"] = _cents(shares[idx]["owed"] + residual)
    return shares
