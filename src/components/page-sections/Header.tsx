import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../Button";

const tabs = [
  { to: "/", label: "Oversikt" },
  { to: "/companies", label: "Selskaper" },
  { to: "/invoices", label: "Fakturaer" },
  { to: "/recurring", label: "Gjentakelser" },
];

export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <header className="border-b border-blue-100 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex text-2xl font-semibold">
            <span className="text-slate-950">Auto</span>
            <span className="text-blue-700">Faktura</span>
          </div>

          <Button
            variant={location.pathname === "/profile" ? "primary" : "secondary"}
            size="sm"
            onClick={() => navigate("/profile")}
          >
            Profil
          </Button>
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Hovednavigasjon">
          {tabs.map((tab) => (
            <Button
              key={tab.to}
              className="shrink-0"
              variant={location.pathname === tab.to ? "primary" : "ghost"}
              size="sm"
              onClick={() => navigate(tab.to)}
            >
              {tab.label}
            </Button>
          ))}
        </nav>
      </div>
    </header>
  );
}
