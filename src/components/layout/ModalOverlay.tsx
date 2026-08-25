import type { ReactNode } from "react";
import { useModalDismiss } from "./useModalDismiss";

type ModalOverlayProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  closeOnInteractOutside?: boolean;
  lockBodyScroll?: boolean;
  role?: "presentation";
  zIndexClassName?: string;
};

export function ModalOverlay({
  open,
  onClose,
  children,
  className = "",
  closeOnInteractOutside = true,
  lockBodyScroll = true,
  role = "presentation",
  zIndexClassName = "z-50",
}: ModalOverlayProps) {
  useModalDismiss(open, onClose, { enabled: closeOnInteractOutside, lockBodyScroll });

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndexClassName} grid min-h-dvh place-items-center overflow-y-auto bg-slate-950/40 p-4 ${className}`.trim()}
      role={role}
      onMouseDown={(event) => {
        if (closeOnInteractOutside && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      {children}
    </div>
  );
}
