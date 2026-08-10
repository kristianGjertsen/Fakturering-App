import type { StatusTone } from "./types";

export type StatusColorClasses = {
  badge: string;
  surface: string;
};

const STATUS_COLORS: Record<StatusTone, StatusColorClasses> = {
  neutral: {
    badge: "bg-slate-100 text-slate-700 ring-slate-300",
    surface: "border-slate-300 bg-slate-100",
  },
  info: {
    badge: "bg-blue-100 text-blue-800 ring-blue-300",
    surface: "border-blue-300 bg-blue-100",
  },
  warning: {
    badge: "bg-amber-100 text-amber-800 ring-amber-300",
    surface: "border-amber-300 bg-amber-100",
  },
  success: {
    badge: "bg-emerald-100 text-emerald-800 ring-emerald-300",
    surface: "border-emerald-300 bg-emerald-100",
  },
  danger: {
    badge: "bg-red-100 text-red-800 ring-red-300",
    surface: "border-red-300 bg-red-100",
  },
  purple: {
    badge: "bg-violet-100 text-violet-800 ring-violet-300",
    surface: "border-violet-300 bg-violet-100",
  },
};

export function getStatusColorClasses(
  tone: StatusTone = "neutral",
): StatusColorClasses {
  return STATUS_COLORS[tone];
}
