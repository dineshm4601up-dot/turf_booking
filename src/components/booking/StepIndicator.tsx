import { Check } from "lucide-react";

interface Step {
  label: string;
  complete: boolean;
}

export function StepIndicator({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="Booking steps">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-2 shrink-0">
          <span
            className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
              step.complete
                ? "bg-turf-600 text-white"
                : "bg-slate-200 text-slate-500"
            }`}
            aria-hidden="true"
          >
            {step.complete ? <Check className="size-3.5" /> : index + 1}
          </span>
          <span
            className={`text-xs font-medium whitespace-nowrap ${
              step.complete ? "text-turf-700" : "text-slate-500"
            }`}
          >
            {step.label}
          </span>
          {index < steps.length - 1 && (
            <span className="mx-1 h-px w-4 shrink-0 bg-slate-300" aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
  );
}
