const questions = [
  { question: "Kan jeg bruke AutoFaktura til både enkeltoppdrag og faste kunder?", answer: "Ja. Du kan opprette en enkeltfaktura, planlegge en utsending til en bestemt dato eller sette opp gjentakende fakturering for faste oppdrag." },
  { question: "Må jeg registrere kunden på nytt for hver faktura?", answer: "Nei. Når kunden er lagret, kan du bruke kundeinformasjonen igjen. Du kan også lagre produkter og tjenester på kunden, med pris og mva." },
  { question: "Hvordan følger jeg opp fakturaer som ikke er betalt?", answer: "Du finner fakturaene og betalingsstatusen i appen. Registrer betalingen når den kommer inn, eller send en betalingspåminnelse. Betalingsstatusen bygger på betalingene du registrerer." },
  { question: "Kan jeg stoppe en planlagt utsending?", answer: "Ja. Åpne den planlagte fakturaen eller gjentakelsen og velg «Slett plan». Du blir bedt om å bekrefte. Fremtidige utsendinger fra planen stoppes, mens fakturaer som allerede er opprettet, beholdes." },
];

export function QuestionsSection() {
  return (
    <section className="border-t border-blue-100 bg-white py-12 sm:py-16 lg:py-20" aria-labelledby="questions-title">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
        <h2 id="questions-title" className="text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">Lurer du på noe?</h2>
        <div className="min-w-0 border-t border-blue-100">
          {questions.map(({ question, answer }) => (
            <details key={question} className="border-b border-blue-100">
              <summary className="cursor-pointer py-5 text-base font-semibold leading-relaxed text-slate-900 marker:text-blue-700 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">{question}</summary>
              <p className="pb-5 text-base leading-relaxed text-slate-600">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
