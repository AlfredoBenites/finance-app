import { useEffect, useState } from "react";
import { bucketsApi } from "../api/client";

const money = (n) => `$${Number(n).toFixed(2)}`;

export default function BucketsPage() {
  const [buckets, setBuckets] = useState([]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [error, setError] = useState(null);

  async function load() {
    try {
      setBuckets(await bucketsApi.list());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await bucketsApi.create({
        name: name.trim(),
        target_amount: target === "" ? null : Number(target),
        current_amount: current === "" ? 0 : Number(current),
      });
      setName("");
      setTarget("");
      setCurrent("");
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    try {
      await bucketsApi.remove(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <h1>Buckets</h1>

      <form onSubmit={handleAdd} style={{ flexWrap: "wrap" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bucket name (e.g., Car insurance)"
        />
        <input
          type="number"
          step="0.01"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Target $"
        />
        <input
          type="number"
          step="0.01"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Saved $"
        />
        <button type="submit">Add</button>
      </form>

      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}
      {buckets.length === 0 && <p>No buckets yet.</p>}

      {buckets.map((b) => (
        <div className="card" key={b.id}>
          <span>
            {b.name} · {money(b.current_amount)}
            {b.target_amount != null ? ` / ${money(b.target_amount)}` : ""}
            {!b.is_active ? " (inactive)" : ""}
          </span>
          <button className="danger" onClick={() => handleDelete(b.id)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
