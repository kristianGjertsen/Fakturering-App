import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "Oversikt", end: true },
  { to: "/companies", label: "Selskaper" },
  { to: "/invoices", label: "Fakturaer" },
  { to: "/recurring", label: "Gjentakelser" },
];

export function AppHeader() {
  return (
    <header className="border-b border-blue-100 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Fakturering</p>
            <h1 className="text-2xl font-semibold text-slate-950">Fakturering-Test</h1>
          </div>
          <NavLink
            className={({ isActive }) =>
              `w-fit rounded-md px-3 py-2 text-sm font-medium shadow-sm transition ${
                isActive
                  ? "bg-blue-700 text-white"
                  : "border border-blue-200 bg-white text-blue-800 hover:border-blue-300 hover:bg-blue-50"
              }`
            }
            to="/profile"
          >
            Profil
          </NavLink>
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              className={({ isActive }) =>
                `shrink-0 rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive ? "bg-blue-700 text-white shadow-sm" : "bg-blue-50 text-blue-900 hover:bg-blue-100"
                }`
              }
              end={tab.end}
              to={tab.to}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
