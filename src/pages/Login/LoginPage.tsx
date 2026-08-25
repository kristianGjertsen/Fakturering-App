import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { supabase } from "../../supabaseClient";
import { uploadAndImportSaftFile, validateSaftImportFile } from "../../lib/saftImportData";
import {
  createRegistrationFormState,
  RegistrationFields,
  RegistrationStepActions,
  type RegistrationStep,
} from "./components/RegistrationFields";

const authInputClassName =
  "mt-1 rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0";

export default function LoginPage() {
  const [registrationForm, setRegistrationForm] = useState(createRegistrationFormState);
  const [registrationStep, setRegistrationStep] = useState<RegistrationStep>(1);
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
      if (isRegistering && registrationStep < 3) {
        const stepError = validateRegistrationStep(registrationStep, registrationForm);
        if (stepError) {
          setMessage(stepError);
          return;
        }
        setRegistrationStep((step) => Math.min(3, step + 1) as RegistrationStep);
        return;
      }

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

      const parsedLastInvoiceNumber = parseInvoiceNumberInput(registrationForm.lastInvoiceNumber);
      if (
        isRegistering &&
        registrationForm.hasSentInvoicesBefore &&
        !parsedLastInvoiceNumber
      ) {
        setMessage("Oppgi siste brukte fakturanummer som tall, for eksempel 10000 eller 000001.");
        return;
      }

      if (isRegistering && registrationForm.saftImportFile) {
        const validationError = validateSaftImportFile(registrationForm.saftImportFile);
        if (validationError) {
          setMessage(validationError);
          return;
        }
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
                is_vat_registered: registrationForm.isVatRegistered,
                bank_accounts: normalizedBankAccounts,
                has_sent_invoices_before: registrationForm.hasSentInvoicesBefore,
                last_invoice_number: registrationForm.hasSentInvoicesBefore && parsedLastInvoiceNumber
                  ? parsedLastInvoiceNumber.number
                  : 9999,
                invoice_number_prefix: registrationForm.hasSentInvoicesBefore
                  ? registrationForm.invoiceNumberPrefix
                  : "",
                invoice_number_padding_width: registrationForm.hasSentInvoicesBefore && parsedLastInvoiceNumber
                  ? parsedLastInvoiceNumber.paddingWidth
                  : 0,
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
        if (registrationForm.saftImportFile && response.data.session?.user) {
          try {
            const { message } = await uploadAndImportSaftFile(
              response.data.session.user.id,
              registrationForm.saftImportFile,
            );
            setMessage(`Brukeren er opprettet. ${message}`);
          } catch (error) {
            setMessage(
              error instanceof Error
                ? `Brukeren er opprettet, men SAF-T-opplasting feilet: ${error.message}`
                : "Brukeren er opprettet, men SAF-T-opplasting feilet.",
            );
          }
        } else if (registrationForm.saftImportFile) {
          setMessage("Bekreft e-post for å fullføre registrering. Last opp SAF-T-filen fra Profil etter innlogging.");
        } else {
          setMessage("Bekreft e-post for å fullføre registrering. Sjekk innboksen din og eventuelt søppelposten.");
        }
      } else {
        window.location.href = "/";
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-3 py-4 sm:px-4">
      <section className="w-full max-w-lg rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:rounded-2xl sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          {isRegistering ? "Opprett bruker" : "Logg inn"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Logg inn for å administrere kunder og fakturaer.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 sm:mt-6">
          {isRegistering && (
            <RegistrationFields
              value={registrationForm}
              currentStep={registrationStep}
              onChange={setRegistrationForm}
              onMessage={setMessage}
            />
          )}

          {(!isRegistering || registrationStep === 3) && (
            <>
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
            </>
          )}

          {message && <p className="text-sm text-slate-600">{message}</p>}

          {isRegistering && registrationStep < 3 ? (
            <RegistrationStepActions
              currentStep={registrationStep}
              form={registrationForm}
              loading={loading}
              onBack={() => {
                setMessage("");
                setRegistrationStep((step) => Math.max(1, step - 1) as RegistrationStep);
              }}
              onNext={() => {
                const stepError = validateRegistrationStep(registrationStep, registrationForm);
                if (stepError) {
                  setMessage(stepError);
                  return;
                }
                setMessage("");
                setRegistrationStep((step) => Math.min(3, step + 1) as RegistrationStep);
              }}
            />
          ) : isRegistering ? (
            <div className="flex gap-2">
              <Button
                className="flex-1"
                type="button"
                variant="secondary"
                disabled={loading}
                onClick={() => {
                  setMessage("");
                  setRegistrationStep(2);
                }}
              >
                Tilbake
              </Button>
              <Button className="flex-1" type="submit" disabled={loading}>
                {loading ? "Vent..." : "Opprett bruker"}
              </Button>
            </div>
          ) : (
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Vent..." : "Logg inn"}
            </Button>
          )}
        </form>

        <Button
          className="mt-4 w-full underline"
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsRegistering((value) => !value);
            setMessage("");
            setRegistrationStep(1);
          }}
        >
          {isRegistering ? "Har du bruker? Logg inn" : "Ingen bruker? Opprett en"}
        </Button>
      </section>
    </main>
  );
}

function validateRegistrationStep(step: RegistrationStep, form: ReturnType<typeof createRegistrationFormState>) {
  if (step === 1) {
    return form.isSwitchingAccountingSystem === null
      ? "Velg om du bytter regnskapsprogram."
      : "";
  }

  if (step === 2) {
    if (!form.fullName.trim()) return "Skriv inn navn.";
    if (!form.companyName.trim()) return "Skriv inn firmanavn.";
    if (!form.address.trim()) return "Skriv inn adresse.";
    if (!form.postalAddress.trim()) return "Skriv inn postadresse.";
    if (!form.orgNumber.trim()) return "Skriv inn organisasjonsnummer.";
  }

  return "";
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

function parseInvoiceNumberInput(value: string) {
  const match = value.trim().match(/^(\d+)$/);

  if (!match) {
    return null;
  }

  const [, numberText] = match;
  const number = Number(numberText);

  if (!Number.isSafeInteger(number) || number < 0) {
    return null;
  }

  return {
    number,
    paddingWidth: numberText.length,
  };
}
