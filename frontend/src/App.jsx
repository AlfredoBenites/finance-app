import { useState } from "react";
import { useAuth } from "./auth/AuthContext";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import ProfilesPage from "./pages/ProfilesPage";
import CreditCardsPage from "./pages/CreditCardsPage";
import TransactionsPage from "./pages/TransactionsPage";
import BucketsPage from "./pages/BucketsPage";
import AccountsPage from "./pages/AccountsPage";
import SharedWithMePage from "./pages/SharedWithMePage";
import IncomePage from "./pages/IncomePage";
import PaymentsPage from "./pages/PaymentsPage";
import InvestmentsPage from "./pages/InvestmentsPage";

const PAGES = [
  ["dashboard", "Dashboard"],
  ["profiles", "Profiles"],
  ["cards", "Credit Cards"],
  ["transactions", "Expenses"],
  ["income", "Income"],
  ["buckets", "Buckets"],
  ["payments", "Pay a card"],
  ["accounts", "Accounts"],
  ["investments", "Investments"],
  ["shared", "Shared with me"],
];

export default function App() {
  const { loading, session, user, signOut } = useAuth();
  const [page, setPage] = useState("dashboard");

  if (loading) return <div className="container">Loading…</div>;
  if (!session) return <AuthPage />;

  return (
    <div className="container">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <small>{user?.email}</small>
        <button onClick={signOut}>Log out</button>
      </div>

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
      {page === "income" && <IncomePage />}
      {page === "buckets" && <BucketsPage />}
      {page === "payments" && <PaymentsPage />}
      {page === "accounts" && <AccountsPage />}
      {page === "investments" && <InvestmentsPage />}
      {page === "shared" && <SharedWithMePage />}
    </div>
  );
}
