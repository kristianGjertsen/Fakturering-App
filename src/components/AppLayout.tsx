import type { ReactNode } from "react";
import { AppFooter } from "./page-sections/AppFooter";
import { AppHeader } from "./page-sections/AppHeader";

export type AppView = "dashboard" | "companies" | "invoices" | "recurring" | "profile";

type AppLayoutProps = {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  children: ReactNode;
};

export function AppLayout({ activeView, onViewChange, children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-blue-50/50 text-slate-950">
      <AppHeader activeView={activeView} onViewChange={onViewChange} />
      <main className="mx-auto min-h-[calc(100vh-205px)] max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      <AppFooter />
    </div>
  );
}
