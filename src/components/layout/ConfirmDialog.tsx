import { Button } from "../Button";
import { ModalOverlay } from "./ModalOverlay";

type ConfirmDialogTone = "danger" | "info";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const toneClasses: Record<ConfirmDialogTone, string> = {
  danger: "border-red-200 bg-red-50 text-red-900",
  info: "border-blue-100 bg-blue-50 text-blue-900",
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Avbryt",
  tone = "info",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <ModalOverlay
      open={open}
      onClose={onCancel}
      className="bg-slate-950/45"
      closeOnInteractOutside={!loading}
      zIndexClassName="z-[70]"
    >
      <section
        className="w-full max-w-md rounded-xl border border-blue-100 bg-white p-6 shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <div className={`rounded-md border px-4 py-3 text-sm ${toneClasses[tone]}`}>
          <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-950">
            {title}
          </h2>
          <p id="confirm-dialog-message" className="mt-2 leading-6 text-slate-700">
            {message}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </section>
    </ModalOverlay>
  );
}
