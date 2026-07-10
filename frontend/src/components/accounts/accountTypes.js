// Account types and their friendly labels, shared by the Accounts page and its
// detail panel so the wording stays consistent.
export const ACCOUNT_TYPES = ["checking", "savings", "cash", "investment", "roth_ira"];

const LABELS = {
  checking: "Checking",
  savings: "Savings",
  cash: "Cash",
  investment: "Investment",
  roth_ira: "Roth IRA",
};

export const typeLabel = (t) => LABELS[t] || t;
