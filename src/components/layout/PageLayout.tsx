import type { HTMLAttributes, ReactNode } from "react";

type LayoutProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function PageLayout({ children, className = "", ...props }: LayoutProps) {
  return (
    <div className={`w-full min-w-0 space-y-6 ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export function ContentStack({ children, className = "", ...props }: LayoutProps) {
  return (
    <div className={`min-w-0 space-y-5 ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export function MasterDetailLayout({ children, className = "", ...props }: LayoutProps) {
  return (
    <div className={`grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)] ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export function StatisticsGrid({ children, className = "", ...props }: LayoutProps) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-4 ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
