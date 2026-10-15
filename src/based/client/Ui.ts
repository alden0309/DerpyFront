// Pieces of Mr. Based's interface shared by the app and the player: the
// settings and credits panels, text that types in, and the icons. Kept apart
// from the player so the title screen never loads the 3D world.

import { html, nothing, svg as svgPart, TemplateResult } from "lit";
import { clockText } from "../engine/Runtime";
import { SLOTS } from "../engine/Save";
import { Credit, SlotInfo } from "./Api";
import { Prefs, TextSpeed } from "./Prefs";

/**
 * r22 BPLAY: the skills' voices, by attribute in the order the story lists
 * them: Social in the pharmacy's green cross, Intelligence in carbon-paper
 * violet, Physical in sodium-lamp amber. `night` on the dark column,
 * `paper` (darker, the same hue) on the paper sheets.
 */
export const VOICES: readonly { night: string; paper: string }[] = [
  { night: "#62cf95", paper: "#1d6e46" },
  { night: "#a6a9f9", paper: "#4245a6" },
  { night: "#f0a64c", paper: "#94550b" },
];

export function voice(i: number): { night: string; paper: string } {
  return VOICES[Math.max(0, i) % VOICES.length];
}

/** "*word*" becomes emphasis; returns [text, emphasised] runs. */
export function runs(text: string): [string, boolean][] {
  const out: [string, boolean][] = [];
  const re = /\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push([text.slice(last, m.index), false]);
    out.push([m[1], true]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push([text.slice(last), false]);
  return out;
}

export function plainText(text: string): string {
  return runs(text)
    .map(([t]) => t)
    .join("");
}

/** The text typed so far, with the rest kept invisible so nothing reflows. */
export function typed(text: string, shown: number): TemplateResult {
  let left = shown;
  return html`${runs(text).map(([t, em]) => {
    const a = t.slice(0, Math.max(0, left));
    const b = t.slice(Math.max(0, left));
    left -= t.length;
    const inner = html`${a}${b
      ? html`<span class="mb-ghost">${b}</span>`
      : nothing}`;
    return em ? html`<em>${inner}</em>` : inner;
  })}`;
}

export function settingsBody(
  prefs: Prefs,
  set: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void,
  speed: (s: TextSpeed, label: string) => TemplateResult,
): TemplateResult {
  const quality = (q: Prefs["quality"], label: string) =>
    html`<button
      class="mb-seg ${prefs.quality === q ? "on" : ""}"
      aria-pressed=${prefs.quality === q}
      @click=${() => set("quality", q)}
    >
      ${label}
    </button>`;
  return html`<div class="mb-settings">
    <div class="mb-setting">
      <div>
        <div class="mb-setting-name">Timed choices</div>
        <div class="mb-setting-note">
          Some answers have a clock. When it runs out, he says nothing.
        </div>
      </div>
      <button
        class="mb-toggle ${prefs.timers ? "on" : ""}"
        role="switch"
        aria-checked=${prefs.timers}
        @click=${() => set("timers", !prefs.timers)}
      >
        <span></span>
      </button>
    </div>
    <div class="mb-setting">
      <div class="mb-setting-name">Text speed</div>
      <div class="mb-segs">
        ${speed("slow", "Slow")} ${speed("normal", "Normal")}
        ${speed("fast", "Fast")} ${speed("instant", "Instant")}
      </div>
    </div>
    <div class="mb-setting">
      <div>
        <div class="mb-setting-name">Show what's near him</div>
        <div class="mb-setting-note">
          Names over what he's near and can see. (Or hold Tab.)
        </div>
      </div>
      <button
        class="mb-toggle ${prefs.marks ? "on" : ""}"
        role="switch"
        aria-checked=${prefs.marks}
        @click=${() => set("marks", !prefs.marks)}
      >
        <span></span>
      </button>
    </div>
    <div class="mb-setting">
      <div>
        <div class="mb-setting-name">Pictures</div>
        <div class="mb-setting-note">
          "Fine" paints the scene and casts shadows; "Light" is kinder to a
          phone. Takes effect when a chapter starts.
        </div>
      </div>
      <div class="mb-segs">
        ${quality("auto", "Auto")} ${quality("high", "Fine")}
        ${quality("low", "Light")}
      </div>
    </div>
    <div class="mb-setting">
      <div class="mb-setting-name">Sound</div>
      <button
        class="mb-toggle ${prefs.sound ? "on" : ""}"
        role="switch"
        aria-checked=${prefs.sound}
        @click=${() => set("sound", !prefs.sound)}
      >
        <span></span>
      </button>
    </div>
    <div class="mb-setting">
      <div class="mb-setting-name">Volume</div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        .value=${String(prefs.volume)}
        @input=${(e: Event) =>
          set("volume", Number((e.target as HTMLInputElement).value))}
      />
    </div>
  </div>`;
}

/** "1:05" hours and minutes played, or "12 min". */
export function playedText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

/** What a slot is called. */
export function slotName(slot: string): string {
  return slot === "auto"
    ? "Autosave"
    : slot === "quick"
      ? "Quicksave"
      : `Slot ${slot}`;
}

/**
 * r22: the save slots, for saving into or loading from: each with the
 * place, the time in the story, when it was saved and how long had been
 * played. The autosave and the quicksave can be loaded, not saved over.
 */
export function slotsBody(opts: {
  slots: SlotInfo[];
  mode: "save" | "load";
  busy: string | null;
  pick: (slot: string) => void;
}): TemplateResult {
  const by = new Map(opts.slots.map((s) => [s.slot, s]));
  const list =
    opts.mode === "save" ? SLOTS.filter((s) => /^\d+$/.test(s)) : SLOTS;
  return html`<ol class="mb-slots">
    ${list.map((slot) => {
      const s = by.get(slot);
      const m = s?.meta;
      const c = m ? clockText(m.clock) : null;
      const empty = !m;
      return html`<li>
        <button
          class="mb-slot ${empty ? "empty" : ""} ${opts.busy === slot
            ? "busy"
            : ""}"
          ?disabled=${(opts.mode === "load" && empty) || opts.busy !== null}
          @click=${() => {
            if (
              opts.mode === "save" &&
              !empty &&
              !window.confirm(`Save over ${slotName(slot)}?`)
            ) {
              return;
            }
            opts.pick(slot);
          }}
        >
          <span class="mb-slot-name">${slotName(slot)}</span>
          ${m
            ? html`<span class="mb-slot-where"
                  >${m.placeName || m.label}${c
                    ? html` ·
                        <b
                          >${c.day > 0
                            ? `night ${c.day + 1}, `
                            : ""}${c.time}</b
                        >`
                    : nothing}</span
                >
                <span class="mb-slot-when"
                  >${new Date(m.savedAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  · played ${playedText(m.played)}</span
                >`
            : html`<span class="mb-slot-where">Empty</span>`}
        </button>
      </li>`;
    })}
  </ol>`;
}

export function creditsBody(credits: Credit[]): TemplateResult {
  const art = credits.filter((c) => c.what !== "Model");
  const models = credits.filter((c) => c.what === "Model");
  const item = (c: Credit) =>
    // BPEOPLE (r22): what the owner supplied has no link and no licence.
    !c.source
      ? html`<li>
          <span class="mb-credit-what">${c.what}</span>
          ${c.title}:
          ${c.license.toLowerCase()}${c.changes
            ? html`. ${c.changes}`
            : nothing}
        </li>`
      : html`<li>
          <span class="mb-credit-what">${c.what}</span>
          <a href=${c.source} target="_blank" rel="noopener noreferrer"
            >${c.title}</a
          >
          by ${c.author},
          <a href=${c.licenseUrl} target="_blank" rel="noopener noreferrer"
            >${c.license}</a
          >${c.changes ? html`. ${c.changes}` : nothing}
        </li>`;
  return html`<h2>Credits</h2>
    <p class="mb-sheet-sub">
      Written for Derp Land. Every character, the party and the government are
      invented. The photographs are of real places and of people who agreed to
      be photographed; none of them is anyone in the story.
    </p>
    ${models.length > 0
      ? html`<div class="mb-panel-sub">The places and the people in them</div>
          <ul class="mb-credits">
            ${models.map(item)}
          </ul>
          <div class="mb-panel-sub">Pictures and sound</div>`
      : nothing}
    <ul class="mb-credits">
      ${art.map(item)}
    </ul>`;
}

function svg(d: ReturnType<typeof svgPart>): TemplateResult {
  return html`<svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    ${d}
  </svg>`;
}
export function penIcon() {
  return svg(
    svgPart`<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="M13.5 6.5l4 4" />`,
  );
}
export function soundIcon() {
  return svg(
    svgPart`<path d="M4 10v4h4l5 4V6L8 10z" /><path d="M16.5 9a4 4 0 0 1 0 6" /><path d="M19 6.5a7.5 7.5 0 0 1 0 11" />`,
  );
}
export function muteIcon() {
  return svg(
    svgPart`<path d="M4 10v4h4l5 4V6L8 10z" /><path d="M17 10l4 4M21 10l-4 4" />`,
  );
}
export function menuIcon() {
  return svg(svgPart`<path d="M4 7h16M4 12h16M4 17h10" />`);
}
export function closeIcon() {
  return svg(svgPart`<path d="M6 6l12 12M18 6L6 18" />`);
}
export function personIcon() {
  return svg(
    svgPart`<circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6" />`,
  );
}
export function bookIcon() {
  return svg(
    svgPart`<path d="M5 4.5h9.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h9.5" /><path d="M9 8h5" />`,
  );
}
export function eyeIcon() {
  return svg(
    svgPart`<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.6" />`,
  );
}
export function bagIcon() {
  return svg(
    svgPart`<path d="M5 9h14l-1.2 11H6.2z" /><path d="M9 9V7a3 3 0 0 1 6 0v2" /><path d="M9.5 13h5" />`,
  );
}
export function folderIcon() {
  return svg(
    svgPart`<path d="M3.5 7.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5V9.5A1.5 1.5 0 0 0 19 8h-7l-2-2.5H5A1.5 1.5 0 0 0 3.5 7z" /><path d="M8 13h8" />`,
  );
}
