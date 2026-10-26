import { html, type TemplateResult } from "lit";

/**
 * DFX (r26): Random history's die. Its own small module, so the menu can
 * show it without loading the reveal (and the scenarios' data with it).
 */
export function randomHistoryIcon(cls: string): TemplateResult {
  return html`<svg
    viewBox="0 0 24 24"
    class=${cls}
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </svg>`;
}
