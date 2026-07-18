import type { ElementType, HTMLAttributes, ReactNode } from "react";

type PanelProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  children: ReactNode;
  padding?: "none" | "normal";
};

type PanelHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function Panel({
  as: Component = "section",
  children,
  className = "",
  padding = "normal",
  ...props
}: PanelProps) {
  return (
    <Component
      className={`rounded-lg border border-blue-100 bg-white shadow-sm ${
        padding === "normal" ? "p-5" : ""
      } ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}

export function PanelHeader({ title, description, action, className = "" }: PanelHeaderProps) {
  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${className}`.trim()}
    >
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
