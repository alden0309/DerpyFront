// r26: the owner's notes for the writer, all of them, to hand over. Listed
// newest first (new, or sent), copied as plain text he can paste into a chat
// (each with the scene, the line on screen, the choices that led there, his
// note and the date), marked sent once copied, and the sent ones cleared
// when he's done with them. Through the gated API like everything else:
// only an account that can play has notes, and the page holds no story
// text of its own (the server writes each note's entry).

import { html, nothing, TemplateResult } from "lit";
import { clearSentNotes, markNotesSent, MyNote, myNotes } from "./Api";
import { notesText } from "./NotesText";

type DeskState =
  | "loading"
  | "idle"
  | "busy"
  | "copied"
  | "manual"
  | "cleared"
  | "failed";

export class NotesDesk {
  notes: MyNote[] = [];
  state: DeskState = "loading";
  /** What was put together last: shown to copy by hand if the clipboard won't. */
  text = "";
  private pending: number[] = [];
  private confirming = false;
  private message = "";

  constructor(private readonly changed: () => void) {}

  async load(): Promise<void> {
    this.state = "loading";
    this.changed();
    try {
      this.notes = await myNotes();
      this.state = "idle";
    } catch {
      this.state = "failed";
      this.message = "Your notes didn't load. Try again in a moment.";
    }
    this.changed();
  }

  private get fresh(): MyNote[] {
    return this.notes.filter((n) => n.sentAt === null);
  }

  private get sent(): MyNote[] {
    return this.notes.filter((n) => n.sentAt !== null);
  }

  /** Copies them (all, or the new ones), then marks what was copied sent. */
  async copy(which: "all" | "new"): Promise<void> {
    const list = which === "all" ? this.notes : this.fresh;
    if (list.length === 0) return;
    this.text = notesText(list);
    this.pending = list.filter((n) => n.sentAt === null).map((n) => n.id);
    this.confirming = false;
    try {
      await navigator.clipboard.writeText(this.text);
    } catch {
      // No clipboard (an old browser, or no permission): he copies it.
      this.state = "manual";
      this.message =
        "The browser wouldn't copy it. Select the text below and copy it, then mark them sent.";
      this.changed();
      return;
    }
    await this.markSent(
      `Copied ${list.length} note${list.length === 1 ? "" : "s"}. Paste them into the chat with the writer.`,
    );
  }

  /** What was copied is sent. */
  async markSent(done = "Marked as sent."): Promise<void> {
    const ids = this.pending;
    this.state = "busy";
    this.changed();
    try {
      if (ids.length > 0) await markNotesSent(ids);
      this.pending = [];
      this.notes = await myNotes();
      this.state = "copied";
      this.message = done;
    } catch {
      this.state = "failed";
      this.message = "Copied, but they couldn't be marked sent. Try again?";
    }
    this.changed();
  }

  /** "Clear the ones I've sent": asked once, then gone. */
  async clear(): Promise<void> {
    if (!this.confirming) {
      this.confirming = true;
      this.changed();
      return;
    }
    this.confirming = false;
    this.state = "busy";
    this.changed();
    try {
      const n = await clearSentNotes();
      this.notes = await myNotes();
      this.state = "cleared";
      this.message = `Cleared ${n} sent note${n === 1 ? "" : "s"}.`;
    } catch {
      this.state = "failed";
      this.message = "They couldn't be cleared. Try again?";
    }
    this.changed();
  }

  /** In a sheet in the game, or as a page of its own (the title's). */
  render(page = false): TemplateResult {
    const fresh = this.fresh.length;
    const sent = this.sent.length;
    const all = this.notes.length;
    const busy = this.state === "busy" || this.state === "loading";
    const list = [...this.notes].reverse();
    return html`<div class="mb-notes-desk">
      ${page
        ? html`<h1 class="mb-h1">Your notes for the writer</h1>`
        : html`<h2>Your notes for the writer</h2>`}
      <p class="mb-sheet-sub">
        ${this.state === "loading"
          ? "Fetching your notes…"
          : all === 0
            ? html`None yet. Press <kbd>N</kbd> or the pen while playing to
                leave one on any moment.`
            : html`${all} in all: ${fresh} new, ${sent} sent. Copy them, paste
              them into the chat with the writer, and they're marked sent.`}
      </p>
      ${all > 0
        ? html`<div class="mb-sheet-row mb-notes-actions">
            <button
              class="mb-btn primary"
              ?disabled=${busy}
              @click=${() => void this.copy("all")}
            >
              Copy my notes (${all})
            </button>
            ${fresh > 0 && fresh < all
              ? html`<button
                  class="mb-btn"
                  ?disabled=${busy}
                  @click=${() => void this.copy("new")}
                >
                  Copy the new ones (${fresh})
                </button>`
              : nothing}
            ${sent > 0
              ? html`<button
                  class="mb-btn quiet"
                  ?disabled=${busy}
                  @click=${() => void this.clear()}
                >
                  ${this.confirming
                    ? `Clear ${sent} for good?`
                    : `Clear the ones I've sent (${sent})`}
                </button>`
              : nothing}
          </div>`
        : nothing}
      ${this.message && this.state !== "loading" && this.state !== "idle"
        ? html`<p
            class="mb-note-state ${this.state === "failed" ||
            this.state === "manual"
              ? "failed"
              : "saved"}"
          >
            ${this.message}
          </p>`
        : nothing}
      ${this.state === "manual"
        ? html`<textarea
              class="mb-notes-copy"
              readonly
              rows="8"
              .value=${this.text}
              @focus=${(e: Event) => (e.target as HTMLTextAreaElement).select()}
            ></textarea>
            <div class="mb-sheet-row">
              <span></span>
              <button
                class="mb-btn primary"
                @click=${() => void this.markSent()}
              >
                I've copied them: mark sent
              </button>
            </div>`
        : nothing}
      ${list.length > 0
        ? html`<div class="mb-notes">
            ${list.map(
              (n) =>
                html`<div class="mb-note ${n.sentAt ? "sent" : "new"}">
                  <div class="mb-note-when">
                    <span class="mb-note-tag"
                      >${n.sentAt ? "Sent" : "New"}</span
                    >
                    ${new Date(n.createdAt).toLocaleString()} · ${n.sceneLabel}
                  </div>
                  <div class="mb-note-text">${n.note}</div>
                </div>`,
            )}
          </div>`
        : nothing}
    </div>`;
  }
}
