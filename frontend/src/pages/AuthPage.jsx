import { useState } from "react";
import { supabase } from "../auth/supabaseClient";
import { Card, Button, Banner, Input } from "../components/ui";

export default function AuthPage() {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

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
      }
      // On success with a session, AuthContext picks it up automatically.
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
            {mode === "login" ? "Log in" : "Sign up"}
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
            <Button type="submit" variant="primary" className="w-full">
              {mode === "login" ? "Log in" : "Sign up"}
            </Button>
          </form>

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
        </Card>
      </div>
    </div>
  );
}
