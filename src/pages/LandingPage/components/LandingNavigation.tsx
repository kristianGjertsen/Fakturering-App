import { Button } from "../../../components/Button";
import { Link, useNavigate } from "react-router-dom";

function Brand() {
  return (
    <Link
      to="/"
      className="whitespace-nowrap rounded text-2xl font-semibold tracking-tight text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
      aria-label="AutoFaktura – forsiden"
    >
      Auto<span className="text-blue-700">Faktura</span>
    </Link>
  );
}

export function LandingHeader() {
  const navigate = useNavigate();
  return (
    <header className="border-b border-blue-100 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:py-5">
        <Brand />
        <div className="flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>Logg inn</Button>
          <Button className="hidden sm:inline-flex" size="sm" onClick={() => navigate("/register")}>Registrer</Button>
        </div>
      </div>
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-blue-100 bg-white py-8 sm:py-10">
      <div className="mx-auto flex max-w-7xl gap-6 px-5 justify-center">
        <Brand />
      </div>
    </footer>
  );
}
