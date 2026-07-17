export function AuthenticatedAppError({ message }: { message: string }) {
  return <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{message}</div>;
}

export function AuthenticatedAppLoading() {
  return (
    <div className="grid min-h-[360px] place-items-center rounded-lg border border-blue-100 bg-white text-sm text-slate-600 shadow-sm">
      Laster data...
    </div>
  );
}
