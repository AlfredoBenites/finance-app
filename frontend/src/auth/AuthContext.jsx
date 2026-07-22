import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { dropTokens, syncCurrent, tokensFor } from "./accounts";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // Non-null while a switch is mid-flight, so the shell can show which account
  // is being opened instead of a bare loading screen.
  const [switching, setSwitching] = useState(null);
  // Set when the login form should show even though someone is signed in:
  // adding a new account, or switching to a known one that isn't remembered.
  // { email } prefills the address; null email means a blank "add account" form.
  const [loginIntent, setLoginIntent] = useState(null);

  useEffect(() => {
    // Load any existing session on startup.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) syncCurrent(data.session);
      setLoading(false);
    });
    // Keep state in sync on login/logout/token refresh. The refresh case is why
    // syncCurrent runs here too: Supabase rotates the refresh token, so a
    // remembered account's saved copy has to move with it or it goes stale.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) syncCurrent(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Switch to a remembered account by restoring its tokens. Returns "password"
  // when the account isn't remembered (or its token is dead), so the caller can
  // send the user to the login screen with the email prefilled.
  const switchTo = useCallback(async (account) => {
    const saved = tokensFor(account.id);
    if (!saved) return "password";
    setSwitching(account);
    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: saved.access_token,
        refresh_token: saved.refresh_token,
      });
      if (error || !data.session) {
        // The stored token was revoked or expired past refresh; make this
        // account ask for a password again rather than looping on a dead token.
        dropTokens(account.id);
        return "password";
      }
      syncCurrent(data.session, { lastUsed: true });
      return "ok";
    } finally {
      setSwitching(null);
    }
  }, []);

  // Switch to `account`, or fall back to the login form (prefilled) when it
  // can't be done silently.
  const switchOrLogin = useCallback(
    async (account) => {
      if ((await switchTo(account)) === "password") {
        setLoginIntent({ email: account.email });
      }
    },
    [switchTo]
  );

  const value = {
    session,
    loading,
    switching,
    loginIntent,
    requestLogin: (email = null) => setLoginIntent({ email }),
    cancelLogin: () => setLoginIntent(null),
    user: session?.user ?? null,
    signOut: () => supabase.auth.signOut(),
    switchTo,
    switchOrLogin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
