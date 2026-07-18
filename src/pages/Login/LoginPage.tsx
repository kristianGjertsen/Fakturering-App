import type { FormEvent } from "react";
import { useState } from "react";
import { supabase } from "../../supabaseClient";
import SupabaseDebugPanel from "./LoginComponents/SupabaseDebugPanel";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";

export default function LoginPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = isRegistering
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName.trim(),
              },
            },
          })
        : await supabase.auth.signInWithPassword({ email, password });

      if (response.error) {
        const isRateLimited =
          response.error.status === 429 ||
          response.error.message.toLowerCase().includes("rate limit");

        setMessage(
          isRateLimited
            ? "For mange forsok pa kort tid. Vent litt og prov igjen."
            : response.error.message
        );
      } else if (isRegistering) {
        setMessage("Bruker opprettet. Sjekk e-post hvis bekreftelse er aktivert.");
      } else {
        window.location.href = "/";
      }
    }
    finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-semibold text-slate-900">
          {isRegistering ? "Opprett bruker" : "Logg inn"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Logg inn for a administrere kunder og fakturaer.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {isRegistering && (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Navn</span>
              <Input
                className="mt-1 rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0"
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required={isRegistering}
              />
            </label>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">E-post</span>
            <Input
              className="mt-1 rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Passord</span>
            <Input
              className="mt-1 rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </label>

          {message && <p className="text-sm text-slate-600">{message}</p>}

          <Button
            className="w-full"
            type="submit"
            disabled={loading}
          >
            {loading ? "Vent..." : isRegistering ? "Opprett bruker" : "Logg inn"}
          </Button>
        </form>

        <Button
          className="mt-4 w-full underline"
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsRegistering((value) => !value);
            setMessage("");
          }}
        >
          {isRegistering ? "Har du bruker? Logg inn" : "Ingen bruker? Opprett en"}
        </Button>

        <SupabaseDebugPanel />
      </section>
    </main>
  );
}
