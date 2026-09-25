import { Button } from "../../../components/Button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function GettingStartedSection() {
  const navigate = useNavigate();
  return (
    <section className="border-t border-blue-100 bg-blue-50 py-12 sm:py-16 lg:py-20" aria-labelledby="get-started-title">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
        <div>
          <h2 id="get-started-title" className="text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">Prøv selv</h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-600">Opprett en bruker, legg inn bedriften din og registrer den første fakturaen.</p>
        </div>
        <div className="flex flex-col items-start gap-3 lg:shrink-0">
          <Button size="lg" onClick={() => navigate("/register")}>Opprett bruker <ArrowRight size={18} aria-hidden="true" /></Button>
          <Button variant="ghost" onClick={() => navigate("/login")}>Har du allerede en bruker? Logg inn</Button>
        </div>
      </div>
    </section>
  );
}
