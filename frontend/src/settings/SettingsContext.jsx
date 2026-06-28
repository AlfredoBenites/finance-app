import { createContext, useContext, useState } from "react";
import usePersistedState from "../hooks/usePersistedState";

// User preferences (persisted) + the open/close state for the Settings modal.
// - profileSort.mode: "desc" (highest first) | "asc" (lowest first) | "custom"
//   profileSort.order: array of profile ids, used when mode === "custom"
// - cardTxnPageSize: rows per page in the card detail panel (max 100)
// - cardOrder: array of card ids = display order on the Credit Cards page
const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [profileSort, setProfileSort] = usePersistedState("settings.profileSort", {
    mode: "desc",
    order: [],
  });
  const [cardTxnPageSize, setCardTxnPageSize] = usePersistedState("settings.cardTxnPageSize", 20);
  const [cardOrder, setCardOrder] = usePersistedState("settings.cardOrder", []);
  // Expenses page: rows per page and the default filter values applied on load.
  const [expensesPerPage, setExpensesPerPage] = usePersistedState("settings.expensesPerPage", 15);
  const [expensesFilters, setExpensesFilters] = usePersistedState("settings.expensesFilters", {
    profile_id: "",
    is_paid_back: "",
    source: "",
    year: "current", // "current" | "all" | a specific year string
  });
  // Dashboard / insights calculation preferences (moved off the dashboard).
  // hideRepayments defaults ON; onlyMyDebt defaults OFF; cashbackScope "all"
  // shows all cashback, "mine" only your own profile's.
  const [dashboardPrefs, setDashboardPrefs] = usePersistedState("settings.dashboardPrefs", {
    hideRepayments: true,
    onlyMyDebt: false,
    cashbackScope: "all",
  });

  const value = {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    profileSort,
    setProfileSort,
    cardTxnPageSize,
    setCardTxnPageSize,
    cardOrder,
    setCardOrder,
    expensesPerPage,
    setExpensesPerPage,
    expensesFilters,
    setExpensesFilters,
    dashboardPrefs,
    setDashboardPrefs,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
