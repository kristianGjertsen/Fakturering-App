import { ArrowRight, Check, FileText, Repeat } from "lucide-react";
import { Link } from "react-router-dom";

const linkClassName =
  "inline-flex items-center justify-center gap-2 rounded-md border px-5 py-3 text-base font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-blue-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <Link to="/" aria-label="AutoFaktura – forsiden" className="rounded text-2xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
            <span className="text-slate-950">Auto</span>
            <span className="text-blue-700">Faktura</span>
          </Link>
          <Link to="/login" className="rounded-md px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
            Logg inn <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <section aria-labelledby="hero-title" className="grid min-h-[calc(100svh-81px)] items-center gap-12 py-14 sm:py-20 lg:grid-cols-2 lg:gap-16">
          <div className="max-w-xl">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-medium text-blue-800">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-700" aria-hidden="true" />
              En enklere fakturahverdag
            </p>
            <h1 id="hero-title" className="text-4xl font-semibold leading-[1.1] tracking-tight text-slate-950 sm:text-5xl xl:text-6xl">
              Mindre fakturaarbeid.
              <span className="mt-2 block text-blue-700">Mer tid til bedriften.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-slate-600">
              Samle kunder, fakturaer og faste oppdrag på ett sted.
              AutoFaktura gjør det enkelt å sende fakturaer og holde oversikten.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/register" className={`${linkClassName} border-blue-700 bg-blue-700 text-white hover:border-blue-900 hover:bg-blue-900`}>
                Kom i gang <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/login" className={`${linkClassName} border-blue-200 bg-white text-blue-800 hover:border-blue-300 hover:bg-blue-50`}>
                Logg inn
              </Link>
            </div>
            <p className="mt-5 flex items-center gap-2 text-sm text-slate-500">
              <Repeat size={16} className="shrink-0 text-blue-700" aria-hidden="true" />
              Faste oppdrag? Sett faktureringen på gjentakelse.
            </p>
          </div>

        </section>
      </main>
    </div>
  );
}
