import { Button } from "../../../components/Button";
import type { PdfTemplate } from "../../../types";

type PdfTemplateSelectorProps = {
  value: PdfTemplate;
  onChange: (template: PdfTemplate) => void;
};

const templates: Array<{ id: PdfTemplate; label: string; description: string }> = [
  { id: "classic", label: "Klassisk", description: "Blå og tydelig" },
  { id: "modern", label: "Moderne", description: "Lysere kongeblå" },
  { id: "minimal", label: "Minimal", description: "Luftig med blå detaljer" },
];

export function PdfTemplateSelector({ value, onChange }: PdfTemplateSelectorProps) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">PDF-stil</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {templates.map((template) => (
          <Button
            key={template.id}
            className="h-auto flex-col px-2 py-2"
            variant={value === template.id ? "primary" : "secondary"}
            size="xs"
            onClick={() => onChange(template.id)}
          >
            <span>{template.label}</span>
            <span className="text-[10px] font-normal opacity-80">{template.description}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
