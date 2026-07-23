import type { Company } from "../../../../types";
import { Button } from "../../../../components/Button";
import { FormField } from "../../../../components/FormField";
import { Input } from "../../../../components/Input";
import { Select } from "../../../../components/Select";
import { Panel } from "../../../../components/layout/Panel";
import type { InvoiceKind, RecipientMode } from "../../invoiceBuilderModel";
import { InvoiceCreationTiming } from "./InvoiceBuilderSections";

type InvoiceInformationPanelProps = {
  companies: Company[];
  companyId: string;
  dueDate: string;
  invoiceKind: InvoiceKind;
  invoiceTitle: string;
  issueDate: string;
  paymentTermsDays: number;
  recipientEmail: string;
  recipientMode: RecipientMode;
  recipientName: string;
  scheduleOnce: boolean;
  onCompanyChange: (companyId: string) => void;
  onInvoiceTitleChange: (title: string) => void;
  onIssueDateChange: (issueDate: string) => void;
  onPaymentTermsDaysChange: (days: number) => void;
  onRecipientEmailChange: (email: string) => void;
  onRecipientNameChange: (name: string) => void;
  onRequestUnregisteredRecipient: () => void;
  onScheduleOnceChange: (scheduled: boolean) => void;
};

const UNREGISTERED_RECIPIENT_OPTION = "__guest__";
const PAYMENT_TERM_OPTIONS = [7, 14, 30];

export function InvoiceInformationPanel({
  companies,
  companyId,
  dueDate,
  invoiceKind,
  invoiceTitle,
  issueDate,
  paymentTermsDays,
  recipientEmail,
  recipientMode,
  recipientName,
  scheduleOnce,
  onCompanyChange,
  onInvoiceTitleChange,
  onIssueDateChange,
  onPaymentTermsDaysChange,
  onRecipientEmailChange,
  onRecipientNameChange,
  onRequestUnregisteredRecipient,
  onScheduleOnceChange,
}: InvoiceInformationPanelProps) {
  function handleCompanyChange(nextCompanyId: string) {
    if (nextCompanyId === UNREGISTERED_RECIPIENT_OPTION) {
      onRequestUnregisteredRecipient();
      return;
    }

    onCompanyChange(nextCompanyId);
  }

  return (
    <Panel>
      <h3 className="text-base font-semibold text-slate-950">Fakturainfo</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FormField
          label="Tittel"
          helper="Kun til intern oversikt. Vises ikke på PDF-en."
        >
          <Input
            value={invoiceTitle}
            onChange={(event) => onInvoiceTitleChange(event.target.value)}
            placeholder="Bruker fakturanummer hvis tom"
          />
        </FormField>
        <FormField label="Selskap">
          <Select
            ariaLabel="Selskap"
            value={recipientMode === "guest" ? UNREGISTERED_RECIPIENT_OPTION : companyId}
            options={[
              ...(companies.length === 0
                ? [{ value: "", label: "Ingen registrerte selskaper" }]
                : []),
              ...companies.map((company) => ({ value: company.id, label: company.name })),
              {
                value: UNREGISTERED_RECIPIENT_OPTION,
                label: "Ingen selskap (engangskunde)",
              },
            ]}
            onChange={handleCompanyChange}
          />
        </FormField>

        {recipientMode === "guest" && (
          <>
            <FormField label="Mottakernavn">
              <Input
                value={recipientName}
                onChange={(event) => onRecipientNameChange(event.target.value)}
                placeholder="Valgfritt navn"
              />
            </FormField>
            <FormField label="Mottakers e-post">
              <Input
                type="email"
                value={recipientEmail}
                onChange={(event) => onRecipientEmailChange(event.target.value)}
                placeholder="mottaker@eksempel.no"
                required
              />
            </FormField>
          </>
        )}

        {invoiceKind === "single" && (
          <FormField label="Fakturadato">
            <Input
              type="date"
              value={issueDate}
              onChange={(event) => onIssueDateChange(event.target.value)}
              required
            />
          </FormField>
        )}
        {invoiceKind === "single" && (
          <FormField
            label="Betalingsfrist"
            helper={`Forfallsdato blir ${dueDate.split("-").reverse().join(".")}.`}
          >
            <div className="space-y-2">
              <div className="relative">
                <Input
                  className="pr-16"
                  min={0}
                  max={365}
                  type="number"
                  value={paymentTermsDays}
                  onChange={(event) => onPaymentTermsDaysChange(
                    Math.max(0, Math.min(365, Number(event.target.value) || 0)),
                  )}
                  required
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">
                  dager
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2" aria-label="Velg betalingsfrist">
                {PAYMENT_TERM_OPTIONS.map((days) => (
                  <Button
                    key={days}
                    variant={paymentTermsDays === days ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => onPaymentTermsDaysChange(days)}
                  >
                    {days} dager
                  </Button>
                ))}
              </div>
            </div>
          </FormField>
        )}
      </div>

      {invoiceKind === "single" && recipientMode === "company" && (
        <InvoiceCreationTiming
          scheduled={scheduleOnce}
          onChange={onScheduleOnceChange}
        />
      )}
    </Panel>
  );
}
