type StatCardProps = {
  label: string;
  value: string | number;
  helper: string;
};

export function StatCard({ label, value, helper }: StatCardProps) {
  return (
    <article className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-medium text-slate-600">{label}</h2>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
    </article>
  );
}
