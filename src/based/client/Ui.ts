// Pieces of Mr. Based's interface shared by the app and the player: the
// settings and credits panels, text that types in, and the icons. Kept apart
// from the player so the title screen never loads the 3D world.

import { html, nothing, svg as svgPart, TemplateResult } from "lit";
import { Credit } from "./Api";
import { Prefs, TextSpeed } from "./Prefs";

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
        <div class="mb-setting-name">Show what he can look at</div>
        <div class="mb-setting-note">
          Marks over everything worth a look. (Or hold Tab.)
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

export function creditsBody(credits: Credit[]): TemplateResult {
  const art = credits.filter((c) => c.what !== "Model");
  const models = credits.filter((c) => c.what === "Model");
  const item = (c: Credit) =>
    html`<li>
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
export function eyeIcon() {
  return svg(
    svgPart`<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.6" />`,
  );
}
