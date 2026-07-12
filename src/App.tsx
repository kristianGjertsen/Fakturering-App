import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { ensureProfile } from "./lib/data";
import LoginPage from "./pages/Login/LoginPage";
import HomePage from "./pages/Home/HomePage";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function syncSession(nextSession: Session | null) {
      if (nextSession) {
        const fullName =
          typeof nextSession.user.user_metadata.full_name === "string"
            ? nextSession.user.user_metadata.full_name
            : null;

        try {
          await ensureProfile(nextSession.user.id, nextSession.user.email, fullName);
        } catch (error) {
          console.warn("Could not sync profile", error);
        }
      }

      setSession(nextSession);
    }

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        await syncSession(data.session);
      })
      .finally(() => {
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      void syncSession(newSession);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center text-slate-600">
        Laster...
      </main>
    );
  }

  return session ? <HomePage session={session} /> : <LoginPage />;
}
