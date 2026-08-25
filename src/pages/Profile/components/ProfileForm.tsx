import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { Panel, PanelHeader } from "../../../components/layout/Panel";
import { fetchProfileDetails, saveProfileDetails } from "../../../lib/data";
import { formatCurrency } from "../../../lib/format";
import { calculateRollingInvoiceTurnover, VAT_REGISTRATION_THRESHOLD } from "../../../lib/vatRegistration";
import type { InvoiceWithDetails, Profile } from "../../../types";
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
  invoices: InvoiceWithDetails[];
  onSaved: (profilePatch: Partial<Profile>) => void;
  onFeedback: (message: string, tone: ProfileFeedbackTone) => void;
};

type ProfileFormState = ProfileDetailsFormValue & {
  invoiceNumberPrefix: string;
  nextInvoiceNumber: string;
  isVatRegistered: boolean;
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
    isVatRegistered: false,
    bankAccounts: [createProfileBankAccountFormRow()],
  };
}

export function ProfileForm({ userId, email, invoices, onSaved, onFeedback }: ProfileFormProps) {
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
          isVatRegistered: profile.is_vat_registered ?? false,
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
        is_vat_registered: form.isVatRegistered,
        bank_accounts: normalizedBankAccounts,
      });

      onSaved({
        full_name: form.fullName.trim() || null,
        company_name: form.companyName.trim() || null,
        address: form.address.trim() || null,
        postal_address: form.postalAddress.trim() || null,
        country: form.country || "NO",
        org_number: form.orgNumber.trim() || null,
        is_vat_registered: form.isVatRegistered,
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

        <VatRegistrationPanel
          isVatRegistered={form.isVatRegistered}
          invoices={invoices}
          disabled={loading}
          onChange={(isVatRegistered) => updateField("isVatRegistered", isVatRegistered)}
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

function VatRegistrationPanel({ isVatRegistered, invoices, disabled, onChange }: {
  isVatRegistered: boolean;
  invoices: InvoiceWithDetails[];
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const turnover = calculateRollingInvoiceTurnover(invoices);
  const thresholdExceeded = turnover > VAT_REGISTRATION_THRESHOLD;
  const progress = Math.min(100, Math.max(0, turnover / VAT_REGISTRATION_THRESHOLD * 100));

  return (
    <section className="rounded-md border border-blue-100 bg-slate-50 p-4" aria-labelledby="vat-registration-heading">
      <label className="flex items-start gap-3">
        <Input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-blue-700"
          checked={isVatRegistered}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          <span id="vat-registration-heading" className="block text-sm font-semibold text-slate-950">Registrert i MVA-registeret</span>
          <span className="mt-1 block text-xs text-slate-500">Statusen brukes på virksomhetens fakturadokumenter.</span>
        </span>
      </label>

      <div className="mt-4 border-t border-blue-100 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">Estimert fakturaomsetning siste 12 måneder</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{formatWholeCurrency(turnover)} / {formatWholeCurrency(VAT_REGISTRATION_THRESHOLD)}</p>
          </div>
          <span className="text-sm font-medium text-slate-600">{Math.round(progress)} %</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-sm bg-slate-200" role="progressbar" aria-label="Omsetning mot MVA-grensen" aria-valuemin={0} aria-valuemax={VAT_REGISTRATION_THRESHOLD} aria-valuenow={Math.min(turnover, VAT_REGISTRATION_THRESHOLD)}>
          <div className={`h-full ${thresholdExceeded && !isVatRegistered ? "bg-red-600" : "bg-blue-700"}`} style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Som hovedregel må virksomheten registreres når avgiftspliktig omsetning uten MVA overstiger 50 000 kr i en periode på 12 måneder. Estimatet bruker ferdigstilte fakturaer og fakturadato; kontroller om salgene faktisk er MVA-pliktige.
        </p>
        {thresholdExceeded && !isVatRegistered && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800" role="alert">
            Omsetningen i appen er over 50 000 kr. Sjekk om bedriften skal meldes inn i MVA-registeret.
          </p>
        )}
        <a className="mt-3 inline-block text-sm font-medium text-blue-700 underline hover:text-blue-900" href="https://www.skatteetaten.no/bedrift-og-organisasjon/avgifter/mva/registrere-endre-slette/" target="_blank" rel="noreferrer">Les registreringsreglene hos Skatteetaten</a>
      </div>
    </section>
  );
}

function formatWholeCurrency(value: number) {
  return formatCurrency(value).replace(/,00(?=\s|$)/, "");
}

function formatInvoiceNumber(prefix: string, number: number, paddingWidth: number) {
  return `${prefix}${String(number).padStart(Math.max(paddingWidth, String(number).length), "0")}`;
}
