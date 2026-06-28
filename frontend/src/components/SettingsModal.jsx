import { useEffect, useMemo, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, GripVertical } from "lucide-react";
import { Modal, Button, Input, cn } from "./ui";
import { useSettings } from "../settings/SettingsContext";
import { profilesApi } from "../api/client";

const SORT_MODES = [
  ["desc", "Highest balance first", ArrowDownWideNarrow],
  ["asc", "Lowest balance first", ArrowUpNarrowWide],
];
const PAGE_PRESETS = [20, 50, 100];

function Section({ title, hint, children }) {
  return (
    <section className="py-4 first:pt-0 border-b border-border last:border-0">
      <h3 className="font-medium text-ink">{title}</h3>
      {hint && <p className="text-xs text-muted mt-0.5 mb-3">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

export default function SettingsModal() {
  const {
    isOpen,
    close,
    profileSort,
    setProfileSort,
    cardTxnPageSize,
    setCardTxnPageSize,
  } = useSettings();

  const [profiles, setProfiles] = useState([]);
  const [dragId, setDragId] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    profilesApi.list().then(setProfiles).catch(() => {});
  }, [isOpen]);

  // Profiles arranged by the saved custom order (any not listed go to the end).
  const orderedProfiles = useMemo(() => {
    const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
    const order = profileSort.order || [];
    const inOrder = order.map((id) => byId[id]).filter(Boolean);
    const rest = profiles.filter((p) => !order.includes(p.id));
    return [...inOrder, ...rest];
  }, [profiles, profileSort.order]);

  function setMode(mode) {
    if (mode === "custom") {
      const order = profileSort.order?.length ? profileSort.order : profiles.map((p) => p.id);
      setProfileSort({ mode, order });
    } else {
      setProfileSort({ ...profileSort, mode });
    }
  }

  function handleDragOver(e, overId) {
    e.preventDefault();
    if (dragId === null || dragId === overId) return;
    const ids = orderedProfiles.map((p) => p.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(overId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setProfileSort({ mode: "custom", order: ids });
  }

  function setPageSize(v) {
    const n = Math.max(1, Math.min(100, Number(v) || 1));
    setCardTxnPageSize(n);
  }

  return (
    <Modal open={isOpen} onClose={close} title="Settings" subtitle="Preferences are saved on this device.">
      {/* Total Balance by Profile order */}
      <Section
        title="Total Balance by Profile — order"
        hint="How profiles are sorted on the dashboard."
      >
        <div className="inline-flex rounded-md border border-border-strong p-0.5">
          {SORT_MODES.map(([mode, label, Icon]) => (
            <button
              key={mode}
              onClick={() => setMode(mode)}
              title={label}
              aria-label={label}
              className={cn(
                "grid place-items-center h-8 w-9 rounded transition-colors",
                profileSort.mode === mode ? "bg-control text-ink" : "text-muted hover:text-ink"
              )}
            >
              <Icon size={16} />
            </button>
          ))}
          <button
            onClick={() => setMode("custom")}
            className={cn(
              "px-3 h-8 rounded text-sm transition-colors",
              profileSort.mode === "custom" ? "bg-control text-ink font-medium" : "text-muted hover:text-ink"
            )}
          >
            Custom
          </button>
        </div>

        {profileSort.mode === "custom" && (
          <ul className="mt-3 space-y-1.5">
            {orderedProfiles.map((p) => (
              <li
                key={p.id}
                draggable
                onDragStart={() => setDragId(p.id)}
                onDragOver={(e) => handleDragOver(e, p.id)}
                onDragEnd={() => setDragId(null)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-surface cursor-grab active:cursor-grabbing",
                  dragId === p.id && "opacity-50"
                )}
              >
                <GripVertical size={16} className="text-muted shrink-0" />
                <span className="text-sm text-ink">{p.name}</span>
              </li>
            ))}
            {orderedProfiles.length === 0 && (
              <li className="text-sm text-muted">No profiles yet.</li>
            )}
          </ul>
        )}
      </Section>

      {/* Card panel page size */}
      <Section
        title="Transactions per page"
        hint="How many charges load at once in a card's detail panel (max 100)."
      >
        <div className="flex items-center gap-2 flex-wrap">
          {PAGE_PRESETS.map((n) => (
            <Button
              key={n}
              size="sm"
              variant={cardTxnPageSize === n ? "primary" : "secondary"}
              onClick={() => setPageSize(n)}
            >
              {n}
            </Button>
          ))}
          <span className="text-sm text-muted ml-1">Custom:</span>
          <Input
            type="number"
            min="1"
            max="100"
            value={cardTxnPageSize}
            onChange={(e) => setPageSize(e.target.value)}
            className="w-20"
          />
        </div>
      </Section>
    </Modal>
  );
}
