import type { InputHTMLAttributes } from "react";

type InputVariant = "default" | "soft" | "danger";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  variant?: InputVariant;
};

const baseClass =
  "w-full rounded-md border px-3 py-2 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:ring-2";

const variantClasses: Record<InputVariant, string> = {
  default: "border-blue-100 bg-white focus:border-blue-400 focus:ring-blue-100",
  soft: "border-blue-100 bg-blue-50/60 focus:border-blue-400 focus:bg-white focus:ring-blue-100",
  danger: "border-red-300 bg-red-50/40 focus:border-red-500 focus:ring-red-100",
};

export const inputClass = `${baseClass} ${variantClasses.default}`;

export function Input({
  className = "",
  type = "text",
  variant = "default",
  ...props
}: InputProps) {
  const isChoiceControl = type === "radio" || type === "checkbox";
  const classes = isChoiceControl
    ? className
    : `${baseClass} ${variantClasses[variant]} ${className}`.trim();

  return <input className={classes} type={type} {...props} />;
}
