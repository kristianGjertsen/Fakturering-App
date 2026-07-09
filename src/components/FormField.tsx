import type { ReactNode } from "react";

type FormFieldProps = {
  label: string;
  children: ReactNode;
  helper?: string;
};

export function FormField({ label, children, helper }: FormFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {helper && <span className="mt-1 block text-xs text-slate-500">{helper}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-blue-100 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

export const buttonPrimaryClass =
  "rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60";

export const buttonSecondaryClass =
  "rounded-md border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60";
