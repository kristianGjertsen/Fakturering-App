import { useState } from "react";
import { Button } from "../../../components/Button";
import productFormImage from "../landingPageImages/registerItems.png";
import productsImage from "../landingPageImages/items.png";

const views = [
  { label: "Registrer produkt", src: productFormImage, alt: "Registrering av produkt med beskrivelse, enhet, pris og mva.", caption: "Legg inn produktet eller tjenesten én gang." },
  { label: "Produktliste", src: productsImage, alt: "Produkter og tjenester lagret på kunden.", caption: "Finn igjen produkter og tjenester på kundesiden." },
];

export function ProductsSection() {
  const [active, setActive] = useState(0);
  const view = views[active];

  return (
    <section id="produkter" className="border-t border-blue-100 bg-slate-50 py-12 sm:py-16 lg:py-20" aria-labelledby="products-title">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 sm:px-8 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
        <div>
          <h2 id="products-title" className="text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">Samme tjeneste neste gang?<br />Da er den allerede klar.</h2>
          <p className="mt-5 text-base leading-relaxed text-slate-600">Lagre produkter og tjenester på kunden med beskrivelse, enhet, pris og mva. Hent dem frem igjen når du lager neste faktura.</p>
          <div className="mt-7">
            <h3 className="text-base font-semibold text-slate-900">Fra enkeltoppdrag til faste avtaler</h3>
            <p className="mt-2 text-base leading-relaxed text-slate-600">Enten du fakturerer arbeidstimer eller et fast beløp, slipper du å legge inn de samme opplysningene hver gang.</p>
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="Se produkter i appen">
            {views.map((item, index) => (
              <Button key={item.label} variant={active === index ? "primary" : "secondary"} size="sm" className="min-h-11" aria-pressed={active === index} aria-controls="products-preview" onClick={() => setActive(index)}>
                {item.label}
              </Button>
            ))}
          </div>
          <figure id="products-preview" className="overflow-hidden rounded-lg border border-blue-100 bg-white">
            <a href={view.src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600" aria-label={`${view.label}: åpne bildet i full størrelse i en ny fane`}>
              <img className="-my-[4px] block aspect-[4/3] w-full object-contain" src={view.src} alt={view.alt} loading="lazy" />
            </a>
            <figcaption className="border-t border-blue-100 px-4 py-3 text-sm leading-relaxed text-slate-600">{view.caption}</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
