import { isValidStr } from "./commonCheck";

export function escapeHtml(str: string): string {
  if (!isValidStr(str)) {
    return undefined;
  }
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}