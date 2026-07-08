import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient";

type HomePageProps = {
  session: Session;
};

export default function HomePage({ session }: HomePageProps) {
  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Startside</h1>
            <p className="mt-1 text-sm text-slate-500">Innlogget som {session.user.email}</p>
          </div>

          <button
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            type="button"
            onClick={handleSignOut}
          >
            Logg ut
          </button>
        </header>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-medium text-slate-900">Kunder</h2>
            <p className="mt-2 text-3xl font-semibold text-slate-900">0</p>
            <p className="mt-1 text-sm text-slate-500">Registrerte kunder</p>
          </article>

          <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-medium text-slate-900">Fakturaer</h2>
            <p className="mt-2 text-3xl font-semibold text-slate-900">0</p>
            <p className="mt-1 text-sm text-slate-500">Sendt denne maneden</p>
          </article>

          <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-medium text-slate-900">Ubetalt</h2>
            <p className="mt-2 text-3xl font-semibold text-slate-900">0 kr</p>
            <p className="mt-1 text-sm text-slate-500">Apne fakturaer</p>
          </article>
        </section>
      </div>
    </main>
  );
}
