import type { FormEvent } from "react";
import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const response = isRegistering
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (response.error) {
      setMessage(response.error.message);
    } else if (isRegistering) {
      setMessage("Bruker opprettet. Sjekk e-post hvis bekreftelse er aktivert.");
    }

    setLoading(false);
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
          <label className="block">
            <span className="text-sm font-medium text-slate-700">E-post</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Passord</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </label>

          {message && <p className="text-sm text-slate-600">{message}</p>}

          <button
            className="w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
            type="submit"
            disabled={loading}
          >
            {loading ? "Vent..." : isRegistering ? "Opprett bruker" : "Logg inn"}
          </button>
        </form>

        <button
          className="mt-4 w-full text-sm text-slate-600 underline"
          type="button"
          onClick={() => setIsRegistering((value) => !value)}
        >
          {isRegistering ? "Har du bruker? Logg inn" : "Ingen bruker? Opprett en"}
        </button>
      </section>
    </main>
  );
}
