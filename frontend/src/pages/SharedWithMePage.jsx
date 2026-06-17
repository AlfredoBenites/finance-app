import { useEffect, useState } from "react";
import { sharesApi } from "../api/client";

const money = (n) => `$${Number(n).toFixed(2)}`;

export default function SharedWithMePage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    sharesApi
      .sharedWithMe()
      .then((data) => {
        setItems(data);
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <h1>Shared with me</h1>
      <p>
        <small>Profiles other people have shared with you (read-only).</small>
      </p>

      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}
      {loaded && items.length === 0 && <p>Nothing has been shared with you.</p>}

      {items.map((item, i) => (
        <div key={i} style={{ marginBottom: 24 }}>
          <div className="card">
            <span>
              <strong>{item.profile_name}</strong> — you owe
            </span>
            <strong>{money(item.total_unpaid)}</strong>
          </div>
          {item.transactions.map((t) => (
            <div className="card" key={t.id}>
              <small>
                {t.transaction_date} · {t.merchant || "—"} · {t.category || "—"} ·{" "}
                {money(Math.abs(Number(t.amount)))} ·{" "}
                {t.is_paid_back ? "paid back" : "unpaid"}
              </small>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
