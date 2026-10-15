// The story so far (r22 BPLAY), as the dossier he keeps on himself: a
// cover sheet (his photograph, who he was at the Agency, how long he's been
// in Paris), and pages behind tabs: where he's been, who he's met and where
// things stand with each, what he decided, the throws that mattered, what
// he carries that matters, what he's still to do, his memories, and the
// transcript of this sitting. Only what he's seen is in it. Drawn when it's
// opened or a tab changes, never every frame.

import { html, nothing, svg, TemplateResult } from "lit";
import { itemArt } from "./ItemArt";

export type DossierTab =
  | "places"
  | "people"
  | "decisions"
  | "dice"
  | "effects"
  | "tasks"
  | "memories"
  | "transcript";

export interface DossierPerson {
  name: string;
  /** What he was first ("The barman"), when he's since learned a name. */
  first?: string;
  portrait: string | null;
  met: string;
  stand: string;
  /** -3 (no trust) to +3 (trust), for the bar beside the words. */
  warmth: number;
  remembers: boolean;
}

export interface DossierThrow {
  skill: string;
  color: string;
  label: string;
  diff: number;
  tier: string;
  dice: [number, number] | null;
  bonus: number;
  pass: boolean;
  tries: number;
  at: string;
}

export interface DossierView {
  tab: DossierTab;
  setTab: (t: DossierTab) => void;
  cover: {
    portrait: string | null;
    archetype: string;
    about: string;
    clock: string;
    nights: number;
    played: string;
    langs: string;
  };
  places: { name: string; at: string; here: boolean }[];
  people: DossierPerson[];
  record: string[];
  decisions: { scene: string; picks: { label: string; check?: string }[] }[];
  /** How many earlier decisions aren't listed (a long game). */
  earlier: number;
  dice: DossierThrow[];
  effects: {
    money: number;
    worn: { name: string; icon?: string; kind: string; slot: string }[];
    things: { name: string; icon?: string; kind: string; about: string }[];
  };
  tasks: { text: string; done: boolean }[];
  memories: { url: string | null; caption: string }[];
  transcript: { who?: string; text: string; kind: string }[];
}

const TABS: { id: DossierTab; label: string }[] = [
  { id: "places", label: "Movements" },
  { id: "people", label: "Contacts" },
  { id: "decisions", label: "Decisions" },
  { id: "dice", label: "The dice" },
  { id: "effects", label: "Effects" },
  { id: "tasks", label: "Open tasks" },
  { id: "memories", label: "Memories" },
  { id: "transcript", label: "Transcript" },
];

function pips(n: number): TemplateResult {
  const at: Record<number, [number, number][]> = {
    1: [[1, 1]],
    2: [
      [0, 0],
      [2, 2],
    ],
    3: [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
    4: [
      [0, 0],
      [2, 0],
      [0, 2],
      [2, 2],
    ],
    5: [
      [0, 0],
      [2, 0],
      [1, 1],
      [0, 2],
      [2, 2],
    ],
    6: [
      [0, 0],
      [2, 0],
      [0, 1],
      [2, 1],
      [0, 2],
      [2, 2],
    ],
  };
  return html`<svg class="mb-pip" viewBox="0 0 30 30" width="22" height="22">
    <rect x="1" y="1" width="28" height="28" rx="5" />
    ${(at[n] ?? at[1]).map(
      ([x, y]) => svg`<circle cx=${7 + x * 8} cy=${7 + y * 8} r="2.6" />`,
    )}
  </svg>`;
}

function empty(text: string): TemplateResult {
  return html`<p class="mb-dos-empty">${text}</p>`;
}

function page(v: DossierView): TemplateResult {
  switch (v.tab) {
    case "places":
      return v.places.length === 0
        ? empty("Nowhere yet.")
        : html`<ol class="mb-dos-places">
            ${v.places.map(
              (p) =>
                html`<li class=${p.here ? "here" : ""}>
                  <span class="mb-dos-at">${p.at}</span>
                  <span class="mb-dos-place">${p.name}</span>
                  ${p.here
                    ? html`<span class="mb-dos-now">He is here</span>`
                    : nothing}
                </li>`,
            )}
          </ol>`;
    case "people":
      return v.people.length === 0
        ? empty("Nobody has spoken to him yet.")
        : html`<ul class="mb-dos-people">
            ${v.people.map(
              (p) =>
                html`<li>
                  <div class="mb-dos-photo ${p.portrait ? "" : "none"}">
                    ${p.portrait
                      ? html`<img src=${p.portrait} alt="" draggable="false" />`
                      : html`<span>No photograph on file</span>`}
                  </div>
                  <div class="mb-dos-who">
                    <h4>${p.name}</h4>
                    ${p.first
                      ? html`<div class="mb-dos-aka">
                          first noted as ${p.first}
                        </div>`
                      : nothing}
                    <div class="mb-dos-met">Met ${p.met}</div>
                    <div class="mb-dos-stand">
                      <span
                        class="mb-dos-warmth"
                        style="--w:${(p.warmth + 3) / 6}"
                        aria-hidden="true"
                      ></span>
                      ${p.stand}
                    </div>
                    ${p.remembers
                      ? html`<span class="mb-stamp small">Will remember</span>`
                      : nothing}
                  </div>
                </li>`,
            )}
          </ul>`;
    case "decisions":
      return html`${v.record.length > 0
          ? html`<div class="mb-file-sub2">On the record</div>
              <ul class="mb-dos-record">
                ${v.record.map((r) => html`<li>${r}</li>`)}
              </ul>`
          : nothing}
        <div class="mb-file-sub2">What he chose</div>
        ${v.decisions.length === 0
          ? empty("He hasn't had to decide anything yet.")
          : html`${v.earlier > 0
                ? html`<p class="mb-dos-earlier">
                    And ${v.earlier} earlier, in the flowchart.
                  </p>`
                : nothing}
              <ol class="mb-dos-decisions">
                ${v.decisions.map(
                  (d) =>
                    html`<li>
                      <div class="mb-dos-scene">${d.scene}</div>
                      <ul>
                        ${d.picks.map(
                          (p) =>
                            html`<li>
                              ${p.label}${p.check
                                ? html` <span class="mb-dos-check"
                                    >${p.check}</span
                                  >`
                                : nothing}
                            </li>`,
                        )}
                      </ul>
                    </li>`,
                )}
              </ol>`}`;
    case "dice":
      return v.dice.length === 0
        ? empty("No throws yet.")
        : html`<ol class="mb-dos-dice">
            ${v.dice.map(
              (d) =>
                html`<li class=${d.pass ? "pass" : "fail"}>
                  <span class="mb-dos-at">${d.at}</span>
                  <div class="mb-dos-throw">
                    <div class="mb-dos-throw-head">
                      <b style="color:${d.color}">${d.skill}</b>
                      <span>${d.tier} ${d.diff}</span>
                    </div>
                    <div class="mb-dos-throw-what">${d.label}</div>
                    <div class="mb-dos-throw-dice">
                      ${d.dice
                        ? html`${pips(d.dice[0])}${pips(d.dice[1])}
                            <span
                              >${d.dice[0]} + ${d.dice[1]} + ${d.bonus} =
                              ${d.dice[0] + d.dice[1] + d.bonus}</span
                            >`
                        : html`<span>No throw: ${d.bonus} + 6</span>`}
                      ${d.tries > 1
                        ? html`<span class="mb-dos-tries"
                            >tried ${d.tries} times</span
                          >`
                        : nothing}
                    </div>
                  </div>
                  <span class="mb-stamp small ${d.pass ? "" : "fail"}"
                    >${d.pass ? "Passed" : "Failed"}</span
                  >
                </li>`,
            )}
          </ol>`;
    case "effects":
      return html`<div class="mb-dos-money">
          Money <b>€${v.effects.money}</b>
        </div>
        ${v.effects.things.length > 0
          ? html`<div class="mb-file-sub2">Of note</div>
              <ul class="mb-dos-things">
                ${v.effects.things.map(
                  (t) =>
                    html`<li>
                      ${itemArt(t.icon, t.kind, 48)}
                      <div>
                        <b>${t.name}</b>
                        <p>${t.about}</p>
                      </div>
                    </li>`,
                )}
              </ul>`
          : nothing}
        <div class="mb-file-sub2">On him</div>
        <ul class="mb-dos-worn">
          ${v.effects.worn.map(
            (t) =>
              html`<li>
                ${itemArt(t.icon, t.kind, 32)}<span
                  ><b>${t.name}</b> ${t.slot}</span
                >
              </li>`,
          )}
        </ul>`;
    case "tasks": {
      const open = v.tasks.filter((t) => !t.done);
      const done = v.tasks.filter((t) => t.done);
      return html`${open.length === 0
        ? empty("Nothing open.")
        : html`<ul class="mb-journal">
            ${open.map((t) => html`<li>${t.text}</li>`)}
          </ul>`}
      ${done.length > 0
        ? html`<div class="mb-file-sub2">Done</div>
            <ul class="mb-journal done">
              ${done.map((t) => html`<li>${t.text}</li>`)}
            </ul>`
        : nothing}`;
    }
    case "memories":
      return v.memories.length === 0
        ? empty("Nothing has come back to him yet.")
        : html`<ul class="mb-dos-memories">
            ${v.memories.map(
              (m) =>
                html`<li>
                  ${m.url
                    ? html`<img src=${m.url} alt="" draggable="false" />`
                    : html`<span class="mb-dos-nopaint"></span>`}
                  <span>${m.caption}</span>
                </li>`,
            )}
          </ul>`;
    case "transcript":
      return v.transcript.length === 0
        ? empty("Nothing said since this sitting began.")
        : html`<div class="mb-dos-transcript">
            ${v.transcript.map(
              (l) =>
                html`<p class=${l.kind}>
                  ${l.who ? html`<b>${l.who}</b> ` : nothing}${l.text}
                </p>`,
            )}
          </div>`;
  }
}

export function dossierBody(
  v: DossierView,
  foot: TemplateResult | typeof nothing = nothing,
): TemplateResult {
  const c = v.cover;
  return html`<div class="mb-dossier">
    <aside class="mb-dos-cover" aria-label="The file">
      <div class="mb-dos-tab">BASED</div>
      <div class="mb-dos-photo cover ${c.portrait ? "" : "none"}">
        ${c.portrait
          ? html`<img src=${c.portrait} alt="" draggable="false" />`
          : nothing}
        <span class="mb-dos-clip" aria-hidden="true"></span>
      </div>
      <dl class="mb-dos-fields">
        <dt>Name</dt>
        <dd>Based, <span class="mb-redact" style="width:7ch"></span></dd>
        <dt>Formerly</dt>
        <dd>${c.archetype}</dd>
        <dt>Languages</dt>
        <dd>${c.langs}</dd>
        <dt>In Paris</dt>
        <dd>
          ${c.nights > 0 ? `Night ${c.nights + 1}, ` : "The first night, "}
          ${c.clock}
        </dd>
        <dt>On file</dt>
        <dd>${c.played}</dd>
      </dl>
      <p class="mb-dos-about">${c.about}</p>
      <span class="mb-stamp">Eyes only</span>
    </aside>
    <section class="mb-dos-pages">
      <h2>The story so far</h2>
      <nav class="mb-dos-tabs" role="tablist" aria-label="Pages">
        ${TABS.map(
          (t) =>
            html`<button
              role="tab"
              aria-selected=${v.tab === t.id}
              class=${v.tab === t.id ? "on" : ""}
              @click=${() => v.setTab(t.id)}
            >
              ${t.label}
            </button>`,
        )}
      </nav>
      <div class="mb-dos-page" role="tabpanel">${page(v)}</div>
      <div class="mb-dos-foot">${foot}</div>
    </section>
  </div>`;
}
