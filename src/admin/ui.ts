// ADMIN (r26): small pieces every admin section uses: numbers and times,
// tables that turn into cards on a phone, pills, and the sign-in freshness.

import { html, nothing, TemplateResult } from "lit";

export const nf = (n: number | string | null | undefined): string =>
  n === null || n === undefined ? "–" : Number(n).toLocaleString("en-US");

/** +1,200 / −300, coloured. */
export function delta(n: number): TemplateResult {
  return html`<span class=${n >= 0 ? "adm-plus" : "adm-minus"}
    >${n > 0 ? "+" : n < 0 ? "−" : ""}${nf(Math.abs(n))}</span
  >`;
}

export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** "Tue 20 Oct, 5:20 pm" in the viewer's time (the year when not this one). */
export function when(iso: string | number | null | undefined): string {
  if (iso === null || iso === undefined) return "–";
  const d = new Date(iso);
  const now = new Date();
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function ago(
  iso: string | number | null | undefined,
  now = Date.now(),
): string {
  if (iso === null || iso === undefined) return "–";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} days ago`;
  return when(iso);
}

export function span(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${Math.max(1, m)} min`;
}

export type Tone = "good" | "bad" | "warn" | "blue" | "violet" | "";

export function pill(text: string, tone: Tone = ""): TemplateResult {
  return html`<span class="adm-pill ${tone}">${text}</span>`;
}

export interface Col<T> {
  label: string;
  cell: (row: T) => unknown;
  /** Right-aligned numbers. */
  num?: boolean;
  /** The row's name: leads its card on a phone. */
  lead?: boolean;
  cls?: string;
}

/** A dense table; under 640 px each row becomes a card of label: value lines. */
export function table<T>(
  cols: Col<T>[],
  rows: readonly T[],
  empty = "Nothing here.",
): TemplateResult {
  if (rows.length === 0) return html`<p class="adm-empty">${empty}</p>`;
  return html`<div class="adm-tablewrap">
    <table class="adm-table cards">
      <thead>
        <tr>
          ${cols.map(
            (c) =>
              html`<th class=${c.num ? "num" : (c.cls ?? "")}>${c.label}</th>`,
          )}
        </tr>
      </thead>
      <tbody>
        ${rows.map(
          (r) =>
            html`<tr>
              ${cols.map(
                (c) =>
                  html`<td
                    data-label=${c.lead ? "" : c.label}
                    class="${c.num ? "num" : ""} ${c.lead
                      ? "lead"
                      : ""} ${c.cls ?? ""}"
                  >
                    <span class="cv">${c.cell(r) ?? nothing}</span>
                  </td>`,
              )}
            </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

/** An account's name, linked to its admin page. */
export function accountLink(id: number, username: string): TemplateResult {
  return html`<a href="/admin/accounts/${id}">${username}</a>`;
}

/** What an API error code means, in words. */
export const ERROR_TEXT: Record<string, string> = {
  confirm: "The name typed didn't match.",
  own_account: "That can't be done to your own account.",
  not_enough_coins: "They don't have that many coins.",
  already_owned: "They own that already.",
  not_owned: "They don't own that.",
  no_such_item: "There's no such item.",
  no_such_account: "There's no such account.",
  not_suspended: "That account isn't suspended.",
  until_past: "The end date has already passed.",
  invalid_username: "Usernames are 3 to 20 letters, numbers or underscores.",
  username_taken: "That username is taken.",
  username_held: "Someone gave that name up in the last 7 days.",
  username_reserved: "That name is reserved or blocked.",
  same_name: "That's their name already.",
  invalid_word: "Words are 2 to 20 letters or numbers.",
  no_such_game: "That game isn't running any more.",
  no_such_room: "That room isn't open any more.",
  already_done: "That challenge is already done for them.",
  not_theirs: "That isn't one of their challenges that week.",
  no_text: "A banner needs some text.",
  ends_in_past: "The end time has already passed.",
  stale_sign_in: "That needs a sign-in from the last 12 hours.",
  bad_origin: "That came from somewhere else and was refused.",
  wrong_password: "That isn't your password.",
  too_many: "Too many tries. Wait a minute.",
  server_error: "Something went wrong on the server.",
  invalid: "Something in that wasn't right.",
};

export function errorText(code: string): string {
  return ERROR_TEXT[code] ?? `Refused (${code}).`;
}
