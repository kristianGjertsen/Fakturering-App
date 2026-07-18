import type { ReactNode } from "react";

type NoticeProps = {
  children: ReactNode;
  tone?: "info" | "danger";
  className?: string;
};

const toneClasses = {
  info: "border-blue-100 bg-white text-blue-900 shadow-sm",
  danger: "border-red-200 bg-red-50 text-red-900",
};

export function Notice({ children, tone = "info", className = "" }: NoticeProps) {
  return (
    <p className={`rounded-md border px-4 py-3 text-sm ${toneClasses[tone]} ${className}`.trim()}>
      {children}
    </p>
  );
}
