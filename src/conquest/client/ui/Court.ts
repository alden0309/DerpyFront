// The governor's court: the governor and family, the council and the
// notables who might serve or scheme. And a full sheet for any character.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import { seatCandidates } from "../../engine/Characters";
import {
  ageOf,
  birthChance,
  charName,
  deathRisk,
  discoveryChance,
  findHeir,
  marryCheck,
  opinionOfRuler,
  rulerOf,
  schemeSpeed,
  seatHolder,
  statOf,
} from "../../engine/Queries";
import {
  ADULT_AGE,
  NATIVE_SEAT_NAMES,
  SEAT_NAMES,
  SEAT_STAT,
  STAT_NAMES,
  TITLE_NAMES,
  TRAITS,
} from "../../engine/Rules";
import type { Character, Seat } from "../../engine/Types";
import { SEATS, STATS } from "../../engine/Types";
import { num, pct } from "../Tip";
import {
  breakdownTip,
  charLink,
  GameUi,
  nationLink,
  section,
  token,
} from "./Context";

const AMBITIONS: Record<string, string> = {
  governorship: "Wants to be governor",
  wealth: "Wants to get rich",
  glory: "Wants glory",
  faith: "Wants to spread the faith",
  peace: "Wants a quiet life",
};

const SCHEMES: Record<string, string> = {
  slander: "slandering you at court",
  embezzle: "stealing from the treasury",
  incite: "stirring up the settlers",
  murder: "plotting to murder you",
};

export function courtTab(ui: GameUi): TemplateResult {
  const s = ui.s;
  const n = s.nations[ui.me];
  const ruler = rulerOf(s, ui.me);
  if (!ruler) return html`<p class="cq-muted">No one governs.</p>`;
  const spouse = ruler.spouse >= 0 ? s.chars[ruler.spouse] : undefined;
  const kids = ruler.children.map((id) => s.chars[id]).filter((c) => c);
  const heir = s.chars[findHeir(s, ruler)];
  const court = n.court
    .map((id) => s.chars[id])
    .filter((c): c is Character => !!c?.alive);
  return html`
    <header class="cq-panel-head"><h2 class="cq-h2">The court</h2></header>
    <div class="cq-ruler-card">
      ${token(ui, ruler, "xl")}
      <div>
        <p class="cq-kicker">
          ${n.kind === "power"
            ? n.title > 0
              ? `${TITLE_NAMES[n.title]}, governor`
              : "Governor"
            : "Leader"}
        </p>
        <h3 class="cq-h3 big">${charLink(ui, ruler)}</h3>
        <div class="cq-traits">${ruler.traits.map((t) => traitChip(t))}</div>
      </div>
    </div>
    ${statGrid(ui, ruler)}
    ${section(
      "Family",
      html`<ul class="cq-list">
          <li>
            Spouse:
            ${spouse
              ? html`${charLink(ui, spouse)}${spouse.alive
                  ? nothing
                  : html` <span class="cq-muted"
                      >(died ${formatDate(spouse.died!.day)})</span
                    >`}`
              : html`<span class="cq-muted">unmarried</span>`}
          </li>
          <li>
            Children:
            ${kids.length === 0
              ? html`<span class="cq-muted">none</span>`
              : kids.map(
                  (c, i) =>
                    html`${i ? ", " : ""}${charLink(ui, c)}${c.alive
                      ? nothing
                      : html`<span class="cq-muted"> (dead)</span>`}`,
                )}
          </li>
          <li>
            Heir:
            ${heir
              ? charLink(ui, heir)
              : html`<span class="cq-muted"
                  >none, so the crown would choose from your council</span
                >`}
          </li>
          ${spouse?.alive
            ? html`<li>
                Chance of a child this year:
                ${num(
                  pct(birthChance(s, ruler.female ? ruler : spouse).total),
                  () =>
                    breakdownTip(
                      "Chance of a child this year",
                      birthChance(s, ruler.female ? ruler : spouse),
                      pct,
                    ),
                )}
              </li>`
            : nothing}
        </ul>
        ${marriages(ui, ruler, court)}`,
    )}
    ${section(
      "Council",
      html`<table class="cq-table council">
        <thead>
          <tr>
            <th>Seat</th>
            <th>Who</th>
            <th class="r">Skill</th>
            <th class="r">Opinion</th>
          </tr>
        </thead>
        <tbody>
          ${SEATS.map((seat) => councilRow(ui, seat))}
        </tbody>
      </table>`,
    )}
    ${section(
      "At court",
      court.length === 0
        ? html`<p class="cq-muted">
            Nobody else at court right now. New arrivals come from Europe.
          </p>`
        : html`<table class="cq-table">
            <tbody>
              ${court.map(
                (c) =>
                  html`<tr>
                    <td>
                      ${token(ui, c)} ${charLink(ui, c)}<br /><span
                        class="cq-muted small"
                        >${c.ambition ? AMBITIONS[c.ambition] : ""}</span
                      >
                    </td>
                    <td class="small">${bestStats(ui, c)}</td>
                    <td class="r">${opinionNum(ui, c)}</td>
                    <td>
                      ${c.scheme?.exposed
                        ? html`<button
                            class="cq-btn small danger"
                            @click=${() =>
                              void ui.cmd({ k: "confront", c: c.id })}
                          >
                            Banish
                          </button>`
                        : nothing}
                    </td>
                  </tr>`,
              )}
            </tbody>
          </table>`,
    )}
  `;
}

function councilRow(ui: GameUi, seat: Seat): TemplateResult {
  const s = ui.s;
  const n = s.nations[ui.me];
  const holder = seatHolder(s, ui.me, seat);
  const st = SEAT_STAT[seat];
  const candidates = seatCandidates(s, ui.me, seat).filter(
    (c) => c.id !== holder?.id && !c.scheme?.exposed,
  );
  return html`<tr>
    <td>
      <b>${n.kind === "native" ? NATIVE_SEAT_NAMES[seat] : SEAT_NAMES[seat]}</b
      ><br /><span class="cq-muted small">${STAT_NAMES[st]}</span>
    </td>
    <td>
      <div class="cq-who-cell">
        ${holder
          ? html`${token(ui, holder)} ${charLink(ui, holder)}`
          : html`<span class="cq-muted">Empty</span>`}
      </div>
      <select
        class="cq-select small cq-seat-pick"
        @change=${(e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          if (v === "dismiss") void ui.cmd({ k: "dismiss", seat });
          else if (v) void ui.cmd({ k: "appoint", seat, c: Number(v) });
          (e.target as HTMLSelectElement).value = "";
        }}
      >
        <option value="">${holder ? "Replace…" : "Appoint…"}</option>
        ${candidates.map(
          (c) =>
            html`<option value=${c.id}>
              ${charName(c)} (${statOf(s, c, st).total})
            </option>`,
        )}
        ${holder
          ? html`<option value="dismiss">Dismiss ${charName(holder)}</option>`
          : nothing}
      </select>
    </td>
    <td class="r">
      ${holder
        ? num(String(statOf(s, holder, st).total), () =>
            breakdownTip(
              `${charName(holder)}'s ${STAT_NAMES[st].toLowerCase()}`,
              statOf(s, holder, st),
            ),
          )
        : nothing}
    </td>
    <td class="r">${holder ? opinionNum(ui, holder) : nothing}</td>
  </tr>`;
}

function marriages(
  ui: GameUi,
  ruler: Character,
  court: Character[],
): TemplateResult {
  const s = ui.s;
  const family = [ruler, ...ruler.children.map((id) => s.chars[id])].filter(
    (c): c is Character =>
      !!c?.alive && c.spouse < 0 && ageOf(s, c) >= ADULT_AGE,
  );
  if (family.length === 0) return html``;
  const matches = (c: Character) =>
    court.filter(
      (x) => x.spouse < 0 && x.female !== c.female && ageOf(s, x) >= ADULT_AGE,
    );
  return html`<div class="cq-marry">
    ${family.map((c) =>
      matches(c).length === 0
        ? nothing
        : html`<label class="cq-inline">
            Marry ${charName(c)} to
            <select
              class="cq-select small"
              @change=${(e: Event) => {
                const v = Number((e.target as HTMLSelectElement).value);
                if (!v) return;
                const check = marryCheck(s, ui.me, c.id, v);
                if (!check.ok) ui.toast(check.why, "bad");
                else void ui.cmd({ k: "marry", a: c.id, b: v });
                (e.target as HTMLSelectElement).value = "";
              }}
            >
              <option value="">someone at court…</option>
              ${matches(c).map(
                (x) =>
                  html`<option value=${x.id}>
                    ${charName(x)} (${ageOf(s, x)})
                  </option>`,
              )}
            </select>
          </label>`,
    )}
  </div>`;
}

function bestStats(ui: GameUi, c: Character): TemplateResult {
  const s = ui.s;
  const top = STATS.map((st) => ({ st, v: statOf(s, c, st).total }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 2);
  return html`${top.map(
    (x, i) => html`${i ? ", " : ""}${STAT_NAMES[x.st]} ${x.v}`,
  )}`;
}

function opinionNum(ui: GameUi, c: Character): TemplateResult {
  const o = opinionOfRuler(ui.s, c);
  return num(
    String(o.total),
    () => breakdownTip(`What ${charName(c)} thinks of the governor`, o),
    o.total < -25 ? "bad" : o.total > 25 ? "good" : "",
  );
}

export function traitChip(t: Character["traits"][number]): TemplateResult {
  const r = TRAITS[t];
  return num(r.name, () => ({ title: r.name, notes: [r.text] }), "cq-trait");
}

function statGrid(ui: GameUi, c: Character): TemplateResult {
  const s = ui.s;
  return html`<div class="cq-statline">
    ${STATS.map((st) => {
      const b = statOf(s, c, st);
      return html`<div class="cq-statbox">
        <span>${STAT_NAMES[st]}</span>
        ${num(String(b.total), () => breakdownTip(STAT_NAMES[st], b))}
      </div>`;
    })}
  </div>`;
}

/** A full sheet for anyone: stats and why, traits, family, health, plots. */
export function characterSheet(ui: GameUi, id: number): TemplateResult {
  const s = ui.s;
  const c = s.chars[id];
  if (!c) return html`<p class="cq-muted">Nobody by that name.</p>`;
  const nation = s.nations[c.nation];
  const isRuler = nation?.ruler === c.id;
  const father = s.chars[c.father];
  const mother = s.chars[c.mother];
  const spouse = s.chars[c.spouse];
  const ours = c.nation === ui.me;
  return html`
    <div class="cq-ruler-card">
      ${token(ui, c, "xl")}
      <div>
        <p class="cq-kicker">
          ${isRuler
            ? nation.kind === "power"
              ? "Governor of"
              : "Leader of"
            : c.alive
              ? "Of"
              : "Late of"}
          ${nation ? nationLink(ui, nation.id) : nothing}
        </p>
        <h2 class="cq-h2">${charName(c)}</h2>
        <p class="cq-muted">
          ${c.alive
            ? `Age ${ageOf(s, c)}, born ${formatDate(c.born)}`
            : `Died ${formatDate(c.died!.day)} of ${c.died!.cause}`}
        </p>
        <div class="cq-traits">${c.traits.map((t) => traitChip(t))}</div>
      </div>
    </div>
    ${statGrid(ui, c)}
    <div class="cq-stats">
      ${c.alive
        ? html`<div class="cq-stat">
            <span class="cq-stat-label">Risk of dying this year</span>
            ${num(
              pct(deathRisk(s, ui.w, c).total),
              () =>
                breakdownTip(
                  "Yearly risk of death",
                  deathRisk(s, ui.w, c),
                  (v) => `${Math.round(v * 1000) / 10}%`,
                ),
              "cq-stat-value",
            )}
          </div>`
        : nothing}
      ${!isRuler && c.alive && nation?.ruler !== undefined
        ? html`<div class="cq-stat">
            <span class="cq-stat-label">Thinks of their ruler</span
            >${opinionNum(ui, c)}
          </div>`
        : nothing}
      ${c.ambition
        ? html`<div class="cq-stat">
            <span class="cq-stat-label">Ambition</span
            ><span class="cq-stat-value small">${AMBITIONS[c.ambition]}</span>
          </div>`
        : nothing}
    </div>
    ${c.scheme?.exposed && ours
      ? section(
          "Caught plotting",
          html`<p>
              ${charName(c)} is ${SCHEMES[c.scheme.kind]}:
              ${Math.round(c.scheme.progress)}% of the way there
              (${num(`+${schemeSpeed(s, c).total} a month`, () =>
                breakdownTip("Plot progress a month", schemeSpeed(s, c)),
              )}).
            </p>
            <button
              class="cq-btn danger"
              @click=${() => void ui.cmd({ k: "confront", c: c.id })}
            >
              Banish them
            </button>`,
        )
      : nothing}
    ${ours && !isRuler && c.alive && !c.scheme?.exposed
      ? html`<p class="cq-muted small">
          Your spymaster has a
          ${num(pct(discoveryChance(s, c).total), () =>
            breakdownTip(
              "Chance each month of uncovering a plot by them",
              discoveryChance(s, c),
              pct,
            ),
          )}
          chance each month of catching any plot ${charName(c)} might be
          hatching.
        </p>`
      : nothing}
    ${section(
      "Family",
      html`<ul class="cq-list">
        ${father || mother
          ? html`<li>
              Parents:
              ${father ? charLink(ui, father, false) : "unknown"}${mother
                ? html`, ${charLink(ui, mother, false)}`
                : nothing}
            </li>`
          : nothing}
        <li>
          Spouse:
          ${spouse
            ? charLink(ui, spouse)
            : html`<span class="cq-muted">none</span>`}
        </li>
        <li>
          Children:
          ${c.children.length === 0
            ? html`<span class="cq-muted">none</span>`
            : c.children.map(
                (k, i) => html`${i ? ", " : ""}${charLink(ui, s.chars[k])}`,
              )}
        </li>
      </ul>`,
    )}
    ${c.memories.length > 0
      ? section(
          "Remembers",
          html`<ul class="cq-list">
            ${c.memories.map(
              (m) =>
                html`<li>
                  ${m.why}
                  <span class=${m.value >= 0 ? "good" : "bad"}
                    >${m.value > 0 ? "+" : ""}${m.value}</span
                  >${m.until
                    ? html` <span class="cq-muted small"
                        >until ${formatDate(m.until)}</span
                      >`
                    : nothing}
                </li>`,
            )}
          </ul>`,
        )
      : nothing}
  `;
}
