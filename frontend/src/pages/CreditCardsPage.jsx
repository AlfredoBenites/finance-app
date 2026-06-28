import { useEffect, useMemo, useState } from "react";
import { creditCardsApi, cashbackRulesApi, categoriesApi } from "../api/client";
import { CATEGORIES as FALLBACK_CATEGORIES } from "../constants";
import { useSettings } from "../settings/SettingsContext";
import {
  PageHeader,
  Card,
  Button,
  Banner,
  Badge,
  CardArt,
  Input,
  Select,
  Field,
  cn,
} from "../components/ui";

const NETWORKS = ["Visa", "Mastercard", "Amex", "Discover", "Other"];

// Preset card colors, plus a custom picker. These are the `color` stored on the
// card and used by the card art.
const CARD_COLORS = [
  "#1f2933", "#0f3d3e", "#1e3a5f", "#0c4a6e", "#365314",
  "#3b2f63", "#5b21b6", "#7f1d1d", "#7c2d12", "#3f3f46",
];

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {CARD_COLORS.map((c) => (
        <button
          type="button"
          key={c}
          onClick={() => onChange(c)}
          title={c}
          className={cn(
            "h-7 w-7 rounded-full transition-shadow",
            value?.toLowerCase() === c.toLowerCase()
              ? "ring-2 ring-accent ring-offset-1 ring-offset-surface"
              : "ring-1 ring-border"
          )}
          style={{ background: c }}
        />
      ))}
      <input
        type="color"
        value={value || "#1f2933"}
        onChange={(e) => onChange(e.target.value)}
        title="Custom color"
        className="h-7 w-9 rounded border border-border bg-surface cursor-pointer p-0.5"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} className="text-xs text-muted hover:text-ink">
          Clear
        </button>
      )}
    </div>
  );
}

const EMPTY_ADD = {
  name: "",
  issuer: "",
  last_four: "",
  network: "",
  cashbackPct: "",
  statement_day: "",
  due_day: "",
  color: "",
};

export default function CreditCardsPage() {
  const [cards, setCards] = useState([]);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [add, setAdd] = useState(EMPTY_ADD);

  // Per-card appearance/details editor.
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({});

  // Cashback-by-category panel.
  const [openCardId, setOpenCardId] = useState(null);
  const [rules, setRules] = useState([]);
  const [ruleCategory, setRuleCategory] = useState(FALLBACK_CATEGORIES[0]);
  const [rulePct, setRulePct] = useState("");
  const [categoryList, setCategoryList] = useState(FALLBACK_CATEGORIES);

  // Upgrade flow.
  const [upgrades, setUpgrades] = useState([]);
  const [upgrading, setUpgrading] = useState(null);
  const [upgradeNew, setUpgradeNew] = useState("");
  const [upgradeDate, setUpgradeDate] = useState("");

  async function loadCards() {
    try {
      const list = await creditCardsApi.list();
      setCards(list);
      setUpgrades(await creditCardsApi.upgrades());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadCards();
    categoriesApi
      .list()
      .then((cats) => {
        const names = new Set([...FALLBACK_CATEGORIES, ...cats.map((c) => c.name)]);
        setCategoryList([...names].sort());
      })
      .catch(() => {});
  }, []);

  const setAddField = (k, v) => setAdd((f) => ({ ...f, [k]: v }));

  async function handleAdd(e) {
    e.preventDefault();
    if (!add.name.trim()) return;
    try {
      await creditCardsApi.create({
        name: add.name.trim(),
        issuer: add.issuer.trim() || null,
        last_four: add.last_four.trim() || null,
        network: add.network || null,
        default_cashback_rate: add.cashbackPct === "" ? null : Number(add.cashbackPct) / 100,
        statement_day: add.statement_day === "" ? null : Number(add.statement_day),
        due_day: add.due_day === "" ? null : Number(add.due_day),
        color: add.color || null,
      });
      setAdd(EMPTY_ADD);
      setShowAdd(false);
      setError(null);
      loadCards();
    } catch (e) {
      setError(e.message);
    }
  }

  function startEdit(c) {
    setEditId(c.id);
    setError(null);
    setEdit({
      name: c.name ?? "",
      issuer: c.issuer ?? "",
      last_four: c.last_four ?? "",
      network: c.network ?? "",
      color: c.color ?? "",
      cashbackPct: c.default_cashback_rate != null ? String(Number(c.default_cashback_rate) * 100) : "",
      statement_day: c.statement_day ?? "",
      due_day: c.due_day ?? "",
    });
  }
  const setEditField = (k, v) => setEdit((f) => ({ ...f, [k]: v }));

  async function saveEdit() {
    try {
      await creditCardsApi.update(editId, {
        name: edit.name.trim() || undefined,
        issuer: edit.issuer.trim() || null,
        last_four: edit.last_four.trim() || null,
        network: edit.network || null,
        color: edit.color || null,
        default_cashback_rate: edit.cashbackPct === "" ? null : Number(edit.cashbackPct) / 100,
        statement_day: edit.statement_day === "" ? null : Number(edit.statement_day),
        due_day: edit.due_day === "" ? null : Number(edit.due_day),
      });
      setEditId(null);
      setError(null);
      loadCards();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    try {
      await creditCardsApi.remove(id);
      if (openCardId === id) setOpenCardId(null);
      if (editId === id) setEditId(null);
      loadCards();
    } catch (e) {
      setError(e.message);
    }
  }

  async function toggleRules(cardId) {
    if (openCardId === cardId) {
      setOpenCardId(null);
      return;
    }
    try {
      setError(null);
      setRulePct("");
      setRuleCategory(categoryList[0] || FALLBACK_CATEGORIES[0]);
      setRules(await cashbackRulesApi.listForCard(cardId));
      setOpenCardId(cardId);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleAddRule(e) {
    e.preventDefault();
    if (rulePct === "") return;
    try {
      await cashbackRulesApi.upsert(openCardId, ruleCategory, Number(rulePct) / 100);
      setRulePct("");
      setRules(await cashbackRulesApi.listForCard(openCardId));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDeleteRule(ruleId) {
    try {
      await cashbackRulesApi.remove(ruleId);
      setRules(await cashbackRulesApi.listForCard(openCardId));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleUpgrade(oldId) {
    if (!upgradeNew) {
      setError("Pick the card it was upgraded to.");
      return;
    }
    try {
      await creditCardsApi.upgrade(oldId, { new_card_id: upgradeNew, upgraded_on: upgradeDate || null });
      setUpgrading(null);
      setUpgradeNew("");
      setUpgradeDate("");
      setError(null);
      loadCards();
    } catch (e) {
      setError(e.message);
    }
  }

  const { cardOrder } = useSettings();
  // Active cards in the user's chosen display order (Settings → Credit Cards);
  // any card not in the saved order falls to the end.
  const activeCards = useMemo(() => {
    const active = cards.filter((c) => c.is_active !== false);
    if (!cardOrder?.length) return active;
    const rank = (id) => {
      const i = cardOrder.indexOf(id);
      return i === -1 ? Infinity : i;
    };
    return [...active].sort((a, b) => rank(a.id) - rank(b.id));
  }, [cards, cardOrder]);
  const archivedCards = cards.filter((c) => c.is_active === false);

  return (
    <div>
      <PageHeader
        title="Credit Cards"
        subtitle="Your cards, their cashback, and statement/due days."
        actions={
          <Button variant="primary" onClick={() => setShowAdd((s) => !s)}>
            {showAdd ? "Close" : "Add card"}
          </Button>
        }
      />

      {error && <Banner tone="danger" className="mb-4">Error: {error}</Banner>}

      {showAdd && (
        <Card className="mb-6">
          <form onSubmit={handleAdd} className="grid sm:grid-cols-2 gap-4">
            <Field label="Card name">
              <Input value={add.name} onChange={(e) => setAddField("name", e.target.value)} placeholder="Chase Freedom" />
            </Field>
            <Field label="Issuer">
              <Input value={add.issuer} onChange={(e) => setAddField("issuer", e.target.value)} placeholder="Chase" />
            </Field>
            <Field label="Last 4 digits">
              <Input
                value={add.last_four}
                onChange={(e) => setAddField("last_four", e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1234"
                inputMode="numeric"
              />
            </Field>
            <Field label="Network">
              <Select value={add.network} onChange={(e) => setAddField("network", e.target.value)}>
                <option value="">Network…</option>
                {NETWORKS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </Field>
            <Field label="Default cashback %">
              <Input type="number" step="0.01" value={add.cashbackPct} onChange={(e) => setAddField("cashbackPct", e.target.value)} placeholder="1.5" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Statement day">
                <Input type="number" min="1" max="31" value={add.statement_day} onChange={(e) => setAddField("statement_day", e.target.value)} placeholder="1–31" />
              </Field>
              <Field label="Due day">
                <Input type="number" min="1" max="31" value={add.due_day} onChange={(e) => setAddField("due_day", e.target.value)} placeholder="1–31" />
              </Field>
            </div>
            <Field label="Color" className="sm:col-span-2">
              <ColorPicker value={add.color} onChange={(v) => setAddField("color", v)} />
            </Field>
            <div className="sm:col-span-2 flex items-center gap-2">
              <Button type="submit" variant="primary">Add card</Button>
              <Button type="button" variant="ghost" onClick={() => { setShowAdd(false); setAdd(EMPTY_ADD); }}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {activeCards.length === 0 && <p className="text-muted text-sm">No credit cards yet.</p>}

      <div className="space-y-4">
        {activeCards.map((c) => (
          <Card key={c.id} className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-44 shrink-0">
                <CardArt name={c.name} network={c.network} lastFour={c.last_four} color={c.color} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-ink">{c.name}</h3>
                  {c.network && <Badge>{c.network}</Badge>}
                  {c.last_four && <Badge tone="neutral">•••• {c.last_four}</Badge>}
                </div>
                <p className="text-sm text-muted mt-1">
                  {c.issuer || "—"}
                  {c.default_cashback_rate != null
                    ? ` · ${(Number(c.default_cashback_rate) * 100).toFixed(2)}% default`
                    : ""}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {c.statement_day ? `Statement closes day ${c.statement_day}` : "No statement day"}
                  {" · "}
                  {c.due_day ? `Due day ${c.due_day}` : "No due day"}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <Button size="sm" onClick={() => (editId === c.id ? setEditId(null) : startEdit(c))}>
                  {editId === c.id ? "Close" : "Edit"}
                </Button>
                <Button size="sm" onClick={() => toggleRules(c.id)}>
                  {openCardId === c.id ? "Hide categories" : "Cashback by category"}
                </Button>
                <Button size="sm" onClick={() => setUpgrading(upgrading === c.id ? null : c.id)}>
                  Upgrade
                </Button>
                <Button size="sm" variant="danger" onClick={() => handleDelete(c.id)}>
                  Delete
                </Button>
              </div>
            </div>

            {/* Edit appearance + details */}
            {editId === c.id && (
              <div className="border-t border-border pt-4 grid sm:grid-cols-2 gap-4">
                <Field label="Card name">
                  <Input value={edit.name} onChange={(e) => setEditField("name", e.target.value)} />
                </Field>
                <Field label="Issuer">
                  <Input value={edit.issuer} onChange={(e) => setEditField("issuer", e.target.value)} />
                </Field>
                <Field label="Last 4 digits">
                  <Input
                    value={edit.last_four}
                    onChange={(e) => setEditField("last_four", e.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Network">
                  <Select value={edit.network} onChange={(e) => setEditField("network", e.target.value)}>
                    <option value="">Network…</option>
                    {NETWORKS.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Default cashback %">
                  <Input type="number" step="0.01" value={edit.cashbackPct} onChange={(e) => setEditField("cashbackPct", e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Statement day">
                    <Input type="number" min="1" max="31" value={edit.statement_day} onChange={(e) => setEditField("statement_day", e.target.value)} />
                  </Field>
                  <Field label="Due day">
                    <Input type="number" min="1" max="31" value={edit.due_day} onChange={(e) => setEditField("due_day", e.target.value)} />
                  </Field>
                </div>
                <Field label="Color" className="sm:col-span-2">
                  <ColorPicker value={edit.color} onChange={(v) => setEditField("color", v)} />
                </Field>
                <div className="sm:col-span-2 flex items-center gap-2">
                  <Button variant="primary" onClick={saveEdit}>Save</Button>
                  <Button variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Upgrade */}
            {upgrading === c.id && (
              <div className="border-t border-border pt-4 flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted">Upgraded to</span>
                <Select value={upgradeNew} onChange={(e) => setUpgradeNew(e.target.value)}>
                  <option value="">Card…</option>
                  {activeCards.filter((o) => o.id !== c.id).map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </Select>
                <Input type="date" value={upgradeDate} onChange={(e) => setUpgradeDate(e.target.value)} />
                <Button variant="primary" onClick={() => handleUpgrade(c.id)}>
                  Confirm (archives {c.name})
                </Button>
              </div>
            )}

            {/* Cashback by category */}
            {openCardId === c.id && (
              <div className="border-t border-border pt-4 space-y-3">
                <form onSubmit={handleAddRule} className="flex items-end gap-2 flex-wrap">
                  <Field label="Category">
                    <Select value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)}>
                      {categoryList.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Cashback %">
                    <Input type="number" step="0.01" value={rulePct} onChange={(e) => setRulePct(e.target.value)} placeholder="3" />
                  </Field>
                  <Button type="submit" variant="primary">Set</Button>
                </form>
                {rules.length === 0 ? (
                  <p className="text-sm text-muted">No category rules — uses the card default.</p>
                ) : (
                  <div className="space-y-2">
                    {rules.map((r) => (
                      <div key={r.id} className="flex items-center justify-between border border-border rounded-md px-3 py-2 text-sm">
                        <span className="text-ink">
                          {r.category}: {(Number(r.rate) * 100).toFixed(2)}%
                        </span>
                        <Button size="sm" variant="danger" onClick={() => handleDeleteRule(r.id)}>Remove</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      {archivedCards.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-ink mb-3">Archived cards</h2>
          <div className="space-y-2">
            {archivedCards.map((c) => (
              <Card key={c.id} className="py-3 text-sm text-muted">
                {c.name}{c.issuer ? ` · ${c.issuer}` : ""} (upgraded)
              </Card>
            ))}
          </div>
        </section>
      )}

      {upgrades.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-ink mb-3">Upgrade history</h2>
          <div className="space-y-2">
            {upgrades.map((u) => (
              <Card key={u.id} className="flex items-center justify-between py-3 text-sm">
                <span className="text-ink">{u.old_name} → {u.new_name}</span>
                <span className="text-muted">{u.upgraded_on || ""}</span>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
