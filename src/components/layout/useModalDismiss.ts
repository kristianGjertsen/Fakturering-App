import { useEffect } from "react";

type ModalDismissOptions = {
  lockBodyScroll?: boolean;
};

export function useModalDismiss(
  open: boolean,
  onClose: () => void,
  { lockBodyScroll = false }: ModalDismissOptions = {},
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

    document.addEventListener("keydown", closeOnEscape);

    return () => {
      if (lockBodyScroll) {
        document.body.style.overflow = previousOverflow;
      }

      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [lockBodyScroll, onClose, open]);
}
