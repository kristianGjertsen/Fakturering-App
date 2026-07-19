import type { FormEvent } from "react";
import { useState } from "react";
import { supabase } from "../../supabaseClient";
import SupabaseDebugPanel from "./LoginComponents/SupabaseDebugPanel";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";
import { countryOptions } from "../../lib/countries";

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

export default function LoginPage() {
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [postalAddress, setPostalAddress] = useState("");
  const [country, setCountry] = useState("NO");
  const [orgNumber, setOrgNumber] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankAccountFormRow[]>([createBankAccountRow()]);
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
      const normalizedBankAccounts = bankAccounts
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

      const response = isRegistering
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName.trim(),
                company_name: companyName.trim(),
                address: address.trim(),
                postal_address: postalAddress.trim(),
                country,
                org_number: orgNumber.trim(),
                bank_accounts: normalizedBankAccounts,
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
            ? "For mange forsok pa kort tid. Vent litt og prov igjen."
            : response.error.message
        );
      } else if (isRegistering) {
        setMessage("Bruker opprettet. Sjekk e-post hvis bekreftelse er aktivert.");
      } else {
        window.location.href = "/";
      }
    }
    finally {
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
          Logg inn for a administrere kunder og fakturaer.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {isRegistering && (
            <>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Navn</span>
                <Input
                  className="mt-1 rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0"
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required={isRegistering}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Firmanavn</span>
                <Input
                  className="mt-1 rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0"
                  type="text"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  required={isRegistering}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Adresse</span>
                <Input
                  className="mt-1 rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0"
                  type="text"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  required={isRegistering}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Postadresse</span>
                <Input
                  className="mt-1 rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0"
                  type="text"
                  value={postalAddress}
                  onChange={(event) => setPostalAddress(event.target.value)}
                  required={isRegistering}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Organisasjonsnummer</span>
                <Input
                  className="mt-1 rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0"
                  type="text"
                  value={orgNumber}
                  onChange={(event) => setOrgNumber(event.target.value)}
                  required={isRegistering}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Land</span>
                <Select
                  className="mt-1 rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0"
                  value={country}
                  options={countryOptions}
                  onChange={setCountry}
                  ariaLabel="Velg land"
                />
              </label>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-700">Kontonummere</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={() => setBankAccounts((accounts) => [...accounts, createBankAccountRow()])}
                  >
                    Legg til
                  </Button>
                </div>
                <div className="mt-2 space-y-2">
                  {bankAccounts.map((account, index) => (
                    <div key={account.localId} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <Input
                        className="rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0"
                        type="text"
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
                        placeholder="Navn"
                        aria-label={`Kontonavn ${index + 1}`}
                        required={isRegistering}
                      />
                      <Input
                        className="rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0"
                        type="text"
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
                        placeholder="Kontonummer"
                        aria-label={`Kontonummer ${index + 1}`}
                        required={isRegistering}
                      />
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
                      >
                        Fjern
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">E-post</span>
            <Input
              className="mt-1 rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Passord</span>
            <Input
              className="mt-1 rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </label>

          {message && <p className="text-sm text-slate-600">{message}</p>}

          <Button
            className="w-full"
            type="submit"
            disabled={loading}
          >
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

        <SupabaseDebugPanel />
      </section>
    </main>
  );
}
