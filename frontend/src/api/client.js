// Thin wrapper around fetch for talking to the FastAPI backend.
const BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    // FastAPI returns { detail: "..." } on errors — surface it to the user.
    let detail;
    try {
      detail = (await res.json()).detail;
    } catch {
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
};

export const creditCardsApi = {
  list: () => request("/api/credit-cards"),
  create: (data) =>
    request("/api/credit-cards", { method: "POST", body: JSON.stringify(data) }),
  remove: (id) => request(`/api/credit-cards/${id}`, { method: "DELETE" }),
};

export const bucketsApi = {
  list: () => request("/api/buckets"),
  create: (data) =>
    request("/api/buckets", { method: "POST", body: JSON.stringify(data) }),
  update: (id, data) =>
    request(`/api/buckets/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id) => request(`/api/buckets/${id}`, { method: "DELETE" }),
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
  get: () => request("/api/dashboard"),
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
