import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AppShell } from "./components/ui";
import SettingsModal from "./components/SettingsModal";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import InsightsPage from "./pages/InsightsPage";
import ProfilesPage from "./pages/ProfilesPage";
import CreditCardsPage from "./pages/CreditCardsPage";
import TransactionsPage from "./pages/TransactionsPage";
import BucketsPage from "./pages/BucketsPage";
import AccountsPage from "./pages/AccountsPage";
import SharedWithMePage from "./pages/SharedWithMePage";
import IncomePage from "./pages/IncomePage";
import PaymentsPage from "./pages/PaymentsPage";
import InvestmentsPage from "./pages/InvestmentsPage";

// Wrap pages not yet migrated to the new design system in `.legacy` so the
// temporary compatibility CSS keeps them looking the same. Remove the wrapper
// (and the page from this list) as each is restyled; delete legacy.css when none
// remain.
const legacy = (el) => <div className="legacy">{el}</div>;

export default function App() {
  const { loading, session, user, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-canvas text-muted">
        Loading…
      </div>
    );
  }
  if (!session) return <AuthPage />;

  return (
    <>
    <AppShell user={user} onSignOut={signOut}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/profiles" element={legacy(<ProfilesPage />)} />
        <Route path="/cards" element={<CreditCardsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/income" element={<IncomePage />} />
        <Route path="/buckets" element={legacy(<BucketsPage />)} />
        <Route path="/payments" element={legacy(<PaymentsPage />)} />
        <Route path="/accounts" element={legacy(<AccountsPage />)} />
        <Route path="/investments" element={legacy(<InvestmentsPage />)} />
        <Route path="/shared" element={legacy(<SharedWithMePage />)} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
    <SettingsModal />
    </>
  );
}
