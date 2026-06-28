import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  PieChart,
  Users,
  CreditCard,
  Receipt,
  Banknote,
  PiggyBank,
  Landmark,
  Wallet,
  TrendingUp,
  Share2,
  Moon,
  Sun,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Eye,
  EyeOff,
  X,
} from "lucide-react";
import { cn } from "./cn";
import { usePrivacy } from "../../privacy/PrivacyContext";

// Single source of truth for the nav: [path, label, Icon]. Paths match the
// routes in App.jsx. NavLink renders real <a> elements, so middle-click /
// ctrl-click opens a section in a new tab and active state is automatic.
export const NAV_ITEMS = [
  ["/dashboard", "Dashboard", LayoutDashboard],
  ["/insights", "Insights", PieChart],
  ["/profiles", "Profiles", Users],
  ["/cards", "Credit Cards", CreditCard],
  ["/transactions", "Expenses", Receipt],
  ["/income", "Income", Banknote],
  ["/buckets", "Buckets", PiggyBank],
  ["/payments", "Pay a card", Landmark],
  ["/accounts", "Accounts", Wallet],
  ["/investments", "Investments", TrendingUp],
  ["/shared", "Shared with me", Share2],
];

export default function Sidebar({
  user,
  onSignOut,
  dark,
  onToggleDark,
  collapsed,
  onToggleCollapse,
  onItemClick,
  onCloseMobile,
  className,
}) {
  const { hidden: amountsHidden, toggle: togglePrivacy } = usePrivacy();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col bg-surface border-r border-border transition-[width,transform] duration-200",
        // On mobile the drawer is always full-width; collapse only applies md+.
        collapsed ? "w-60 md:w-16" : "w-60",
        className
      )}
    >
      {/* Brand + collapse/close toggle */}
      <div
        className={cn(
          "flex items-center h-16 shrink-0 px-3",
          collapsed ? "md:justify-center justify-between" : "justify-between"
        )}
      >
        {/* Real link to "/" so clicking the brand reloads the app to home, and
            middle-click / ctrl-click opens it in a new tab. Hidden on desktop
            when collapsed, but always shown in the mobile drawer. */}
        <a
          href="/"
          className={cn(
            "flex items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            collapsed && "md:hidden"
          )}
        >
          <span className="grid place-items-center h-7 w-7 rounded-md bg-accent text-accent-ink font-bold text-sm">
            F
          </span>
          <span className="font-semibold text-ink">Finance</span>
        </a>
        {/* Collapse toggle — desktop only */}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden md:grid place-items-center h-8 w-8 rounded-md text-muted hover:bg-surface-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        {/* Close drawer — mobile only */}
        <button
          onClick={onCloseMobile}
          title="Close menu"
          aria-label="Close menu"
          className="md:hidden grid place-items-center h-8 w-8 rounded-md text-muted hover:bg-surface-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 space-y-0.5">
        {NAV_ITEMS.map(([path, label, Icon]) => (
          <NavLink
            key={path}
            to={path}
            onClick={onItemClick}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                "relative w-full flex items-center gap-3 py-2 rounded-md text-sm transition-colors text-left",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                collapsed ? "md:justify-center md:px-0 px-3" : "px-3",
                isActive
                  ? "bg-surface-muted text-ink font-medium"
                  : "text-muted hover:bg-surface-muted hover:text-ink"
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Accent marker on the active item */}
                <span
                  className={cn(
                    "absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-accent transition-opacity",
                    isActive ? "opacity-100" : "opacity-0"
                  )}
                />
                <Icon size={18} strokeWidth={2} />
                <span className={cn("truncate", collapsed && "md:hidden")}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer: privacy, theme toggle, user, logout */}
      <div className="shrink-0 border-t border-border p-2 space-y-1">
        <button
          onClick={togglePrivacy}
          title={amountsHidden ? "Show amounts" : "Hide amounts"}
          className={cn(
            "w-full flex items-center gap-3 py-2 rounded-md text-sm text-muted hover:bg-surface-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            collapsed ? "md:justify-center md:px-0 px-3" : "px-3"
          )}
        >
          {amountsHidden ? <EyeOff size={18} /> : <Eye size={18} />}
          <span className={cn(collapsed && "md:hidden")}>
            {amountsHidden ? "Show amounts" : "Hide amounts"}
          </span>
        </button>
        <button
          onClick={onToggleDark}
          title={dark ? "Light mode" : "Dark mode"}
          className={cn(
            "w-full flex items-center gap-3 py-2 rounded-md text-sm text-muted hover:bg-surface-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            collapsed ? "md:justify-center md:px-0 px-3" : "px-3"
          )}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
          <span className={cn(collapsed && "md:hidden")}>{dark ? "Light mode" : "Dark mode"}</span>
        </button>

        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1",
            collapsed ? "md:justify-center justify-between" : "justify-between"
          )}
        >
          <span className={cn("text-xs text-muted truncate", collapsed && "md:hidden")} title={user?.email}>
            {user?.email}
          </span>
          <button
            onClick={onSignOut}
            title="Log out"
            aria-label="Log out"
            className="shrink-0 text-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded p-1"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
