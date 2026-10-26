// ADMIN (r26): Moderation: a page of tabs, one per section registered with
// `parent: "moderation"`. Usernames is here; profile pictures and reports
// come from their own sections when they're on the site (until then their
// tabs say so).

import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { shieldIcon } from "../icons";
import { AdminPage } from "../Page";
import {
  type AdminView,
  childSections,
  registerSection,
} from "../Registry";
import { accountLink, ago, table, when } from "../ui";

/** Tabs Moderation keeps a place for, shown empty until a section fills them. */
const SLOTS: { id: string; label: string; order: number; empty: string }[] = [
  {
    id: "pictures",
    label: "Profile pictures",
    order: 10,
    empty:
      "Profile pictures aren't on this site yet. When they are, reported and recent uploads show here.",
  },
  {
    id: "reports",
    label: "Reports",
    order: 30,
    empty: "Nobody can report anything on this site yet.",
  },
];

function moderationPage(view: AdminView): TemplateResult {
  const children = childSections("moderation");
  const tabs = [
    ...children.map((c) => ({ id: c.id, label: c.label, order: c.order })),
    ...SLOTS.filter((s) => !children.some((c) => c.id === s.id)),
  ].sort((a, b) => a.order - b.order);
  const at = view.path[0] && tabs.some((t) => t.id === view.path[0])
    ? view.path[0]
    : (tabs[0]?.id ?? "names");
  const child = children.find((c) => c.id === at);
  const slot = SLOTS.find((s) => s.id === at);
  return html`<div class="adm-head">
      <div>
        <h1>Moderation</h1>
        <p class="adm-sub">Names, pictures and reports.</p>
      </div>
    </div>
    <div class="dl-seg adm-tabs" role="tablist">
      ${tabs.map(
        (t) =>
          html`<button
            role="tab"
            aria-selected=${t.id === at}
            @click=${() => view.go(`/admin/moderation/${t.id}`)}
          >
            ${t.label}
          </button>`,
      )}
    </div>
    ${child
      ? child.render({ ...view, path: view.path.slice(1) })
      : slot
        ? html`<div class="adm-box"><p class="adm-empty">${slot.empty}</p></div>`
        : nothing}`;
}

registerSection({
  id: "moderation",
  label: "Moderation",
  order: 30,
  icon: () => shieldIcon(),
  render: moderationPage,
});

// ---------------------------------------------------------------- usernames

interface NamesData {
  words: { word: string; createdAt: string }[];
  flagged: { id: number; username: string; word: string }[];
}

@customElement("adm-names")
export class AdminNames extends AdminPage {
  @state() private data: NamesData | null = null;
  @state() private word = "";

  protected async fetch(): Promise<void> {
    this.data = await this.view.get<NamesData>("/moderation/names");
  }

  render(): TemplateResult {
    const d = this.data;
    return html`${this.error ? this.failed() : nothing}
      <div class="adm-cols">
        <div class="adm-box">
          <h2>Blocked words <span class="adm-aside">${d?.words.length ?? 0}</span></h2>
          <p class="adm-quiet" style="margin-bottom:10px">
            No new name (at sign-up or a rename) may have one of these in it,
            in any capitals, with underscores or with digits for letters
            (b4dw0rd). Names people already have stay until you rename them.
          </p>
          <form
            class="adm-row"
            style="margin-bottom:10px"
            @submit=${async (e: SubmitEvent) => {
              e.preventDefault();
              const word = this.word.trim().toLowerCase();
              if (!word) return;
              const r = await this.act(
                () => this.view.post("/moderation/names/block", { word }),
                `"${word}" blocked.`,
              );
              if (r) this.word = "";
            }}
          >
            <input
              class="adm-input grow"
              placeholder="A word, 2 to 20 letters or numbers"
              maxlength="20"
              autocomplete="off"
              .value=${this.word}
              @input=${(e: InputEvent) => (this.word = (e.target as HTMLInputElement).value)}
            />
            <button class="dl-btn small" ?disabled=${!/^[A-Za-z0-9]{2,20}$/.test(this.word.trim()) || this.busy}>
              Block
            </button>
          </form>
          ${d
            ? table(
                [
                  { label: "Word", lead: true, cell: (w) => html`<span class="adm-mono">${w.word}</span>` },
                  { label: "Since", cls: "nowrap", cell: (w) => html`<span title=${when(w.createdAt)}>${ago(w.createdAt)}</span>` },
                  {
                    label: "",
                    cls: "acts",
                    cell: (w) =>
                      html`<button
                        class="dl-btn small tiny ghost"
                        ?disabled=${this.busy}
                        @click=${() =>
                          void this.act(
                            () => this.view.post("/moderation/names/unblock", { word: w.word }),
                            `"${w.word}" allowed again.`,
                          )}
                      >
                        Allow again
                      </button>`,
                  },
                ],
                d.words,
                "No words blocked.",
              )
            : html`<p class="adm-quiet">Loading…</p>`}
        </div>
        <div class="adm-box">
          <h2>Names with a blocked word <span class="adm-aside">${d?.flagged.length ?? 0}</span></h2>
          <p class="adm-quiet" style="margin-bottom:10px">
            Open one to rename it (no 7-day wait).
          </p>
          ${d
            ? table(
                [
                  { label: "Account", lead: true, cell: (f) => accountLink(f.id, f.username) },
                  { label: "Word", cell: (f) => html`<span class="adm-mono">${f.word}</span>` },
                  { label: "", cls: "acts", cell: (f) => html`<a class="dl-btn small tiny ghost" href="/admin/accounts/${f.id}">Rename…</a>` },
                ],
                d.flagged,
                "None.",
              )
            : nothing}
        </div>
      </div>`;
  }
}

registerSection({
  id: "names",
  label: "Usernames",
  order: 20,
  parent: "moderation",
  render: (view) => html`<adm-names .view=${view}></adm-names>`,
});
