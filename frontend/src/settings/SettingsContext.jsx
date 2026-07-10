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
  // Buckets page display order: accountOrder = array of account ids; bucketOrder
  // = { [accountId]: [bucketId, ...] } for the buckets within each account.
  const [accountOrder, setAccountOrder] = usePersistedState("settings.accountOrder", []);
  const [bucketOrder, setBucketOrder] = usePersistedState("settings.bucketOrder", {});
  // Buckets page: how many move-history rows show per page (max 100).
  const [moveHistoryPerPage, setMoveHistoryPerPage] = usePersistedState("settings.moveHistoryPerPage", 25);
  // Colors for the bucket "kind" tags (keys from tagColors palette).
  const [kindColors, setKindColors] = usePersistedState("settings.kindColors", {
    card: "orange",
    spendable: "green",
    set_aside: "blue",
    not_mine: "brown",
  });
  // Expenses page: rows per page and the default filter values applied on load.
  const [expensesPerPage, setExpensesPerPage] = usePersistedState("settings.expensesPerPage", 15);
  const [expensesFilters, setExpensesFilters] = usePersistedState("settings.expensesFilters", {
    profile_id: "",
    is_paid_back: "",
    source: "",
    year: "current", // "current" | "all" | a specific year string
  });
  // Income page: rows per page.
  const [incomePerPage, setIncomePerPage] = usePersistedState("settings.incomePerPage", 15);
  // Pay a card: how many payment-history rows show per page (max 100).
  const [paymentsPerPage, setPaymentsPerPage] = usePersistedState("settings.paymentsPerPage", 25);
  // Accounts: how many transfer-history rows show per page (max 100).
  const [transferHistoryPerPage, setTransferHistoryPerPage] = usePersistedState("settings.transferHistoryPerPage", 25);
  // Accounts: chosen icon color per account — { [accountId]: colorKey } (bucket palette).
  const [accountIconColors, setAccountIconColors] = usePersistedState("settings.accountIconColors", {});
  // Investments: how many purchase-history rows show per page (max 100).
  const [investmentHistoryPerPage, setInvestmentHistoryPerPage] = usePersistedState("settings.investmentHistoryPerPage", 25);
  // Pay a card: chosen icon color per card — { [cardId]: colorKey } (bucket palette).
  const [cardIconColors, setCardIconColors] = usePersistedState("settings.cardIconColors", {});
  // Profiles: remembered statement language PER profile — { [profileId]: "en" | "es" }.
  const [statementLangByProfile, setStatementLangByProfile] = usePersistedState("settings.statementLangByProfile", {});
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
    accountOrder,
    setAccountOrder,
    bucketOrder,
    setBucketOrder,
    moveHistoryPerPage,
    setMoveHistoryPerPage,
    kindColors,
    setKindColors,
    expensesPerPage,
    setExpensesPerPage,
    expensesFilters,
    setExpensesFilters,
    incomePerPage,
    setIncomePerPage,
    paymentsPerPage,
    setPaymentsPerPage,
    transferHistoryPerPage,
    setTransferHistoryPerPage,
    accountIconColors,
    setAccountIconColors,
    investmentHistoryPerPage,
    setInvestmentHistoryPerPage,
    cardIconColors,
    setCardIconColors,
    statementLangByProfile,
    setStatementLangByProfile,
    dashboardPrefs,
    setDashboardPrefs,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
