type SummaryCardProps = {
  label: string;
  value: string | number;
  description: string;
};

export function SummaryCard({ label, value, description }: SummaryCardProps) {
  return (
    <Panel as="article">
      <h2 className="text-sm font-medium text-slate-600">{label}</h2>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </Panel>
  );
}
import { Panel } from "./layout/Panel";
