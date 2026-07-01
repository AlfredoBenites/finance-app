import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import usePersistedState from "../../hooks/usePersistedState";
import Sidebar from "./Sidebar";
import { cn } from "./cn";

// Layout shell. Owns dark mode + the collapsed/expanded sidebar (both persist),
// and the mobile drawer (transient). On md+ the sidebar is a fixed rail and the
// content gets a left margin; on small screens the sidebar slides in over the
// content as a drawer, with a top bar + hamburger to open it.
export default function AppShell({ user, onSignOut, children }) {
  const [dark, setDark] = usePersistedState("ui.darkMode", false);
  const [collapsed, setCollapsed] = usePersistedState("ui.navCollapsed", false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-canvas">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 h-14 z-30 bg-surface border-b border-border flex items-center gap-3 px-4">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="grid place-items-center h-9 w-9 rounded-md text-muted hover:bg-surface-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Menu size={20} />
        </button>
        <a href="/" className="flex items-center gap-2">
          <span className="grid place-items-center h-6 w-6 rounded-md bg-accent text-accent-ink font-bold text-xs">
            F
          </span>
          <span className="font-semibold text-ink">Finance</span>
        </a>
      </div>

      {/* Drawer backdrop (mobile only) — always rendered so it can fade with the
          drawer; non-interactive when closed. */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-40 bg-black/40 transition-opacity duration-300",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <Sidebar
        user={user}
        onSignOut={onSignOut}
        dark={dark}
        onToggleDark={() => setDark((v) => !v)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onItemClick={() => setMobileOpen(false)}
        onCloseMobile={() => setMobileOpen(false)}
        className={cn(
          // Mobile: slide in/out. Desktop: always visible.
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      />

      <main
        className={cn(
          "min-h-screen transition-[margin] duration-200 pt-14 md:pt-0",
          collapsed ? "md:ml-16" : "md:ml-60"
        )}
      >
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
