import accountingImage from "../landingPageImages/accounting.png";

export function AccountingSection() {
  return (
    <section id="regnskap" className="border-t border-blue-100 bg-slate-50 py-12 sm:py-16 lg:py-20" aria-labelledby="accounting-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-5 lg:grid-cols-2 lg:gap-16">
          <h2 id="accounting-title" className="text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">
            Detaljert regnskap</h2>
          <p className="text-base leading-relaxed text-slate-600">
            Se inntekter, kostnader og resultat per måned. Regnskapsoversikten samler nøkkeltallene og viser hvordan resultat og merverdiavgift er beregnet.</p>
           <p> Disse kan lastes ned i .csv fil.</p>
        </div>
        <figure className="mx-auto mt-8 max-w-5xl overflow-hidden rounded-lg border border-blue-100 bg-white sm:mt-10">
          <a href={accountingImage} target="_blank" rel="noopener noreferrer" className="block cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600" aria-label="Åpne regnskapsoversikten i full størrelse i en ny fane">
            <img className="h-auto w-full" src={accountingImage} alt="Regnskapsoversikt med resultat per måned, merverdiavgift, kundefordringer og leverandørgjeld." loading="lazy" />
          </a>
          <figcaption className="border-t border-blue-100 px-4 py-3 text-sm leading-relaxed text-slate-600">Resultat, mva. og åpne poster for det valgte regnskapsåret.</figcaption>
        </figure>
        <div className="mt-8 grid gap-7 border-t border-blue-100 pt-8 md:grid-cols-3 md:gap-8">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Hva kommer inn og går ut?</h3>
            <p className="mt-2 text-base leading-relaxed text-slate-600">Følg med på kundefordringer og leverandørgjeld ut fra registrert betalingsstatus.</p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Se grunnlaget</h3>
            <p className="mt-2 text-base leading-relaxed text-slate-600">Gå videre til bilag, kontoplan og rapporter når du trenger detaljene bak tallene.</p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Hold oversikt over mva.</h3>
            <p className="mt-2 text-base leading-relaxed text-slate-600">Se inngående og utgående merverdiavgift og differansen mellom dem.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
