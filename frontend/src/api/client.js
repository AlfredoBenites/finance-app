// Thin wrapper around fetch for talking to the FastAPI backend.
// Fall back to the local backend if the env var didn't load.
import { supabase } from "../auth/supabaseClient";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function request(path, options = {}) {
  // Attach the Supabase access token so the backend can identify the user.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
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
  remove: (id) => request(`/api/profiles/${id}`, { method: "DELETE" }),
  summary: (id) => request(`/api/profiles/${id}/summary`),
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
};

export const accountsApi = {
  list: () => request("/api/accounts"),
  create: (data) =>
    request("/api/accounts", { method: "POST", body: JSON.stringify(data) }),
  update: (id, data) =>
    request(`/api/accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id) => request(`/api/accounts/${id}`, { method: "DELETE" }),
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
