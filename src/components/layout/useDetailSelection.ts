import { useSearchParams } from "react-router-dom";

// Keep the URL as the single source of truth for detail dialogs, including
// direct links and browser back/forward navigation.
export function useDetailSelection<T extends { id: string }>(
  parameter: string,
  items: readonly T[],
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedItem = items.find((item) => item.id === searchParams.get(parameter)) ?? null;
  const selectedId = selectedItem?.id ?? "";

  function updateSelection(id: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (id) {
        next.set(parameter, id);
      } else {
        next.delete(parameter);
      }
      return next;
    }, { replace: true });
  }

  function toggleSelection(id: string) {
    updateSelection(selectedId === id ? "" : id);
  }

  return { selectedItem, selectedId, updateSelection, toggleSelection };
}
