import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { deleteCurrentUser } from "../lib/data";
import { buttonSecondaryClass } from "./FormField";
import { SectionHeader } from "./SectionHeader";

type ProfileViewProps = {
  session: Session;
  onSignOut: () => Promise<void>;
};

const dangerButtonClass =
  "rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60";

export function ProfileView({ session, onSignOut }: ProfileViewProps) {
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  const fullName =
    typeof session.user.user_metadata.full_name === "string"
      ? session.user.user_metadata.full_name
      : "";

  async function handleDeleteUser() {
    const confirmed = window.confirm(
      "Er du sikker på at du vil slette brukeren? Dette sletter kontoen og tilhørende data."
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setMessage("");

    try {
      await deleteCurrentUser();
      await onSignOut();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke slette brukeren.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Profil" description="Brukerinfo og kontohandlinger." />

      {message && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {message}
        </p>
      )}

      <section className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">E-post</dt>
            <dd className="mt-1 font-medium text-slate-950">{session.user.email ?? "Ukjent"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Navn</dt>
            <dd className="mt-1 font-medium text-slate-950">{fullName || "Ikke satt"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Sist logget inn</dt>
            <dd className="mt-1 font-medium text-slate-950">
              {session.user.last_sign_in_at
                ? new Date(session.user.last_sign_in_at).toLocaleString("no-NO")
                : "Ukjent"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-2">
          <button className={buttonSecondaryClass} type="button" onClick={() => void onSignOut()}>
            Logg ut
          </button>
          <button
            className={dangerButtonClass}
            type="button"
            onClick={() => void handleDeleteUser()}
            disabled={deleting}
          >
            {deleting ? "Sletter..." : "Slett bruker"}
          </button>
        </div>
      </section>
    </div>
  );
}
