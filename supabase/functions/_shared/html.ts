const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => HTML_ENTITIES[character]);
}
