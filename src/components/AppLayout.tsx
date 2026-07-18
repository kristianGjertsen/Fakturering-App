import type { ReactNode } from "react";
import { AppFooter } from "./page-sections/Footer";
import { AppHeader } from "./page-sections/Header";

type AppLayoutProps = {
  children: ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-blue-50/50 text-slate-950">
      <AppHeader />
      <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      <AppFooter />
    </div>
  );
}
