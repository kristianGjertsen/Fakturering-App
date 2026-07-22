import { Button } from "../../../components/Button";
import { FormField } from "../../../components/FormField";
import { Input } from "../../../components/Input";

export type ProfileBankAccountFormRow = {
  localId: string;
  account_name: string;
  account_number: string;
};

type ProfileBankAccountFieldsProps = {
  accounts: ProfileBankAccountFormRow[];
  disabled: boolean;
  onChange: (accounts: ProfileBankAccountFormRow[]) => void;
};

export function createProfileBankAccountFormRow(): ProfileBankAccountFormRow {
  return {
    localId: crypto.randomUUID(),
    account_name: "",
    account_number: "",
  };
}

export function ProfileBankAccountFields({
  accounts,
  disabled,
  onChange,
}: ProfileBankAccountFieldsProps) {
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
        ? [createProfileBankAccountFormRow()]
        : accounts.filter((account) => account.localId !== localId),
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Kontonumre</h3>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onChange([...accounts, createProfileBankAccountFormRow()])}
          disabled={disabled}
        >
          Legg til konto
        </Button>
      </div>

      <div className="mt-3 space-y-3">
        {accounts.map((account, index) => (
          <div
            key={account.localId}
            className="grid gap-3 rounded-md border border-blue-100 p-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <FormField label="Navn">
              <Input
                value={account.account_name}
                onChange={(event) =>
                  updateAccount(account.localId, "account_name", event.target.value)
                }
                aria-label={`Kontonavn ${index + 1}`}
                disabled={disabled}
                required
              />
            </FormField>
            <FormField label="Kontonummer">
              <Input
                value={account.account_number}
                onChange={(event) =>
                  updateAccount(account.localId, "account_number", event.target.value)
                }
                aria-label={`Kontonummer ${index + 1}`}
                disabled={disabled}
                required
              />
            </FormField>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeAccount(account.localId)}
                disabled={disabled}
              >
                Fjern
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
