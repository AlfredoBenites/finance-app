// The accounts this browser knows about, so you can switch between them without
// logging out and back in.
//
// An account is only kept SIGNED IN when you turn on "stay signed in on this
// device" for it. Only then is its Supabase refresh token written here, and
// switching to it is instant. Otherwise nothing but the email address is kept
// and switching asks for the password, the same as a fresh login.
//
// The token for whichever account is active is already in this browser's
// storage — that is how staying logged in works at all. Keeping a second one is
// the same kind of exposure, so it stays opt-in and per account, and "Forget"
// removes it.
const KEY = "auth.accounts";

// Same-tab listeners; the browser only fires `storage` in OTHER tabs.
export const ACCOUNTS_CHANGED = "auth-accounts-changed";

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // unreadable storage shouldn't take down login
  }
}

function write(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(ACCOUNTS_CHANGED));
}

// Most recently used first, so the account you keep flipping to stays on top.
export function listAccounts() {
  return read().sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
}

export function isRemembered(id) {
  return !!read().find((a) => a.id === id)?.remembered;
}

export function tokensFor(id) {
  const entry = read().find((a) => a.id === id);
  return entry?.remembered && entry.refresh_token ? entry : null;
}

// Record the signed-in account. Called on every auth change, which matters:
// Supabase rotates the refresh token on each renewal, so a saved copy goes stale
// within the hour unless it is kept in step with the live session.
export function syncCurrent(session, { lastUsed = false } = {}) {
  const user = session?.user;
  if (!user) return;
  const list = read();
  const existing = list.find((a) => a.id === user.id);
  const entry = existing || { id: user.id, email: user.email, remembered: false };
  entry.email = user.email || entry.email;
  if (lastUsed || !entry.lastUsed) entry.lastUsed = Date.now();
  if (entry.remembered) {
    entry.access_token = session.access_token;
    entry.refresh_token = session.refresh_token;
  } else {
    delete entry.access_token;
    delete entry.refresh_token;
  }
  write(existing ? list : [...list, entry]);
}

// Turn "stay signed in" on or off for an account. Turning it on stores the
// tokens of the session passed in (which must belong to that account); turning
// it off drops them immediately, leaving only the email behind.
export function setRemembered(id, remembered, session) {
  const list = read();
  const entry = list.find((a) => a.id === id);
  if (!entry) return;
  entry.remembered = remembered;
  if (remembered && session?.user?.id === id) {
    entry.access_token = session.access_token;
    entry.refresh_token = session.refresh_token;
  }
  if (!remembered) {
    delete entry.access_token;
    delete entry.refresh_token;
  }
  write(list);
}

// Drop an account from this device entirely, tokens included.
export function forgetAccount(id) {
  write(read().filter((a) => a.id !== id));
}

// Keep the account listed but make it need a password again. Used when a stored
// token turns out to be dead (revoked, or a password change elsewhere).
export function dropTokens(id) {
  const list = read();
  const entry = list.find((a) => a.id === id);
  if (!entry) return;
  entry.remembered = false;
  delete entry.access_token;
  delete entry.refresh_token;
  write(list);
}
