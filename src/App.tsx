import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Route, Routes } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { ensureProfile } from "./lib/data";
import LoginPage from "./pages/Login/LoginPage";
import LandingPage from "./pages/LandingPage/LandingPage";
import AuthenticatedApp from "./app/AuthenticatedApp";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  useEffect(() => {
    async function syncProfileAndSession(nextSession: Session | null) {
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
        await syncProfileAndSession(data.session);
      })
      .finally(() => {
        setIsLoadingSession(false);
      });

    const { data: authStateListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      void syncProfileAndSession(newSession);
    });

    return () => {
      authStateListener.subscription.unsubscribe();
    };
  }, []);

  if (isLoadingSession) {
    return (
      <main className="grid min-h-screen place-items-center text-slate-600">
        Laster...
      </main>
    );
  }

  return session ? <AuthenticatedApp session={session} /> : (
    <Routes>
      <Route path="/login" element={<LoginPage key="login" />} />
      <Route path="/register" element={<LoginPage key="register" initialRegistering />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}
