import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";

export type BankAccountFormRow = {
  localId: string;
  account_name: string;
  account_number: string;
};

type BankAccountFieldsProps = {
  accounts: BankAccountFormRow[];
  onChange: (accounts: BankAccountFormRow[]) => void;
};

export function createBankAccountFormRow(): BankAccountFormRow {
  return {
    localId: crypto.randomUUID(),
    account_name: "",
    account_number: "",
  };
}

export function BankAccountFields({ accounts, onChange }: BankAccountFieldsProps) {
  function updateAccount(
    localId: string,
    field: "account_name" | "account_number",
    value: string,
  ) {
    onChange(
      accounts.map((account) =>
        account.localId === localId ? { ...account, [field]: value } : account,
      ),
    );
  }

  function removeAccount(localId: string) {
    onChange(
      accounts.length === 1
        ? [createBankAccountFormRow()]
        : accounts.filter((account) => account.localId !== localId),
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">Kontonumre</span>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          onClick={() => onChange([...accounts, createBankAccountFormRow()])}
        >
          Legg til
        </Button>
      </div>
      <div className="mt-2 space-y-2">
        {accounts.map((account, index) => (
          <div key={account.localId} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              className="rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0"
              type="text"
              value={account.account_name}
              onChange={(event) => updateAccount(account.localId, "account_name", event.target.value)}
              placeholder="Navn"
              aria-label={`Kontonavn ${index + 1}`}
              required
            />
            <Input
              className="rounded-lg border-slate-300 bg-white text-base focus:border-slate-900 focus:ring-0"
              type="text"
              value={account.account_number}
              onChange={(event) => updateAccount(account.localId, "account_number", event.target.value)}
              placeholder="Kontonummer"
              aria-label={`Kontonummer ${index + 1}`}
              required
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeAccount(account.localId)}
            >
              Fjern
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
