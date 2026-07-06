// Client-side mirror of the backend split (app/services/group_split.py), used for
// the live preview. The backend recomputes authoritatively on submit.
const round = (x) => Math.round(x * 100) / 100;

export function computeShares({ mode, taxRate, tip, deliveryFee, serviceFee, subtotal, participants, payerId }) {
  const n = participants.length;
  if (!n) return { shares: [], grand: 0 };
  const rate = Number(taxRate) || 0;
  const shared = (Number(tip) || 0) + (Number(deliveryFee) || 0) + (Number(serviceFee) || 0);

  let grand;
  let raw;
  if (mode === "even") {
    const sub = Number(subtotal) || 0;
    grand = sub * (1 + rate) + shared;
    raw = participants.map((p) => ({ profile_id: p.profile_id, owed: grand / n }));
  } else {
    const subs = participants.map((p) => Number(p.subtotal) || 0);
    const totalSub = subs.reduce((a, b) => a + b, 0);
    grand = totalSub * (1 + rate) + shared;
    const perShared = shared / n;
    raw = participants.map((p, i) => ({ profile_id: p.profile_id, owed: subs[i] + subs[i] * rate + perShared }));
  }

  grand = round(grand);
  const shares = raw.map((r) => ({ ...r, owed: round(r.owed) }));
  const residual = round(grand - shares.reduce((a, s) => a + s.owed, 0));
  if (residual !== 0 && shares.length) {
    const idx = Math.max(0, shares.findIndex((s) => s.profile_id === payerId));
    shares[idx].owed = round(shares[idx].owed + residual);
  }
  return { shares, grand };
}
