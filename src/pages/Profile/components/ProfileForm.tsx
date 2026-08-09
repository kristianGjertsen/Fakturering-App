import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../../components/Button";
import { Panel, PanelHeader } from "../../../components/layout/Panel";
import { fetchProfileDetails, saveProfileDetails } from "../../../lib/data";
import {
  createProfileBankAccountFormRow,
  ProfileBankAccountFields,
  type ProfileBankAccountFormRow,
} from "./ProfileBankAccountFields";
import {
  ProfileDetailsFields,
  type ProfileDetailsFormValue,
} from "./ProfileDetailsFields";

export type ProfileFeedbackTone = "info" | "danger";

type ProfileFormProps = {
  userId: string;
  email: string;
  onFeedback: (message: string, tone: ProfileFeedbackTone) => void;
};

type ProfileFormState = ProfileDetailsFormValue & {
  invoiceNumberPrefix: string;
  nextInvoiceNumber: string;
  bankAccounts: ProfileBankAccountFormRow[];
};

function createEmptyProfileFormState(): ProfileFormState {
  return {
    fullName: "",
    companyName: "",
    address: "",
    postalAddress: "",
    country: "NO",
    orgNumber: "",
    invoiceNumberPrefix: "",
    nextInvoiceNumber: "10000",
    bankAccounts: [createProfileBankAccountFormRow()],
  };
}

export function ProfileForm({ userId, email, onFeedback }: ProfileFormProps) {
  const [form, setForm] = useState(createEmptyProfileFormState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      onFeedback("", "info");

      try {
        const { profile, bankAccounts } = await fetchProfileDetails(userId);

        if (cancelled) {
          return;
        }

        setForm({
          fullName: profile.full_name ?? "",
          companyName: profile.company_name ?? "",
          address: profile.address ?? "",
          postalAddress: profile.postal_address ?? "",
          country: profile.country ?? "NO",
          orgNumber: profile.org_number ?? "",
          invoiceNumberPrefix: profile.invoice_number_prefix ?? "",
          nextInvoiceNumber: formatInvoiceNumber(
            "",
            profile.last_invoice_number + 1,
            profile.invoice_number_padding_width ?? 0,
          ),
          bankAccounts: bankAccounts.length > 0
            ? bankAccounts.map((account) => ({
                localId: account.id,
                account_name: account.account_name,
                account_number: account.account_number,
              }))
            : [createProfileBankAccountFormRow()],
        });
      } catch (error) {
        if (!cancelled) {
          onFeedback(
            error instanceof Error ? error.message : "Kunne ikke hente profil.",
            "danger",
          );
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
  }, [onFeedback, userId]);

  function updateField<Key extends keyof ProfileFormState>(
    field: Key,
    value: ProfileFormState[Key],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) {
      return;
    }

    const normalizedBankAccounts = form.bankAccounts
      .map((account) => ({
        account_name: account.account_name.trim(),
        account_number: account.account_number.trim(),
      }))
      .filter((account) => account.account_name || account.account_number);

    if (
      normalizedBankAccounts.length === 0 ||
      normalizedBankAccounts.some((account) => !account.account_name || !account.account_number)
    ) {
      onFeedback("Legg inn navn og kontonummer for minst en konto.", "danger");
      return;
    }

    setSaving(true);
    onFeedback("", "info");

    try {
      await saveProfileDetails({
        full_name: form.fullName,
        company_name: form.companyName,
        address: form.address,
        postal_address: form.postalAddress,
        country: form.country,
        org_number: form.orgNumber,
        bank_accounts: normalizedBankAccounts,
      });

      onFeedback("Profilen er lagret.", "info");
      updateField(
        "bankAccounts",
        normalizedBankAccounts.map((account) => ({
          localId: crypto.randomUUID(),
          ...account,
        })),
      );
    } catch (error) {
      onFeedback(
        error instanceof Error ? error.message : "Kunne ikke lagre profil.",
        "danger",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Profilinformasjon"
        description={loading ? "Laster profil..." : "Oppdater firmaopplysninger og kontoer."}
      />

      <form onSubmit={(event) => void handleSaveProfile(event)} className="mt-5 space-y-5">
        <ProfileDetailsFields
          email={email}
          value={form}
          disabled={loading}
          onChange={(field, value) =>
            setForm((current) => ({ ...current, [field]: value }))
          }
        />

        <ProfileBankAccountFields
          accounts={form.bankAccounts}
          disabled={loading}
          onChange={(bankAccounts) => updateField("bankAccounts", bankAccounts)}
        />

        <div className="rounded-md border border-blue-100 bg-blue-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Fakturanummerserie</h3>
          <div className="mt-3 rounded-md border border-blue-100 bg-white px-4 py-4">
            <p className="text-xs font-medium uppercase text-slate-500">Neste fakturanummer</p>
            <p className="mt-1 text-3xl font-semibold tracking-wide text-slate-950">
              {form.invoiceNumberPrefix}{form.nextInvoiceNumber || "10001"}
            </p>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Fakturanummerserien settes ved opprettelse av firmaet på Autofaktura og kan ikke endres i ettertid.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={loading || saving}>
            {saving ? "Lagrer..." : "Lagre profil"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function formatInvoiceNumber(prefix: string, number: number, paddingWidth: number) {
  return `${prefix}${String(number).padStart(Math.max(paddingWidth, String(number).length), "0")}`;
}
