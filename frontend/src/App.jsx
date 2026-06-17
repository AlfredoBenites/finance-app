import { useState } from "react";
import DashboardPage from "./pages/DashboardPage";
import ProfilesPage from "./pages/ProfilesPage";
import CreditCardsPage from "./pages/CreditCardsPage";
import TransactionsPage from "./pages/TransactionsPage";
import BucketsPage from "./pages/BucketsPage";
import AccountsPage from "./pages/AccountsPage";

const PAGES = [
  ["dashboard", "Dashboard"],
  ["profiles", "Profiles"],
  ["cards", "Credit Cards"],
  ["transactions", "Transactions"],
  ["buckets", "Buckets"],
  ["accounts", "Accounts"],
];

export default function App() {
  const [page, setPage] = useState("dashboard");

  return (
    <div className="container">
      <nav style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {PAGES.map(([key, label]) => (
          <button key={key} onClick={() => setPage(key)}>
            {label}
          </button>
        ))}
      </nav>

      {page === "dashboard" && <DashboardPage />}
      {page === "profiles" && <ProfilesPage />}
      {page === "cards" && <CreditCardsPage />}
      {page === "transactions" && <TransactionsPage />}
      {page === "buckets" && <BucketsPage />}
      {page === "accounts" && <AccountsPage />}
    </div>
  );
}
