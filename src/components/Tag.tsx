import type { ReactNode } from "react";
import type { StatusTone } from "./document-browser/types";

type TagProps = {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
};

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "border-slate-300 bg-slate-100 text-slate-700",
  info: "border-blue-300 bg-blue-100 text-blue-800",
  warning: "border-amber-300 bg-amber-100 text-amber-800",
  success: "border-emerald-300 bg-emerald-100 text-emerald-800",
  danger: "border-red-300 bg-red-100 text-red-800",
  purple: "border-violet-300 bg-violet-100 text-violet-800",
};

export function Tag({ children, tone = "neutral", className = "" }: TagProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold leading-none ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
