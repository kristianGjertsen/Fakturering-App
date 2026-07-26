import type { FormStep } from "./types";

const steps = [
  { number: 1, label: "Bedrift" },
  { number: 2, label: "Kontakt" },
  { number: 3, label: "Fakturering" },
] as const;

export function FormStepIndicator({ currentStep }: { currentStep: FormStep }) {
  return (
    <div>
      <div className="flex items-center" aria-label={`Steg ${currentStep} av 3`}>
        {steps.map((step, index) => {
          const active = step.number === currentStep;
          const completed = step.number < currentStep;

          return (
            <div key={step.number} className="flex min-w-0 flex-1 items-center last:flex-none">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    active || completed
                      ? "bg-blue-700 text-white"
                      : "border border-blue-200 bg-white text-slate-500"
                  }`}
                >
                  {completed ? "✓" : step.number}
                </span>
                <span className={`hidden text-xs font-semibold sm:block ${active ? "text-blue-900" : "text-slate-500"}`}>
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <span className={`mx-2 h-px min-w-5 flex-1 ${completed ? "bg-blue-500" : "bg-blue-100"}`} />
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs font-medium text-slate-500">Steg {currentStep} av 3</p>
    </div>
  );
}
