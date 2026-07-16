const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function maskValue(value: string | undefined) {
  if (!value) {
    return "missing";
  }

  if (value.length <= 10) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function SupabaseDebugPanel() {
  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <h2 className="font-semibold">Supabase debug</h2>
      <dl className="mt-2 space-y-1">
        <div className="flex justify-between gap-4">
          <dt>URL loaded</dt>
          <dd>{supabaseUrl ? "yes" : "no"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Key loaded</dt>
          <dd>{supabaseAnonKey ? "yes" : "no"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>URL preview</dt>
          <dd className="max-w-[16rem] truncate">{maskValue(supabaseUrl)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Key preview</dt>
          <dd className="max-w-[16rem] truncate">{maskValue(supabaseAnonKey)}</dd>
        </div>
      </dl>
    </section>
  );
}
