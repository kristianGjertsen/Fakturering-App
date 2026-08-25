import { useEffect } from "react";

type ModalDismissOptions = {
  enabled?: boolean;
  lockBodyScroll?: boolean;
};

export function useModalDismiss(
  open: boolean,
  onClose: () => void,
  { enabled = true, lockBodyScroll = false }: ModalDismissOptions = {},
) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;

    if (lockBodyScroll) {
      document.body.style.overflow = "hidden";
    }

    if (enabled) {
      document.addEventListener("keydown", closeOnEscape);
    }

    return () => {
      if (lockBodyScroll) {
        document.body.style.overflow = previousOverflow;
      }

      if (enabled) {
        document.removeEventListener("keydown", closeOnEscape);
      }
    };
  }, [enabled, lockBodyScroll, onClose, open]);
}
