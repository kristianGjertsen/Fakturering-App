import { Button } from "../../../../components/Button";
import type { PdfTemplate } from "../../../../types";

type InvoicePdfTemplateSelectorProps = {
  value: PdfTemplate;
  onChange: (template: PdfTemplate) => void;
};

const PDF_TEMPLATE_OPTIONS: Array<{
  id: PdfTemplate;
  label: string;
}> = [
  { id: "classic", label: "Klassisk" },
  { id: "modern", label: "Moderne" },
  { id: "minimal", label: "Minimal" },
];

export function InvoicePdfTemplateSelector({
  value,
  onChange,
}: InvoicePdfTemplateSelectorProps) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">PDF-stil</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {PDF_TEMPLATE_OPTIONS.map((option) => (
          <Button
            key={option.id}
            className="px-2 py-2"
            variant={value === option.id ? "primary" : "secondary"}
            size="xs"
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
