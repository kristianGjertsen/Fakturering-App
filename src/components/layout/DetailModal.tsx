import type { ReactNode } from "react";
import { Button } from "../Button";
import { useModalDismiss } from "./useModalDismiss";

type DetailModalProps = {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  title?: string;
  children: ReactNode;
};

export function DetailModal({ open, onClose, ariaLabel, title, children }: DetailModalProps) {
  useModalDismiss(open, onClose, { lockBodyScroll: true });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-2 sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="relative max-h-[calc(100vh-1rem)] w-full max-w-6xl overflow-y-auto rounded-xl border border-blue-100 bg-blue-50 p-3 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        <div className="sticky top-0 z-20 mb-3 flex items-center justify-between gap-3 bg-blue-50 pb-3 border-b border-gray-300">
          {title && (
            <h2 className="min-w-0 pl-1 truncate text-xl font-semibold text-slate-950">
              {title}
            </h2>

          )}
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto h-9 w-9 shrink-0 bg-white p-0 text-xl"
            onClick={onClose}
            aria-label="Lukk"
          >
            ×
          </Button>
        </div>
        {children}
      </section>
    </div>
  );
}
