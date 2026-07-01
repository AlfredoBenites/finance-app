import { createContext, useContext, useEffect } from "react";
import usePersistedState from "../hooks/usePersistedState";

// Global "privacy mode": when on, money figures render as **** (hide-balances).
// The choice persists across refreshes. Read it with usePrivacy()
// and render amounts through the <Amount> component so masking is automatic.
const PrivacyContext = createContext({ hidden: false, toggle: () => {} });

export function PrivacyProvider({ children }) {
  const [hidden, setHidden] = usePersistedState("ui.privacyMode", false);

  // Optional: blur amounts on tab switch? Kept simple for now — explicit toggle only.
  useEffect(() => {}, [hidden]);

  return (
    <PrivacyContext.Provider value={{ hidden, toggle: () => setHidden((v) => !v) }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
