import { Notice } from "../components/layout/Notice";
import { Panel } from "../components/layout/Panel";

export function AuthenticatedAppError({ message }: { message: string }) {
  return <Notice tone="danger" className="mb-6">{message}</Notice>;
}

export function AuthenticatedAppLoading() {
  return (
    <Panel as="div" className="grid min-h-[360px] place-items-center text-sm text-slate-600">
      Laster data...
    </Panel>
  );
}
