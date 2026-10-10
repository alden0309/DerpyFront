// The people you know, the wider world (wars, causes, the other players and
// the nations of the Americas), and any nation's page.

import { html, nothing, TemplateResult } from "lit";
import { dateOf, formatDate } from "../../engine/Calendar";
import { lifeTitle, meOf, opinionOf } from "../../engine/LifeQueries";
import { activeMovements } from "../../engine/Movements";
import {
  enemiesOf,
  nationPeople,
  provincesOf,
  strengthOf,
} from "../../engine/Queries";
import { END_YEAR, SEAT_NAMES } from "../../engine/Rules";
import type { Character, Nation } from "../../engine/Types";
import { SEATS } from "../../engine/Types";
import { flagFor } from "../Flags";
import { nationName, people } from "../Text";
import { movementCard } from "./Affairs";
import {
  charLink,
  GameUi,
  more,
  nationLink,
  provLink,
  section,
  token,
} from "./Context";
import { personRow } from "./Here";
import { steady } from "./Steady";
import { cultureChips } from "./WorldUi";

// ---------------------------------------------------------------- people you know

let metShown = 30;

export function peopleTab(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  if (!life || !me)
    return html`<p class="cq-empty">
      You're watching: click a province to see who lives there.
    </p>`;
  const alive = (id: number): Character | undefined => {
    const c = s.chars[id];
    return c?.alive && !c.abroad ? c : undefined;
  };
  const family = [me.spouse, ...me.children, me.father, me.mother]
    .map(alive)
    .filter((c): c is Character => !!c);
  const familyIds = new Set(family.map((c) => c.id));
  const ties = Object.keys(life.ties)
    .map(Number)
    .map(alive)
    .filter((c): c is Character => !!c && !familyIds.has(c.id));
  const tieIds = new Set(ties.map((c) => c.id));
  const patron = alive(life.patron);
  const met = life.met
    .map(alive)
    .filter(
      (c): c is Character =>
        !!c &&
        !familyIds.has(c.id) &&
        !tieIds.has(c.id) &&
        c.id !== patron?.id &&
        c.id !== me.id,
    )
    .map((c) => ({ c, op: opinionOf(s, c, life).total }))
    .sort((a, b) => b.op - a.op || a.c.id - b.c.id);
  // Best liked first when you open the page; then kept in that order while
  // you look, however opinions drift (newcomers at the end).
  const metSteady = steady("people", `${ui.visit}`, met, (x) => x.c.id)
    .filter((r) => r.state !== "folding")
    .map((r) => r.item);
  return html`<header class="cq-panel-head">
      <h2 class="cq-h1">People</h2>
      <p class="cq-muted small">
        Everyone you know, and what they make of you. Click someone to see what
        you could do with them.
      </p>
    </header>
    ${family.length
      ? section(
          "Family",
          html`<ul class="cq-folk">
            ${family.map((c) => personRow(ui, c))}
          </ul>`,
        )
      : nothing}
    ${patron
      ? section(
          "Your patron",
          html`<ul class="cq-folk">
            ${personRow(ui, patron)}
          </ul>`,
        )
      : nothing}
    ${ties.length
      ? section(
          "Friends, lovers and rivals",
          html`<ul class="cq-folk">
            ${ties.map((c) => personRow(ui, c))}
          </ul>`,
        )
      : nothing}
    ${section(
      `People you've met (${met.length})`,
      met.length
        ? html`<ul class="cq-folk">
              ${metSteady.slice(0, metShown).map(({ c }) => personRow(ui, c))}
            </ul>
            ${met.length > metShown
              ? html`<button
                  class="cq-btn small quiet"
                  @click=${() => {
                    metShown += 40;
                    ui.redraw();
                  }}
                >
                  More
                </button>`
              : nothing}`
        : html`<p class="cq-empty">
            Nobody yet. Go out: the tavern, the church, the market.
          </p>`,
    )}`;
}

// ---------------------------------------------------------------- the world

export function worldTab(ui: GameUi): TemplateResult {
  const s = ui.s;
  const year = dateOf(s.day).year;
  const left = END_YEAR - year;
  const powers = s.nations.filter((n) => n.alive && n.kind === "power");
  const natives = s.nations
    .filter((n) => n.alive && n.kind === "native")
    .sort((a, b) => provincesOf(s, b.id).length - provincesOf(s, a.id).length);
  const risings = s.nations.filter((n) => n.alive && n.kind === "rebels");
  const others = s.lives.filter((l) => l.seat !== ui.seat);
  const causes = activeMovements(s);
  return html`<header class="cq-panel-head">
      <h2 class="cq-h1">The world</h2>
      <p class="cq-muted small">
        ${formatDate(s.day)}.
        ${left > 0
          ? `${left} year${left === 1 ? "" : "s"} until 1776.`
          : "1776."}
      </p>
    </header>
    ${others.length
      ? section(
          "The other players",
          html`<ul class="cq-folk">
            ${others.map((l) => {
              const c = meOf(s, l);
              return html`<li>
                <button
                  class="cq-folk-row"
                  ?disabled=${!c}
                  @click=${() => c && ui.open({ k: "char", c: c.id })}
                >
                  ${token(ui, c, "small")}
                  <span class="cq-folk-text">
                    <b>${l.name}</b>
                    <span class="cq-muted small"
                      >${c
                        ? html`${c.first} ${c.family}, ${lifeTitle(s, l)}`
                        : "watching"}</span
                    >
                  </span>
                </button>
              </li>`;
            })}
          </ul>`,
        )
      : nothing}
    ${section(
      "Wars",
      s.wars.length
        ? html`<ul class="cq-wars">
            ${s.wars.map(
              (w) =>
                html`<li>
                  ${nationLink(ui, w.a)}
                  <span class="cq-muted">against</span> ${nationLink(ui, w.b)}
                  <span class="cq-muted small"
                    >${w.why}, since ${dateOf(w.start).year}; battles won
                    ${w.won[0]}–${w.won[1]}</span
                  >
                </li>`,
            )}
          </ul>`
        : html`<p class="cq-muted">The Americas are at peace, for now.</p>`,
    )}
    ${section(
      "Causes and risings",
      causes.length
        ? html`${causes.map((m) => movementCard(ui, m, false))}`
        : html`<p class="cq-muted">
            Nobody is plotting anything (that you know of).
          </p>`,
    )}
    ${section(
      "The colonies",
      html`<ul class="cq-nations">
        ${powers.map((n) => nationRow(ui, n))}${risings.map((n) =>
          nationRow(ui, n),
        )}
      </ul>`,
    )}
    ${more(
      `The native nations (${natives.length})`,
      html`<ul class="cq-nations">
        ${natives.map((n) => nationRow(ui, n))}
      </ul>`,
    )}`;
}

function nationRow(ui: GameUi, n: Nation): TemplateResult {
  const s = ui.s;
  const ruler = s.chars[n.ruler];
  const provs = provincesOf(s, n.id).length;
  return html`<li>
    ${nationLink(ui, n.id)}
    <span class="cq-muted small">
      ${n.kind === "rebels"
        ? `${Math.round(strengthOf(s, n.id))} under arms`
        : `${provs} province${provs === 1 ? "" : "s"}, ${people(nationPeople(s, n.id))}`}${ruler?.alive
        ? html`;
          ${n.kind === "native"
            ? "led by"
            : n.kind === "rebels"
              ? "under"
              : "governed by"}
          ${charLink(ui, ruler, false)}`
        : nothing}
    </span>
  </li>`;
}

/** Any nation's page. */
export function nationPage(ui: GameUi, id: number): TemplateResult {
  const s = ui.s;
  const n = s.nations[id];
  if (!n) return html`<p class="cq-empty">No such nation.</p>`;
  const native = n.kind === "native";
  const ruler = s.chars[n.ruler];
  const provs = provincesOf(s, id);
  const pol = s.polities[id];
  const enemies = enemiesOf(s, id);
  const causes = activeMovements(s).filter(
    (m) => m.against === id || m.rebels === id,
  );
  const mine = ui.me?.nation === id;
  return html`<header class="cq-panel-head with-flag">
      ${flagFor(n, "cq-flag lg")}
      <div>
        <h2 class="cq-h1">${nationName(n.name)}</h2>
        <p class="cq-muted small">
          ${n.kind === "power"
            ? n.independent
              ? "An independent republic."
              : n.rebelling
                ? "In rebellion against its crown."
                : "A colony of the crown."
            : n.kind === "native"
              ? "A native nation."
              : n.kind === "rebels"
                ? "A rising in arms."
                : "A crown's expedition."}
          ${mine ? html`<b>Your people.</b>` : nothing}
          ${!n.alive ? html`<b class="bad">No more.</b>` : nothing}
        </p>
        ${n.kind === "power" || n.kind === "native"
          ? cultureChips(ui, id)
          : nothing}
      </div>
    </header>
    ${section(
      native ? "Leaders" : "Government",
      html`<dl class="cq-family">
          <dt>
            ${native ? "Leader" : n.kind === "rebels" ? "Captain" : "Governor"}
          </dt>
          <dd>
            ${ruler?.alive
              ? html`${token(ui, ruler, "small")} ${charLink(ui, ruler)}`
              : html`<span class="cq-muted">none</span>`}
          </dd>
          ${n.kind === "power" || native
            ? SEATS.map((seat) => {
                const c = s.chars[n.council[seat]];
                return html`<dt>${SEAT_NAMES[seat]}</dt>
                  <dd>
                    ${c?.alive
                      ? charLink(ui, c)
                      : html`<span class="cq-muted">empty</span>`}
                  </dd>`;
              })
            : nothing}
        </dl>
        ${pol
          ? html`<p class="small">
              <b>${pol.name}</b>:
              ${pol.assembly.length
                ? pol.assembly.map(
                    (c, i) =>
                      html`${i ? ", " : ""}${charLink(ui, s.chars[c], false)}`,
                  )
                : html`<span class="cq-muted">no one sitting</span>`}.
              Next ${native ? "gathering" : "election"}
              ${formatDate(pol.election)}.
            </p>`
          : nothing}`,
    )}
    ${n.kind !== "rebels" && n.kind !== "crown"
      ? section(
          "The land",
          html`<p class="small">
              ${provs.length} province${provs.length === 1 ? "" : "s"},
              ${people(nationPeople(s, id))} people.
              ${n.capital >= 0
                ? html`Capital: ${provLink(ui, n.capital)}.`
                : nothing}
              ${Math.round(strengthOf(s, id))} under arms.
            </p>
            ${n.kind === "power"
              ? html`<p class="cq-muted small">
                  Treasury ${Math.round(n.gold)}; taxes
                  ${["low", "normal", "high"][n.tax]}; the crown's favour
                  ${Math.round(n.favor)}, autonomy ${Math.round(n.autonomy)}.
                </p>`
              : nothing}`,
        )
      : nothing}
    ${enemies.length
      ? section(
          "At war with",
          html`<p>${enemies.map((e) => html`${nationLink(ui, e)} `)}</p>`,
        )
      : nothing}
    ${causes.length
      ? section(
          "Causes against it",
          html`${causes.map((m) => movementCard(ui, m, false))}`,
        )
      : nothing}`;
}
