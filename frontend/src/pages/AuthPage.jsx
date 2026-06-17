import { useState } from "react";
import { supabase } from "../auth/supabaseClient";

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
    <div className="container" style={{ maxWidth: 360 }}>
      <h1>{mode === "login" ? "Log in" : "Sign up"}</h1>
      <form onSubmit={handleSubmit} style={{ flexDirection: "column" }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">{mode === "login" ? "Log in" : "Sign up"}</button>
      </form>

      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      {info && <p style={{ color: "#2563eb" }}>{info}</p>}

      <p>
        {mode === "login" ? "No account?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
            setInfo(null);
          }}
        >
          {mode === "login" ? "Sign up" : "Log in"}
        </button>
      </p>
    </div>
  );
}
