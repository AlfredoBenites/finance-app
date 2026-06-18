import { useEffect, useState } from "react";
import { profilesApi, sharesApi } from "../api/client";

import { money } from "../format";

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState([]);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [shares, setShares] = useState([]);
  const [shareEmail, setShareEmail] = useState("");

  async function loadProfiles() {
    try {
      setProfiles(await profilesApi.list());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadProfiles();
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await profilesApi.create({ name: name.trim() });
      setName("");
      loadProfiles();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    try {
      await profilesApi.remove(id);
      if (summary?.profile?.id === id) setSummary(null);
      loadProfiles();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleMakePrimary(id) {
    try {
      await profilesApi.makePrimary(id);
      loadProfiles();
    } catch (e) {
      setError(e.message);
    }
  }

  async function viewSummary(id) {
    try {
      setError(null);
      setShareEmail("");
      const [summaryData, shareList] = await Promise.all([
        profilesApi.summary(id),
        sharesApi.listForProfile(id),
      ]);
      setSummary(summaryData);
      setShares(shareList);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleShare(e) {
    e.preventDefault();
    if (!shareEmail.trim() || !summary) return;
    try {
      await sharesApi.create(summary.profile.id, shareEmail.trim());
      setShareEmail("");
      setShares(await sharesApi.listForProfile(summary.profile.id));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleRevoke(shareId) {
    try {
      await sharesApi.remove(shareId);
      setShares(await sharesApi.listForProfile(summary.profile.id));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <h1>Profiles</h1>

      <form onSubmit={handleAdd}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Profile name (e.g., Mom)"
        />
        <button type="submit">Add</button>
      </form>

      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}

      {profiles.length === 0 && <p>No profiles yet.</p>}

      {profiles.map((p) => (
        <div className="card" key={p.id}>
          <span>{p.name}{p.is_primary ? " (me)" : ""}</span>
          <span style={{ display: "flex", gap: 6 }}>
            {!p.is_primary && (
              <button onClick={() => handleMakePrimary(p.id)}>This is me</button>
            )}
            <button onClick={() => viewSummary(p.id)}>View</button>
            <button className="danger" onClick={() => handleDelete(p.id)}>
              Delete
            </button>
          </span>
        </div>
      ))}

      {summary && (
        <div style={{ marginTop: 24 }}>
          <h2>{summary.profile.name} — summary</h2>
          <div className="card">
            <span>Total owed (all charges)</span>
            <strong>{money(summary.total_owed)}</strong>
          </div>
          <div className="card">
            <span>Paid back</span>
            <strong>{money(summary.total_paid)}</strong>
          </div>
          <div className="card">
            <span>Still unpaid</span>
            <strong>{money(summary.total_unpaid)}</strong>
          </div>
          <div className="card">
            <span>Cashback earned / pending</span>
            <strong>
              {money(summary.cashback_earned)} / {money(summary.cashback_pending)}
            </strong>
          </div>
          <div className="card">
            <span>Cards used</span>
            <span>{summary.cards_used.join(", ") || "—"}</span>
          </div>

          <h3>Owed by card</h3>
          {(!summary.debt_by_card || summary.debt_by_card.length === 0) && (
            <p><small>Nothing owed on any card.</small></p>
          )}
          {(summary.debt_by_card || []).map((c) => (
            <div className="card" key={c.name}>
              <span>{c.name}</span>
              <strong>{money(c.balance)}</strong>
            </div>
          ))}
          <p>
            <small>{summary.transactions.length} transaction(s)</small>
          </p>

          <h3>Sharing</h3>
          <p>
            <small>
              Share this profile with someone by email. When they sign up with
              that email, they can see (read-only) what they owe.
            </small>
          </p>
          <form onSubmit={handleShare}>
            <input
              type="email"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              placeholder="person@email.com"
            />
            <button type="submit">Share</button>
          </form>
          {shares.length === 0 && <p><small>Not shared with anyone yet.</small></p>}
          {shares.map((s) => (
            <div className="card" key={s.id}>
              <span>{s.shared_with_email}</span>
              <button className="danger" onClick={() => handleRevoke(s.id)}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
