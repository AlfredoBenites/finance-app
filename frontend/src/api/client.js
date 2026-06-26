// Thin wrapper around fetch for talking to the FastAPI backend.
// Fall back to the local backend if the env var didn't load.
import { supabase } from "../auth/supabaseClient";

// 127.0.0.1 (not "localhost") forces IPv4 to match uvicorn's default bind;
// "localhost" can resolve to IPv6 first and intermittently drop requests on macOS.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Supabase rotates refresh tokens, so two refreshes firing at once race and one
// fails. When several requests load a page in parallel and all see an expired
// token, funnel them through a single shared refresh instead.
let refreshInFlight = null;
function refreshSessionOnce() {
  if (!refreshInFlight) {
    refreshInFlight = supabase.auth
      .refreshSession()
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// How many times to retry a dropped fetch before giving up. The local dev
// server (single worker) can briefly reset a connection when a page fires
// several requests at once, so a few backed-off retries make the rare blip
// invisible. Backoff: 300ms, 600ms, 1200ms.
const NET_RETRIES = 3;

// `retry` tracks two independent retries: `auth` (refresh an expired token, once)
// and `net` (a dropped/failed fetch, NET_RETRIES times with backoff). Pages like
// Pay-a-card fire several requests at once, so a transient network blip shouldn't
// take down the whole page.
async function request(path, options = {}, retry = { auth: true, net: NET_RETRIES }) {
  // Attach the Supabase access token so the backend can identify the user.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...options,
    });
  } catch (err) {
    // fetch() itself rejected — a network-level failure (the browser shows this
    // as "Load failed" / "Failed to fetch"), not an error the server returned.
    if (retry.net > 0) {
      const attempt = NET_RETRIES - retry.net; // 0, 1, 2
      await sleep(300 * 2 ** attempt);
      return request(path, options, { ...retry, net: retry.net - 1 });
    }
    throw new Error("Couldn't reach the server. Make sure the backend is running, then try again.");
  }

  // The access token can expire while a tab sits idle. On the first 401,
  // force a token refresh and retry once before surfacing an error.
  if (res.status === 401 && retry.auth) {
    await refreshSessionOnce();
    return request(path, options, { ...retry, auth: false });
  }

  if (!res.ok) {
    // FastAPI returns { detail: "..." } on errors — surface it to the user.
    let detail;
    try {
      detail = (await res.json()).detail;
    } catch (e) {
      // no JSON body
    }
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  // DELETE returns 204 No Content.
  return res.status === 204 ? null : res.json();
}

export const profilesApi = {
  list: () => request("/api/profiles"),
  create: (data) =>
    request("/api/profiles", { method: "POST", body: JSON.stringify(data) }),
  update: (id, data) =>
    request(`/api/profiles/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id) => request(`/api/profiles/${id}`, { method: "DELETE" }),
  summary: (id) => request(`/api/profiles/${id}/summary`),
  statement: (id) => request(`/api/profiles/${id}/statement`),
  makePrimary: (id) => request(`/api/profiles/${id}/make-primary`, { method: "POST" }),
};

export const creditCardsApi = {
  list: () => request("/api/credit-cards"),
  create: (data) =>
    request("/api/credit-cards", { method: "POST", body: JSON.stringify(data) }),
  update: (id, data) =>
    request(`/api/credit-cards/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id) => request(`/api/credit-cards/${id}`, { method: "DELETE" }),
  upgrade: (id, data) =>
    request(`/api/credit-cards/${id}/upgrade`, { method: "POST", body: JSON.stringify(data) }),
  upgrades: () => request("/api/credit-cards/upgrades"),
  pay: (id, data) =>
    request(`/api/credit-cards/${id}/pay`, { method: "POST", body: JSON.stringify(data) }),
  payments: () => request("/api/credit-cards/payments"),
};

export const bucketsApi = {
  list: () => request("/api/buckets"),
  create: (data) =>
    request("/api/buckets", { method: "POST", body: JSON.stringify(data) }),
  update: (id, data) =>
    request(`/api/buckets/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id) => request(`/api/buckets/${id}`, { method: "DELETE" }),
  // move money within an account: { account_id, from, to, amount } where
  // from/to are a bucket id or "unallocated".
  transfer: (data) =>
    request("/api/buckets/transfer", { method: "POST", body: JSON.stringify(data) }),
  moves: () => request("/api/buckets/moves"),
  reimbursements: () => request("/api/buckets/reimbursements"),
  allocateReimbursement: (data) =>
    request("/api/buckets/allocate-reimbursement", { method: "POST", body: JSON.stringify(data) }),
  dismissReimbursement: (data) =>
    request("/api/buckets/dismiss-reimbursement", { method: "POST", body: JSON.stringify(data) }),
  dismissAllReimbursements: () =>
    request("/api/buckets/dismiss-all-reimbursements", { method: "POST" }),
  incomeAllocations: () => request("/api/buckets/income-allocations"),
  allocateIncome: (data) =>
    request("/api/buckets/allocate-income", { method: "POST", body: JSON.stringify(data) }),
  dismissIncome: (data) =>
    request("/api/buckets/dismiss-income", { method: "POST", body: JSON.stringify(data) }),
  dismissAllIncome: () =>
    request("/api/buckets/dismiss-all-income", { method: "POST" }),
  undoIncomeAllocation: (data) =>
    request("/api/buckets/undo-income-allocation", { method: "POST", body: JSON.stringify(data) }),
  accountExpenses: () => request("/api/buckets/account-expenses"),
  deductExpense: (data) =>
    request("/api/buckets/deduct-expense", { method: "POST", body: JSON.stringify(data) }),
  dismissExpense: (data) =>
    request("/api/buckets/dismiss-expense", { method: "POST", body: JSON.stringify(data) }),
  dismissAllExpenses: () =>
    request("/api/buckets/dismiss-all-expenses", { method: "POST" }),
};

export const accountsApi = {
  list: () => request("/api/accounts"),
  create: (data) =>
    request("/api/accounts", { method: "POST", body: JSON.stringify(data) }),
  update: (id, data) =>
    request(`/api/accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id) => request(`/api/accounts/${id}`, { method: "DELETE" }),
  transfer: (data) =>
    request("/api/accounts/transfer", { method: "POST", body: JSON.stringify(data) }),
  transfers: () => request("/api/accounts/transfers"),
};

export const dashboardApi = {
  get: ({ year, onlyPrimary, excludeRepayments } = {}) => {
    const p = new URLSearchParams();
    if (year) p.append("year", year);
    if (onlyPrimary) p.append("only_primary", "true");
    if (excludeRepayments) p.append("exclude_repayments", "true");
    const qs = p.toString();
    return request(`/api/dashboard${qs ? `?${qs}` : ""}`);
  },
};

export const incomeApi = {
  list: (year) => request(`/api/income${year ? `?year=${year}` : ""}`),
  create: (data) =>
    request("/api/income", { method: "POST", body: JSON.stringify(data) }),
  update: (id, data) =>
    request(`/api/income/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id) => request(`/api/income/${id}`, { method: "DELETE" }),
};

export const categoriesApi = {
  list: () => request("/api/categories"),
  create: (name) =>
    request("/api/categories", { method: "POST", body: JSON.stringify({ name }) }),
  remove: (id) => request(`/api/categories/${id}`, { method: "DELETE" }),
};

export const merchantCategoriesApi = {
  list: () => request("/api/merchant-categories"),
  upsert: (merchant, category) =>
    request("/api/merchant-categories", {
      method: "POST",
      body: JSON.stringify({ merchant, category }),
    }),
};

export const sharesApi = {
  listForProfile: (profileId) => request(`/api/profiles/${profileId}/shares`),
  create: (profileId, email) =>
    request(`/api/profiles/${profileId}/shares`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  remove: (shareId) => request(`/api/shares/${shareId}`, { method: "DELETE" }),
  sharedWithMe: () => request("/api/shared-with-me"),
};

export const cashbackRulesApi = {
  listAll: () => request("/api/cashback-rules"),
  listForCard: (cardId) => request(`/api/credit-cards/${cardId}/cashback-rules`),
  upsert: (cardId, category, rate) =>
    request(`/api/credit-cards/${cardId}/cashback-rules`, {
      method: "POST",
      body: JSON.stringify({ category, rate }),
    }),
  remove: (ruleId) => request(`/api/cashback-rules/${ruleId}`, { method: "DELETE" }),
};

export const transactionsApi = {
  // filters: { profile_id, credit_card_id, category, is_paid_back, month, search }
  list: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== "" && v !== null && v !== undefined) params.append(k, v);
    });
    const qs = params.toString();
    return request(`/api/transactions${qs ? `?${qs}` : ""}`);
  },
  create: (data) =>
    request("/api/transactions", { method: "POST", body: JSON.stringify(data) }),
  update: (id, data) =>
    request(`/api/transactions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id) => request(`/api/transactions/${id}`, { method: "DELETE" }),
};
