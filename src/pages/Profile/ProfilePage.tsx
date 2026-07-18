import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { deleteCurrentUser, fetchProfileDetails, saveProfileDetails } from "../../lib/data";
import { Button } from "../../components/Button";
import { FormField } from "../../components/FormField";
import { Input } from "../../components/Input";
import { SectionHeader } from "../../components/SectionHeader";
import { Panel, PanelHeader } from "../../components/layout/Panel";
import { Notice } from "../../components/layout/Notice";

type ProfileViewProps = {
  session: Session;
  onSignOut: () => Promise<void>;
};

type BankAccountFormRow = {
  localId: string;
  account_name: string;
  account_number: string;
};

const createBankAccountRow = (): BankAccountFormRow => ({
  localId: crypto.randomUUID(),
  account_name: "",
  account_number: "",
});

export default function ProfilePage({ session, onSignOut }: ProfileViewProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "danger">("info");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [postalAddress, setPostalAddress] = useState("");
  const [orgNumber, setOrgNumber] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankAccountFormRow[]>([createBankAccountRow()]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setMessage("");

      try {
        const { profile, bankAccounts: nextBankAccounts } = await fetchProfileDetails(session.user.id);

        if (cancelled) {
          return;
        }

        setFullName(profile.full_name ?? "");
        setCompanyName(profile.company_name ?? "");
        setAddress(profile.address ?? "");
        setPostalAddress(profile.postal_address ?? "");
        setOrgNumber(profile.org_number ?? "");
        setBankAccounts(
          nextBankAccounts.length > 0
            ? nextBankAccounts.map((account) => ({
                localId: account.id,
                account_name: account.account_name,
                account_number: account.account_number,
              }))
            : [createBankAccountRow()]
        );
      } catch (error) {
        if (!cancelled) {
          setMessageTone("danger");
          setMessage(error instanceof Error ? error.message : "Kunne ikke hente profil.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [session.user.id]);

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) {
      return;
    }

    const normalizedBankAccounts = bankAccounts
      .map((account) => ({
        account_name: account.account_name.trim(),
        account_number: account.account_number.trim(),
      }))
      .filter((account) => account.account_name || account.account_number);

    if (
      normalizedBankAccounts.length === 0 ||
      normalizedBankAccounts.some((account) => !account.account_name || !account.account_number)
    ) {
      setMessageTone("danger");
      setMessage("Legg inn navn og kontonummer for minst en konto.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await saveProfileDetails({
        full_name: fullName,
        company_name: companyName,
        address,
        postal_address: postalAddress,
        org_number: orgNumber,
        bank_accounts: normalizedBankAccounts,
      });

      setMessageTone("info");
      setMessage("Profilen er lagret.");
      setBankAccounts(
        normalizedBankAccounts.map((account) => ({
          localId: crypto.randomUUID(),
          ...account,
        }))
      );
    } catch (error) {
      setMessageTone("danger");
      setMessage(error instanceof Error ? error.message : "Kunne ikke lagre profil.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteUser() {
    const confirmed = window.confirm(
      "Er du sikker på at du vil slette brukeren? Dette sletter kontoen og tilhørende data."
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setMessageTone("danger");
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
        <Notice tone={messageTone}>
          {message}
        </Notice>
      )}

      <Panel>
        <PanelHeader
          title="Profilinformasjon"
          description={loading ? "Laster profil..." : "Oppdater firmaopplysninger og kontoer."}
        />

        <form onSubmit={(event) => void handleSaveProfile(event)} className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="E-post">
              <Input value={session.user.email ?? ""} disabled />
            </FormField>
            <FormField label="Navn">
              <Input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                disabled={loading}
              />
            </FormField>
            <FormField label="Firmanavn">
              <Input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                disabled={loading}
                required
              />
            </FormField>
            <FormField label="Organisasjonsnummer">
              <Input
                value={orgNumber}
                onChange={(event) => setOrgNumber(event.target.value)}
                disabled={loading}
                required
              />
            </FormField>
            <div>
              <FormField label="Adresse">
                <Input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  disabled={loading}
                  required
                />
              </FormField>
            </div>
            <FormField label="Postadresse">
              <Input
                value={postalAddress}
                onChange={(event) => setPostalAddress(event.target.value)}
                disabled={loading}
                required
              />
            </FormField>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-800">Kontonummere</h3>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setBankAccounts((accounts) => [...accounts, createBankAccountRow()])}
                disabled={loading}
              >
                Legg til konto
              </Button>
            </div>

            <div className="mt-3 space-y-3">
              {bankAccounts.map((account, index) => (
                <div key={account.localId} className="grid gap-3 rounded-md border border-blue-100 p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <FormField label="Navn">
                    <Input
                      value={account.account_name}
                      onChange={(event) =>
                        setBankAccounts((accounts) =>
                          accounts.map((nextAccount) =>
                            nextAccount.localId === account.localId
                              ? { ...nextAccount, account_name: event.target.value }
                              : nextAccount
                          )
                        )
                      }
                      aria-label={`Kontonavn ${index + 1}`}
                      disabled={loading}
                      required
                    />
                  </FormField>
                  <FormField label="Kontonummer">
                    <Input
                      value={account.account_number}
                      onChange={(event) =>
                        setBankAccounts((accounts) =>
                          accounts.map((nextAccount) =>
                            nextAccount.localId === account.localId
                              ? { ...nextAccount, account_number: event.target.value }
                              : nextAccount
                          )
                        )
                      }
                      aria-label={`Kontonummer ${index + 1}`}
                      disabled={loading}
                      required
                    />
                  </FormField>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setBankAccounts((accounts) =>
                          accounts.length === 1
                            ? [createBankAccountRow()]
                            : accounts.filter((nextAccount) => nextAccount.localId !== account.localId)
                        )
                      }
                      disabled={loading}
                    >
                      Fjern
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={loading || saving}>
              {saving ? "Lagrer..." : "Lagre profil"}
            </Button>
          </div>
        </form>
      </Panel>

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
