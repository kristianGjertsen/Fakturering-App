import { Button } from "../../../components/Button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import dashboard from "../landingPageImages/dashboard.png";

export function LandingHero() {
  const navigate = useNavigate();
  return (
    <section className="bg-slate-50 py-12 sm:py-16 lg:py-20" aria-labelledby="hero-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-16">
          <h1 id="hero-title" className="text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            Helt enkelt 
            <span className="mt-2 pl-10 block text-blue-700">Helt gratis</span>
          </h1>
          <div className="space-y-4 text-base leading-relaxed text-slate-600 sm:text-lg">
            <p>Registrer kunder, produkter, fakturering og regnskap i AutoFaktura, og hold oversikten på ett sted.</p>
            <p>Lag utkast til fakturaer og send dem direkte fra appen.</p>
            <p>Lag gjentatte fakturaer automatisk som sendes ut på bestemte datoer.</p>
            <div className="pt-2">
              <Button size="lg" onClick={() => navigate("/register")}>Opprett bruker <ArrowRight size={18} aria-hidden="true" /></Button>
            </div>
          </div>
        </div>
        <div className="mt-10 sm:mt-14">
          <img
            className="h-auto w-full rounded-2xl border border-blue-100 shadow-sm"
            src={dashboard}
            alt="Oversikten i AutoFaktura med kunder, produkter, utestående beløp, siste fakturaer og neste gjentakelse." />
        </div>
        <div className="mt-6 flex flex-col md:flex-row justify-center gap-4  md:gap-50 text-sm text-slate-600">
          <p>Lagre kundeinformasjon</p><p>Send nå, lagre utkast eller planlegg sending</p>
        </div>
      </div>
    </section>
  );
}
