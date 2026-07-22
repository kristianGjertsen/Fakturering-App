import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { supabase } from "../../supabaseClient";
import {
  createRegistrationFormState,
  RegistrationFields,
} from "./components/RegistrationFields";

const authInputClassName =
  "mt-1 rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0";

export default function LoginPage() {
  const [registrationForm, setRegistrationForm] = useState(createRegistrationFormState);
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
      const normalizedBankAccounts = registrationForm.bankAccounts
        .map((account) => ({
          account_name: account.account_name.trim(),
          account_number: account.account_number.trim(),
        }))
        .filter((account) => account.account_name || account.account_number);

      if (
        isRegistering &&
        (normalizedBankAccounts.length === 0 ||
          normalizedBankAccounts.some((account) => !account.account_name || !account.account_number))
      ) {
        setMessage("Legg inn navn og kontonummer for minst en konto.");
        return;
      }

      const normalizedLastInvoiceNumber = Number(registrationForm.lastInvoiceNumber);
      if (
        isRegistering &&
        registrationForm.hasSentInvoicesBefore &&
        (!Number.isSafeInteger(normalizedLastInvoiceNumber) || normalizedLastInvoiceNumber < 0)
      ) {
        setMessage("Oppgi siste brukte fakturanummer som et heltall.");
        return;
      }

      const response = isRegistering
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: registrationForm.fullName.trim(),
                company_name: registrationForm.companyName.trim(),
                address: registrationForm.address.trim(),
                postal_address: registrationForm.postalAddress.trim(),
                country: registrationForm.country,
                org_number: registrationForm.orgNumber.trim(),
                bank_accounts: normalizedBankAccounts,
                has_sent_invoices_before: registrationForm.hasSentInvoicesBefore,
                last_invoice_number: registrationForm.hasSentInvoicesBefore
                  ? normalizedLastInvoiceNumber
                  : 9999,
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
            ? "For mange forsøk på kort tid. Vent litt og prøv igjen."
            : response.error.message,
        );
      } else if (isRegistering) {
        setMessage("Bruker opprettet. Sjekk e-post hvis bekreftelse er aktivert.");
      } else {
        window.location.href = "/";
      }
    } finally {
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
          Logg inn for å administrere kunder og fakturaer.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {isRegistering && (
            <RegistrationFields value={registrationForm} onChange={setRegistrationForm} />
          )}

          <AuthField
            label="E-post"
            type="email"
            value={email}
            onChange={setEmail}
          />
          <AuthField
            label="Passord"
            type="password"
            value={password}
            onChange={setPassword}
            minLength={6}
          />

          {message && <p className="text-sm text-slate-600">{message}</p>}

          <Button className="w-full" type="submit" disabled={loading}>
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
      </section>
    </main>
  );
}

type AuthFieldProps = {
  label: string;
  type: "email" | "password";
  value: string;
  onChange: (value: string) => void;
  minLength?: number;
};

function AuthField({ label, type, value, onChange, minLength }: AuthFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <Input
        className={authInputClassName}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        minLength={minLength}
      />
    </label>
  );
}
