// Client-side mirror of the backend split (app/services/group_split.py) for the
// live preview. Returns each person's share (perPerson) and the charges actually
// created after applying "charged to" (charges), plus the grand total. The
// backend recomputes authoritatively on submit.
const round = (x) => Math.round(x * 100) / 100;

export function computeSplit({ mode, tax, tip, deliveryFee, serviceFee, discount, subtotal, participants, payerId }) {
  const n = participants.length;
  if (!n) return { perPerson: [], charges: [], grand: 0 };

  const shared =
    (Number(tax) || 0) + (Number(tip) || 0) + (Number(deliveryFee) || 0) + (Number(serviceFee) || 0) - (Number(discount) || 0);
  const chargedTo = (p) => p.charged_to || p.profile_id;

  let grand;
  let perPerson;
  if (mode === "even") {
    const sub = Number(subtotal) || 0;
    grand = sub + shared;
    const per = grand / n;
    perPerson = participants.map((p) => ({ profile_id: p.profile_id, charged_to: chargedTo(p), owed: per }));
  } else {
    const subs = participants.map((p) => Number(p.subtotal) || 0);
    const totalSub = subs.reduce((a, b) => a + b, 0);
    grand = totalSub + shared;
    perPerson = participants.map((p, i) => ({
      profile_id: p.profile_id,
      charged_to: chargedTo(p),
      owed: subs[i] + (totalSub > 0 ? (subs[i] / totalSub) * shared : 0),
    }));
  }

  // Aggregate by who each share is charged to (first-seen order).
  const agg = {};
  const order = [];
  perPerson.forEach((p) => {
    if (!(p.charged_to in agg)) { agg[p.charged_to] = 0; order.push(p.charged_to); }
    agg[p.charged_to] += p.owed;
  });
  grand = round(grand);
  const charges = order.map((pid) => ({ profile_id: pid, owed: round(agg[pid]) }));
  const residual = round(grand - charges.reduce((a, c) => a + c.owed, 0));
  if (residual !== 0 && charges.length) {
    const idx = Math.max(0, charges.findIndex((c) => c.profile_id === payerId));
    charges[idx].owed = round(charges[idx].owed + residual);
  }

  return { perPerson: perPerson.map((p) => ({ ...p, owed: round(p.owed) })), charges, grand };
}
