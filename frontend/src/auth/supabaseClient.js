// Supabase client used ONLY for authentication (login/signup/session).
// All application data goes through the FastAPI backend, never directly here.
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      // Keep the session in localStorage and refresh the access token in the
      // background so it doesn't go stale while a tab sits idle.
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
