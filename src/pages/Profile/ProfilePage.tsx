import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { deleteCurrentUser } from "../../lib/data";
import { Button } from "../../components/Button";
import { SectionHeader } from "../../components/SectionHeader";
import { Panel } from "../../components/layout/Panel";
import { Notice } from "../../components/layout/Notice";

type ProfileViewProps = {
  session: Session;
  onSignOut: () => Promise<void>;
};

export default function ProfilePage({ session, onSignOut }: ProfileViewProps) {
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
    <>
      <SectionHeader title="Profil" description="Brukerinfo og kontohandlinger." />

      {message && (
        <Notice tone="danger">
          {message}
        </Notice>
      )}

      <Panel>
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
          <Button variant="secondary" onClick={() => void onSignOut()}>
            Logg ut
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleDeleteUser()}
            disabled={deleting}
          >
            {deleting ? "Sletter..." : "Slett bruker"}
          </Button>
        </div>
      </Panel>
    </>
  );
}
