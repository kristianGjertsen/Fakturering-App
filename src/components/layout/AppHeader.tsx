import { useLocation, useNavigate } from "react-router-dom";
import { Repeat, Store, LayoutDashboard, User, Files } from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../AnimatedIconButton";

const navigationItems = [
  { to: "/", label: "Oversikt", icon: LayoutDashboard },
  { to: "/companies", label: "Selskaper", icon: Store },
  { to: "/invoices", label: "Fakturaer", icon: Files },
  { to: "/recurring", label: "Gjentakelser", icon: Repeat },
];

export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <header className="shrink-0 border-b border-blue-100 bg-white">
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex text-2xl font-semibold">
            <span className="text-slate-950">Auto</span>
            <span className="text-blue-700">Faktura</span>
          </div>

          <AnimatedIconButton
            icon={User}
            variant={location.pathname === "/profile" ? "primary" : "secondary"}
            size="sm"
            onClick={() => navigate("/profile")}
          >
            Profil
          </AnimatedIconButton>
        </div>

        <nav
          className="flex w-full gap-2 overflow-x-auto pb-1 sm:justify-center"
          aria-label="Hovednavigasjon"
        >
          {navigationItems.map((item) => (
            <AnimatedIconButton
              key={item.to}
              icon={item.icon}
              className="w-40 shrink-0"
              variant={isCurrentRoute(location.pathname, item.to) ? "primary" : "ghost"}
              size="sm"
              onClick={() => navigate(item.to)}
            >
              {item.label}
            </AnimatedIconButton>
          ))}
        </nav>
      </div>
    </header>
  );
}

function isCurrentRoute(pathname: string, route: string) {
  return pathname === route || (route !== "/" && pathname.startsWith(`${route}/`));
}
