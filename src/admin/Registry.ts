// ADMIN (r26): the admin page's sections, page side. A section is one call
// to registerSection() in a file under src/admin/sections/, imported once
// from sections/index.ts. Its server half (src/server/derpy/admin/
// sections/) has the same id and serves /derpy/api/admin/<id>/... . Adding
// one touches no other section.
//
// A section either has its own place in the side list (Overview,
// Accounts...) or, with `parent`, is a tab on another section's page
// (Moderation's Usernames, Pictures, Reports). An account panel adds a box
// to every account's page, showing what its server section's account()
// returned for that account.
//
// Everything here is only ever bundled into the admin page's own script
// (src/admin/Main.ts, served by the server to the owner alone).

import type { TemplateResult } from "lit";

export interface ConfirmAsk {
  title: string;
  /** What will happen, in a sentence or two. */
  body?: string;
  /** The button's words ("Suspend Tester_Pat"). */
  action: string;
  /** Text the owner must type exactly to go ahead (a name, "delete Pat"). */
  typed?: string;
  /** A destructive action: the button is red. */
  danger?: boolean;
  /** Ask for a reason too (its label, or true for "Reason"); required if `reasonRequired`. */
  reason?: boolean | string;
  reasonRequired?: boolean;
  /** Prefill for the reason box. */
  reasonValue?: string;
}

/** What a section gets to work with. */
export interface AdminView {
  /** The address after /admin/<section>/: ["12"] on /admin/accounts/12. */
  path: string[];
  /** The address's query (?q=pat). */
  query: URLSearchParams;
  /** The signed-in owner. */
  owner: { id: number; username: string };
  /**
   * GET /derpy/api/admin/<path>: the path after /admin, with or without its
   * leading slash ("/accounts/12" and "accounts/12" are the same).
   */
  get<T>(path: string): Promise<T>;
  /**
   * POST /derpy/api/admin/<path> (as get). When the server wants a fresh sign-in
   * (403 stale_sign_in) it asks for the password and tries once more.
   * Throws AdminError for anything else that isn't OK.
   */
  post<T>(path: string, body?: object): Promise<T>;
  /** A confirmation dialog; false if cancelled, else the reason typed (or ""). */
  confirm(ask: ConfirmAsk): Promise<false | { reason: string }>;
  /** A short note at the bottom of the screen. */
  toast(text: string, tone?: "good" | "bad"): void;
  /** Goes to another admin address ("/admin/accounts/12?tab=coins"). */
  go(href: string, opts?: { replace?: boolean }): void;
}

export interface AdminSection {
  /** Its address (/admin/<id>) and its server section's id. */
  id: string;
  /** In the side list (or on its tab). */
  label: string;
  /** Place in the list: Overview 10, Accounts 20, Moderation 30, Games 40, Economy 50, Challenges 60, What's New 70, Banner 80, Audit log 90. */
  order: number;
  icon?: () => TemplateResult;
  /** Shown as a tab on that section's page instead of in the side list. */
  parent?: string;
  /** The page (usually one element: html`<adm-x .view=${view}></adm-x>`). */
  render(view: AdminView): TemplateResult;
}

/** What an account panel is told about the account it's on. */
export interface AdminAccountRef {
  id: number;
  username: string;
  owner: boolean;
}

export interface AccountPanel {
  /** The server section whose account() data it shows (the page's panels[id]). */
  id: string;
  label: string;
  order: number;
  render(
    account: AdminAccountRef,
    data: unknown,
    view: AdminView,
    /** Call after a change, to load the account's page again. */
    reload: () => void,
  ): TemplateResult;
}

const all: AdminSection[] = [];
const panels: AccountPanel[] = [];

export function registerSection(s: AdminSection): void {
  if (all.some((x) => x.id === s.id))
    throw new Error(`admin section ${s.id} twice`);
  all.push(s);
  all.sort((a, b) => a.order - b.order);
}

export function registerAccountPanel(p: AccountPanel): void {
  if (panels.some((x) => x.id === p.id))
    throw new Error(`account panel ${p.id} twice`);
  panels.push(p);
  panels.sort((a, b) => a.order - b.order);
}

/** The sections in the side list, in order. */
export function topSections(): AdminSection[] {
  return all.filter((s) => s.parent === undefined);
}

/** The tabs on a section's page, in order. */
export function childSections(parent: string): AdminSection[] {
  return all.filter((s) => s.parent === parent);
}

export function findSection(id: string): AdminSection | undefined {
  return all.find((s) => s.id === id);
}

export function accountPanels(): AccountPanel[] {
  return [...panels];
}

/** An answer from the admin API that wasn't OK. */
export class AdminError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}
