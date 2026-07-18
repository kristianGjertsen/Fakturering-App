import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { inputClass } from "./Input";

export type SelectOption = {
  value: string | number;
  label: string;
  disabled?: boolean;
};

type SelectProps = {
  value: string | number;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
};

export function Select({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  disabled = false,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const selectedIndex = options.findIndex((option) => String(option.value) === String(value));
  const selectedOption = options[selectedIndex];

  useEffect(() => {
    if (!open) return;

    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options));

    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open, selectedIndex]);

  function chooseOption(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;

    onChange(String(option.value));
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveHighlight(direction: 1 | -1) {
    if (options.length === 0) return;

    let nextIndex = highlightedIndex;
    for (let step = 0; step < options.length; step += 1) {
      nextIndex = (nextIndex + direction + options.length) % options.length;
      if (!options[nextIndex].disabled) {
        setHighlightedIndex(nextIndex);
        return;
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
      } else {
        moveHighlight(event.key === "ArrowDown" ? 1 : -1);
      }
      return;
    }

    if (open && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      chooseOption(highlightedIndex);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className={`${inputClass} flex items-center justify-between gap-3 text-left ${className}`.trim()}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span className="min-w-0 truncate">{selectedOption?.label ?? "Velg"}</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          id={menuId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-50 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-blue-100 bg-white p-1.5 shadow-xl shadow-blue-950/10"
        >
          {options.map((option, index) => {
            const selected = index === selectedIndex;
            const highlighted = index === highlightedIndex;

            return (
              <button
                key={`${option.value}-${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  selected
                    ? "bg-blue-100 font-semibold text-blue-950"
                    : highlighted
                      ? "bg-blue-50 text-slate-950"
                      : "text-slate-700 hover:bg-blue-50"
                } disabled:cursor-not-allowed disabled:opacity-50`}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => chooseOption(index)}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {selected && <CheckIcon />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function firstEnabledIndex(options: SelectOption[]) {
  const index = options.findIndex((option) => !option.disabled);
  return index >= 0 ? index : 0;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-blue-600 transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
    >
      <path d="m6 8 4 4 4-4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-blue-700"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="m5 10 3 3 7-7" />
    </svg>
  );
}
