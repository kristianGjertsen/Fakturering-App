import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "success" | "ghost";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const baseClass =
  "inline-flex items-center justify-center rounded-md font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-blue-700 text-white shadow-sm hover:bg-blue-900",
  secondary: "border border-blue-200 bg-white text-blue-800 shadow-sm hover:border-blue-300 hover:bg-blue-50",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
  ghost: "bg-transparent text-slate-700 hover:bg-blue-50 hover:text-blue-900",
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: "gap-1 px-2 py-1 text-xs",
  sm: "gap-1.5 px-3 py-1.5 text-sm",
  md: "gap-2 px-4 py-2 text-sm",
  lg: "gap-2 px-5 py-3 text-base",
};

export function Button({ children, className = "", variant = "primary", size = "md", type = "button", ...props }: ButtonProps) {
  return (
    <button className={`${baseClass} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim()} type={type} {...props}>
      {children}
    </button>
  );
}
