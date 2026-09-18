import invoiceImage from "../landingPageImages/invoice.png";
import { Button } from "../../../components/Button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function InvoicingSection() {
  const navigate = useNavigate();
  return (
    <section id="fakturering" className="border-t border-blue-100 bg-white py-12 sm:py-16 lg:py-20" aria-labelledby="invoicing-title">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 id="invoicing-title" className="text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">
            Fakturaen</h2>
          <p className="mt-5 text-base leading-relaxed text-slate-600">
            Velg kunde, legg til fakturalinjer og se hvordan fakturaen blir før du sender den.
             Velg mellom klassisk, moderne og minimalistisk PDF-stil.</p>
          <div className="mt-7">
            <h3 className="text-base font-semibold text-slate-900">Send nå eller velg en dato</h3>
            <p className="mt-2 text-base leading-relaxed text-slate-600">Send fakturaen på e-post når den er klar, eller planlegg utsendingen til en senere dato.</p>
          </div>
          <div className="mt-7">
            <h3 className="text-base font-semibold text-slate-900">La faste oppdrag gå på gjentakelse</h3>
            <p className="mt-2 text-base leading-relaxed text-slate-600">Sett opp daglig, ukentlig eller månedlig fakturering med ønsket intervall. Neste utsending vises i oversikten.</p>
          </div>
          <div className="mt-7">
            <h3 className="text-base font-semibold text-slate-900">Følg opp betalingen</h3>
            <p className="mt-2 text-base leading-relaxed text-slate-600">Registrer innbetalingen når kunden har betalt, og send en betalingspåminnelse ved behov.</p>
          </div>
          <Button variant="secondary" className="mt-7" onClick={() => navigate("/register")}>Kom i gang med fakturering <ArrowRight size={18} aria-hidden="true" /></Button>
        </div>
        <figure className="mx-auto w-full max-w-lg overflow-hidden rounded-lg border border-blue-100 bg-slate-50 p-4 sm:p-6">
          <a href={invoiceImage} target="_blank" rel="noopener noreferrer" className="block cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600" aria-label="Åpne fakturaeksemplet i full størrelse i en ny fane">
            <img className="h-auto w-full border border-blue-100 bg-white shadow-sm" src={invoiceImage} alt="Eksempel på faktura med kundeinformasjon, fakturalinjer, mva. og betalingsinformasjon." loading="lazy" />
          </a>
          <figcaption className="mt-3 text-sm leading-relaxed text-slate-600">Et eksempel på fakturaen kunden mottar.</figcaption>
        </figure>
      </div>
    </section>
  );
}
