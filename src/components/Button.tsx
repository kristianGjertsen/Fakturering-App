import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Info } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "danger" | "success" | "ghost";
type ButtonSize = "xs" | "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  help?: ReactNode;
  helpLabel?: string;
};

const baseClass =
  "inline-flex items-center justify-center rounded-md border font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-blue-700 bg-blue-700 text-white shadow-sm hover:border-blue-900 hover:bg-blue-900",
  secondary: "border border-blue-200 bg-white text-blue-800 shadow-sm hover:border-blue-300 hover:bg-blue-50",
  danger: "border-red-600 bg-red-600 text-white shadow-sm hover:border-red-700 hover:bg-red-700",
  success: "border-emerald-600 bg-emerald-600 text-white shadow-sm hover:border-emerald-700 hover:bg-emerald-700",
  ghost: "border-transparent bg-transparent text-slate-700 hover:bg-blue-50 hover:text-blue-900",
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: "gap-1 px-2 py-1 text-xs",
  sm: "gap-1.5 px-3 py-1.5 text-sm",
  md: "gap-2 px-4 py-2 text-sm",
  lg: "gap-2 px-5 py-3 text-base",
};

export function Button({
  children,
  className = "",
  help,
  helpLabel = "Vis hjelp",
  variant = "primary",
  size = "md",
  type = "button",
  onBlur,
  onFocus,
  onMouseEnter,
  onMouseLeave,
  "aria-describedby": ariaDescribedBy,
  ...props
}: ButtonProps) {
  const helpId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpPinned, setHelpPinned] = useState(false);
  const hasHelp = Boolean(help);

  useEffect(() => {
    if (!helpOpen) return;

    function closeOnOutsidePress(event: PointerEvent) {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target)) {
        setHelpOpen(false);
        setHelpPinned(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setHelpOpen(false);
        setHelpPinned(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [helpOpen]);

  return (
    <button
      ref={buttonRef}
      className={`${baseClass} ${variantClasses[variant]} ${sizeClasses[size]} ${hasHelp ? "relative overflow-visible" : ""} ${className}`.trim()}
      type={type}
      aria-describedby={hasHelp && helpOpen ? [ariaDescribedBy, helpId].filter(Boolean).join(" ") : ariaDescribedBy}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        if (hasHelp) setHelpOpen(true);
      }}
      onMouseLeave={(event) => {
        onMouseLeave?.(event);
        if (!helpPinned) setHelpOpen(false);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        if (hasHelp) setHelpOpen(true);
      }}
      onBlur={(event) => {
        onBlur?.(event);
        if (!event.currentTarget.contains(event.relatedTarget) && !helpPinned) {
          setHelpOpen(false);
        }
      }}
      {...props}
    >
      {children}
      {hasHelp && (
        <span
          aria-hidden="true"
          title={helpLabel}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-current/10 text-current"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setHelpOpen((open) => !open || !helpPinned);
            setHelpPinned((pinned) => !pinned);
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <Info size={17} aria-hidden="true" />
        </span>
      )}
      {hasHelp && helpOpen && (
        <span
          id={helpId}
          role="tooltip"
          className="absolute right-0 top-full z-50 mt-2 w-max max-w-[min(22rem,calc(100vw-2rem))] rounded-md border border-blue-100 bg-white px-3.5 py-2.5 text-left text-sm font-normal leading-relaxed text-slate-700 shadow-xl shadow-slate-950/15"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {help}
        </span>
      )}
    </button>
  );
}
