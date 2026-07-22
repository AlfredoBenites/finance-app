import { useState } from "react";
import { supabase } from "../auth/supabaseClient";
import { useAuth } from "../auth/AuthContext";
import { setRemembered, syncCurrent } from "../auth/accounts";
import { Card, Button, Banner, Input, Toggle } from "../components/ui";

export default function AuthPage() {
  const { session, loginIntent, cancelLogin } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState(loginIntent?.email || "");
  const [password, setPassword] = useState("");
  // Off by default: only store an account's token when the user opts in.
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  // This form is over a live session when it was opened to add or switch
  // accounts, so it needs a way back to the app.
  const addingWhileSignedIn = !!session && !!loginIntent;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    try {
      // Call directly on supabase.auth so the methods keep their `this` binding.
      const { data, error } =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
        return;
      }
      // If email confirmation is on, signUp returns a user with no session.
      if (mode === "signup" && !data.session) {
        setInfo("Check your email to confirm your account, then log in.");
        return;
      }
      // On success with a session, AuthContext picks it up automatically. Record
      // the remember choice against the session we just got, since the token is
      // needed to store it.
      if (data.session) {
        syncCurrent(data.session, { lastUsed: true });
        if (remember) setRemembered(data.session.user.id, true, data.session);
        cancelLogin();
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Try again.");
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <span className="grid place-items-center h-8 w-8 rounded-md bg-accent text-accent-ink font-bold">
            F
          </span>
          <span className="text-lg font-semibold text-ink">Finance</span>
        </div>

        <Card className="space-y-4">
          <h1 className="text-2xl font-bold text-ink">
            {addingWhileSignedIn
              ? "Add an account"
              : mode === "login"
                ? "Log in"
                : "Sign up"}
          </h1>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Toggle
              on={remember}
              onClick={() => setRemember((v) => !v)}
              label="Stay signed in on this device"
              className="justify-between"
            />
            <Button type="submit" variant="primary" className="w-full">
              {mode === "login" ? "Log in" : "Sign up"}
            </Button>
          </form>

          {remember && (
            <p className="text-xs text-muted">
              Keeps this account signed in here so you can switch to it without a
              password. Only do this on a device you trust.
            </p>
          )}

          {error && <Banner tone="danger">{error}</Banner>}
          {info && <Banner tone="info">{info}</Banner>}

          <p className="text-sm text-muted">
            {mode === "login" ? "No account?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="text-green font-medium hover:underline"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError(null);
                setInfo(null);
              }}
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </p>

          {addingWhileSignedIn && (
            <button
              type="button"
              className="text-sm text-muted hover:text-ink"
              onClick={cancelLogin}
            >
              ← Back to your account
            </button>
          )}
        </Card>
      </div>
    </div>
  );
}
