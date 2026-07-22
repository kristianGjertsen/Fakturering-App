import { useCallback, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Button } from "../../components/Button";
import { SectionHeader } from "../../components/SectionHeader";
import { Notice } from "../../components/layout/Notice";
import { Panel } from "../../components/layout/Panel";
import { deleteCurrentUser } from "../../lib/data";
import {
  ProfileForm,
  type ProfileFeedbackTone,
} from "./components/ProfileForm";

type ProfilePageProps = {
  session: Session;
  onSignOut: () => Promise<void>;
};

type Feedback = {
  message: string;
  tone: ProfileFeedbackTone;
};

export default function ProfilePage({ session, onSignOut }: ProfilePageProps) {
  const [feedback, setFeedback] = useState<Feedback>({ message: "", tone: "info" });
  const [deleting, setDeleting] = useState(false);

  const showFeedback = useCallback((message: string, tone: ProfileFeedbackTone) => {
    setFeedback({ message, tone });
  }, []);

  async function handleDeleteUser() {
    const confirmed = window.confirm(
      "Er du sikker på at du vil slette brukeren? Dette sletter kontoen og tilhørende data.",
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    showFeedback("", "danger");

    try {
      await deleteCurrentUser();
      await onSignOut();
    } catch (error) {
      showFeedback(
        error instanceof Error ? error.message : "Kunne ikke slette brukeren.",
        "danger",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <SectionHeader title="Profil" description="Brukerinformasjon og kontohandlinger." />

      {feedback.message && <Notice tone={feedback.tone}>{feedback.message}</Notice>}

      <ProfileForm
        userId={session.user.id}
        email={session.user.email ?? ""}
        onFeedback={showFeedback}
      />

      <Panel>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
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
