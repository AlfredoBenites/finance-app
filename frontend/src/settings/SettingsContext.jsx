import { createContext, useContext, useState } from "react";
import usePersistedState from "../hooks/usePersistedState";

// User preferences (persisted) + the open/close state for the Settings modal.
// - profileSort.mode: "desc" (highest first) | "asc" (lowest first) | "custom"
//   profileSort.order: array of profile ids, used when mode === "custom"
// - cardTxnPageSize: rows per page in the card detail panel (max 100)
const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [profileSort, setProfileSort] = usePersistedState("settings.profileSort", {
    mode: "desc",
    order: [],
  });
  const [cardTxnPageSize, setCardTxnPageSize] = usePersistedState("settings.cardTxnPageSize", 20);

  const value = {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    profileSort,
    setProfileSort,
    cardTxnPageSize,
    setCardTxnPageSize,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
