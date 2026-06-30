export function byId<T extends HTMLElement>(id: string): T { const element = document.getElementById(id); if (!element) throw new Error("Missing required element #" + id); return element as T; }
export function escapeHtml(value: string): string { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
