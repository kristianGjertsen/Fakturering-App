import customerImage from "../landingPageImages/companyDetails.png";
import customersImage from "../landingPageImages/companyView.png";
import registrationImage from "../landingPageImages/registerCompany.png";
import { Button } from "../../../components/Button";
import { useId, useState } from "react";

const views = [
  { label: "Registrer kunde", image: { src: registrationImage, width: 3388, height: 1806, alt: "Registrering av en kunde med navn, organisasjonsnummer og adresse.", crop: { x: 1016, y: 487, width: 1340, height: 862 } }, caption: "Finn bedriften, legg inn kontaktinformasjon og velg fakturainnstillinger." },
  { label: "Kundeliste", image: { src: customersImage, width: 3388, height: 1806, alt: "Kundelisten med aktive og inaktive selskaper.", crop: { x: 460, y: 294, width: 2455, height: 670 } }, caption: "Finn igjen kundene dine i listen over registrerte selskaper." },
  { label: "Kundedetaljer", image: { src: customerImage, width: 3388, height: 1806, alt: "Kundedetaljer med kontaktinformasjon og fakturaoversikt.", crop: { x: 458, y: 288, width: 2460, height: 1448 } }, caption: "Se kontaktinformasjon, betalinger og utestående beløp for hver kunde." },
];

export function CustomersSection() {
  const [active, setActive] = useState(0);
  const id = useId();

  return (
    <section id="kunder" className="border-t border-blue-100 bg-white py-12 sm:py-16 lg:py-20" aria-labelledby="customers-title">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 sm:px-8 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
        <div>
          <h2 id="customers-title" className="text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">Lagre kundene<br />Slipp å skrive alt på nytt.</h2>
          <p className="mt-5 text-base leading-relaxed text-slate-600">Søk opp bedriften i Brønnøysundregistrene med navn eller organisasjonsnummer. Lagre kontaktinformasjon og betalingsfrist, så er opplysningene klare når du skal fakturere.</p>
          <div className="mt-7">
            <h3 className="text-base font-semibold text-slate-900">Én side for hver kunde</h3>
            <p className="mt-2 text-base leading-relaxed text-slate-600">Kundeinformasjon, produkter og fakturaer hører sammen. På kundesiden ser du også hva som er betalt, og hva som gjenstår.</p>
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-4 grid grid-cols-3 gap-2" role="group" aria-label="Se kundebehandlingen i appen">
            {views.map((view, index) => (
              <Button key={view.label} variant={active === index ? "primary" : "secondary"} size="sm" className="min-h-11" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-pressed={active === index} onClick={() => setActive(index)}>
                {view.label}
              </Button>
            ))}
          </div>
          {views.map((view, index) => (
            <div key={view.label} id={`${id}-panel-${index}`} role="region" aria-labelledby={`${id}-tab-${index}`} hidden={active !== index} tabIndex={0} className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">
              {active === index && (
                <figure className="overflow-hidden rounded-lg border border-blue-100 bg-slate-50">
                  <a href={view.image.src} target="_blank" rel="noopener noreferrer" className="block cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600" aria-label={`${view.label}: åpne bildet i full størrelse i en ny fane`}>
                    <img className="h-auto w-full" src={view.image.src} alt={view.image.alt} width={view.image.width} height={view.image.height} loading="lazy" />
                  </a>
                  <figcaption className="border-t border-blue-100 bg-white px-4 py-3 text-sm leading-relaxed text-slate-600">{view.caption}</figcaption>
                </figure>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
