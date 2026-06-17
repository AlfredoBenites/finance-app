// Supabase client used ONLY for authentication (login/signup/session).
// All application data goes through the FastAPI backend, never directly here.
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
