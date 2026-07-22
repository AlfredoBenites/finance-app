import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, LogOut, Plus, X } from "lucide-react";
import { cn } from "./cn";
import Toggle from "./Toggle";
import { useAuth } from "../../auth/AuthContext";
import {
  ACCOUNTS_CHANGED,
  forgetAccount,
  listAccounts,
  setRemembered,
} from "../../auth/accounts";

// A small round avatar with the email's first letter. The full email is the
// title so it's reachable on hover.
function Avatar({ email, className }) {
  return (
    <span
      className={cn(
        "grid place-items-center rounded-full bg-control text-ink font-semibold uppercase shrink-0",
        className
      )}
      title={email}
    >
      {(email?.[0] || "?").toUpperCase()}
    </span>
  );
}

// How wide the menu renders (w-64 at the 110% root font), plus the margin to
// keep from the viewport edge. Used to clamp the portal position.
const MENU_WIDTH = 284;
const EDGE_GAP = 8;

// The account block in the sidebar footer: the current account, and a menu to
// switch to another, add one, keep this one signed in, or log out.
//
// The menu is PORTALED to <body>: the sidebar footer clips horizontal overflow
// on purpose (it's how the labels animate in), and this menu is wider than the
// sidebar, so rendered in place its right edge gets cut off.
export default function AccountMenu({ user, onSignOut, collapsed }) {
  const { session, switchOrLogin, requestLogin } = useAuth();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // { left, bottom } fixed coords
  // Re-read the stored accounts whenever they change (add/switch/forget/remember).
  const [accounts, setAccounts] = useState(listAccounts);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const refresh = () => setAccounts(listAccounts());
    window.addEventListener(ACCOUNTS_CHANGED, refresh);
    window.addEventListener("storage", refresh); // other tabs
    return () => {
      window.removeEventListener(ACCOUNTS_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    // The menu lives outside the button's DOM tree, so "outside" means
    // outside BOTH of them.
    const onDoc = (e) => {
      if (buttonRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    // The anchor only moves when the layout does; close rather than track it.
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const toggleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    // Anchor above the button, clamped so the whole menu stays on screen even
    // from the collapsed rail or a narrow phone.
    const rect = buttonRef.current.getBoundingClientRect();
    setPos({
      left: Math.max(EDGE_GAP, Math.min(rect.left, window.innerWidth - MENU_WIDTH - EDGE_GAP)),
      bottom: window.innerHeight - rect.top + EDGE_GAP,
    });
    setOpen(true);
  };

  const others = accounts.filter((a) => a.id !== user?.id);
  const current = accounts.find((a) => a.id === user?.id);
  const username = user?.email?.split("@")[0] || "Account";

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        title={user?.email}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1 rounded-md hover:bg-surface-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          collapsed && "md:justify-center"
        )}
      >
        <Avatar email={user?.email} className="h-7 w-7 text-xs" />
        <span
          className={cn(
            "text-sm text-ink text-left overflow-hidden whitespace-nowrap shrink-0 transition-[width] duration-300 ease-in-out",
            collapsed ? "md:w-0" : "md:w-40"
          )}
        >
          {username}
        </span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ left: pos.left, bottom: pos.bottom }}
            className="fixed z-[70] w-64 max-w-[calc(100vw-1rem)] bg-surface border border-border rounded-lg shadow-sm p-1.5"
          >
            {/* Current account */}
            <div className="flex items-center gap-2 px-2 py-2 min-w-0">
              <Avatar email={user?.email} className="h-8 w-8 text-sm" />
              <div className="min-w-0">
                <div className="text-sm text-ink truncate" title={user?.email}>{username}</div>
                <div className="text-xs text-muted truncate">{user?.email}</div>
              </div>
            </div>

            {/* Keep this account available without a password next time. */}
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="text-xs text-muted">Stay signed in here</span>
              <Toggle
                on={!!current?.remembered}
                onClick={() => setRemembered(user.id, !current?.remembered, session)}
              />
            </div>

            {others.length > 0 && (
              <div className="border-t border-border my-1 pt-1">
                <div className="px-2 py-1 text-xs text-muted">Switch account</div>
                {others.map((a) => (
                  <div
                    key={a.id}
                    className="group flex items-center gap-2 rounded-md hover:bg-surface-muted"
                  >
                    <button
                      onClick={() => {
                        setOpen(false);
                        switchOrLogin(a);
                      }}
                      className="flex-1 flex items-center gap-2 px-2 py-2 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
                    >
                      <Avatar email={a.email} className="h-7 w-7 text-xs" />
                      <span className="flex-1 text-sm text-ink truncate" title={a.email}>
                        {a.email}
                      </span>
                      {a.remembered ? (
                        <Check size={14} className="shrink-0 text-green" title="Signed in on this device" />
                      ) : (
                        <span className="shrink-0 text-[10px] text-muted uppercase tracking-wide">
                          password
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => forgetAccount(a.id)}
                      title="Forget this account"
                      aria-label={`Forget ${a.email}`}
                      className="shrink-0 mr-1 p-1 rounded text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-ink transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-border my-1 pt-1">
              <button
                onClick={() => {
                  setOpen(false);
                  requestLogin();
                }}
                className="w-full flex items-center gap-2 px-2 py-2 text-sm text-ink rounded-md hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Plus size={16} className="text-muted" />
                Add another account
              </button>
              <button
                onClick={onSignOut}
                className="w-full flex items-center gap-2 px-2 py-2 text-sm text-ink rounded-md hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <LogOut size={16} className="text-muted" />
                Log out
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
