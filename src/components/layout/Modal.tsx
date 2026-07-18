import { useEffect, type ReactNode } from "react";
import { Button } from "../Button";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  labelledBy: string;
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  labelledBy,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="my-4 w-full max-w-lg rounded-xl border border-blue-100 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <header className="flex items-start justify-between gap-4 border-b border-blue-100 px-6 py-5">
          <div>
            <h2 id={labelledBy} className="text-lg font-semibold text-slate-950">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 -mt-1 h-9 w-9 p-0 text-xl"
            onClick={onClose}
            aria-label="Lukk"
          >
            ×
          </Button>
        </header>
        <div className="px-6 py-5">{children}</div>
      </section>
    </div>
  );
}
