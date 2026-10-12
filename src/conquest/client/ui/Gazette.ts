// POWER (r12): Society › Press. A newspaper of your own: its masthead,
// readers, credit and income; writing a piece for or against a person, a
// cause or the governor (with how hard it will land and what it risks);
// writers and the paper's line; the last issue as a front page. Without a
// paper: where one can be founded or bought, and the printer's road. And
// every paper in reach, with its latest pieces.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import { hasPlace } from "../../engine/LifeQueries";
import {
  buyCheck,
  FOUND_COST,
  foundCheck,
  licenceLine,
  licenceNeeded,
  licenceOdds,
  MAX_WRITERS,
  paperOf,
  papersIn,
  papersWithin,
  paperValue,
  pieceForce,
  pieceRisk,
  piecesPerMonth,
  piecesThisMonth,
  pieceTargets,
  printCheck,
  READER_PRICE,
  STANCE_NAMES,
  WRITER_WAGE,
  writerPool,
} from "../../engine/Press";
import { charName, stat } from "../../engine/Queries";
import type { Paper, Piece } from "../../engine/Types";
import { num } from "../Tip";
import { action, breakdownTip, charLink, GameUi, section } from "./Context";
import { howTo, pageHead } from "./Nav";
import { price } from "./Price"; // LEDGER (r15)

const draft: {
  on: Piece["on"];
  id: number;
  side: number;
  stance: Paper["stance"];
} = {
  on: "c",
  id: -1,
  side: 1,
  stance: "independent",
};
let hirePick = -1;

const ON_NAMES: Record<Piece["on"], string> = {
  c: "A person",
  m: "A cause",
  g: "The governor",
};

/** A paper's front page: the masthead and its last pieces. */
export function frontPage(ui: GameUi, x: Paper, n = 4): TemplateResult {
  const s = ui.s;
  const last = [...x.printed].reverse().slice(0, n);
  const shut = !!x.shut && x.shut > s.day;
  return html`<article class="cq-paper ${shut ? "shut" : ""}">
    <header class="cq-paper-mast">
      <span class="cq-paper-rule"
        >Published by authority${x.licensed ? "" : "? Not licensed"}</span
      >
      <h3 class="cq-paper-name">${x.name}</h3>
      <span class="cq-paper-rule">
        ${ui.map.provinces[x.p]?.name} ·
        ${formatDate(x.printed[x.printed.length - 1]?.day ?? x.issued)} ·
        ${STANCE_NAMES[x.stance]}
      </span>
    </header>
    ${shut
      ? html`<p class="cq-paper-shut">Shut by order of the governor.</p>`
      : last.length
        ? html`<ul class="cq-paper-cols">
            ${last.map(
              (p) =>
                html`<li class=${p.side > 0 ? "for" : "against"}>
                  <b>${p.head}</b>
                  <span class="cq-muted small">${formatDate(p.day)}</span>
                </li>`,
            )}
          </ul>`
        : html`<p class="cq-muted small cq-paper-empty">
            Ships in, ships out, the prices current, a runaway horse advertised.
          </p>`}
  </article>`;
}

function masthead(ui: GameUi, x: Paper): TemplateResult {
  const s = ui.s;
  const income =
    x.income ??
    Math.round(
      (x.readers * READER_PRICE - x.writers.length * WRITER_WAGE - 1) * 100,
    ) / 100;
  const shut = !!x.shut && x.shut > s.day;
  const need = licenceNeeded(s, x.nation);
  return html`<div class="cq-stats">
      <div class="cq-stat">
        <span class="cq-stat-label">Readers</span>
        <span class="cq-stat-value">${x.readers}</span>
        <span class="cq-stat-note"
          >${READER_PRICE * 1000} coins a thousand a month</span
        >
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">Credit</span>
        ${num(
          String(Math.round(x.credit)),
          () => ({
            title: "How far it's believed",
            notes: [
              "Pieces that land raise it; pieces that fall flat, a new line, a shutting and a lost libel suit lower it.",
              "Credit makes pieces land harder and keeps libel suits away.",
            ],
          }),
          "cq-stat-value",
        )}
        <span class="cq-stat-note">0 to 100</span>
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">Last month</span>
        <span class="cq-stat-value ${income < 0 ? "bad" : ""}"
          >${income >= 0 ? "+" : ""}${income}</span
        >
        <span class="cq-stat-note"
          >after ${x.writers.length} writer${x.writers.length === 1 ? "" : "s"}
          and paper</span
        >
      </div>
    </div>
    <p class="small">
      ${need
        ? x.licensed
          ? html`<span class="cq-chip good">licensed</span>`
          : html`<span class="cq-chip bad"
              >unlicensed: every piece risks the press</span
            >`
        : html`<span class="cq-chip">no licence wanted</span>`}
      ${shut
        ? html`<span class="cq-chip bad"
            >shut until ${formatDate(x.shut!)}</span
          >`
        : nothing}
      <span class="cq-muted">${licenceLine(s, x.nation)}</span>
    </p>`;
}

function composer(ui: GameUi, x: Paper): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const targets = pieceTargets(s, life, draft.on);
  if (!targets.some((t) => t.id === draft.id)) draft.id = targets[0]?.id ?? -1;
  const force = pieceForce(s, life, x);
  const risk = pieceRisk(s, life, x, draft.on, draft.id, draft.side);
  const check = printCheck(s, life);
  const left = piecesPerMonth(x) - piecesThisMonth(s, x);
  const what =
    draft.on === "c"
      ? "Moves their chances at the polls (and a councillor's standing with the governor); a player's renown."
      : draft.on === "m"
        ? "Moves the cause's support in the colony."
        : draft.side > 0
          ? "Calms the town a little, and the governor remembers it kindly."
          : "Stirs the town and the causes against the government; the governor remembers.";
  return section(
    "Print a piece",
    html`<div class="cq-seg" role="radiogroup" aria-label="About">
        ${(["c", "m", "g"] as const).map(
          (k) =>
            html`<button
              role="radio"
              aria-checked=${draft.on === k}
              class=${draft.on === k ? "on" : ""}
              @click=${() => {
                draft.on = k;
                draft.id = -1;
                ui.redraw();
              }}
            >
              ${ON_NAMES[k]}
            </button>`,
        )}
      </div>
      <div class="cq-composer">
        <label class="cq-field">
          <span>About</span>
          <select
            @change=${(e: Event) => {
              draft.id = Number((e.target as HTMLSelectElement).value);
              ui.redraw();
            }}
          >
            ${targets.map(
              (t) =>
                html`<option value=${t.id} ?selected=${t.id === draft.id}>
                  ${t.label} (${t.note})
                </option>`,
            )}
          </select>
        </label>
        <div class="cq-seg" role="radiogroup" aria-label="For or against">
          <button
            role="radio"
            aria-checked=${draft.side > 0}
            class=${draft.side > 0 ? "on" : ""}
            @click=${() => {
              draft.side = 1;
              ui.redraw();
            }}
          >
            For
          </button>
          <button
            role="radio"
            aria-checked=${draft.side < 0}
            class=${draft.side < 0 ? "on" : ""}
            @click=${() => {
              draft.side = -1;
              ui.redraw();
            }}
          >
            Against
          </button>
        </div>
      </div>
      <p class="small">${what}</p>
      <p class="small">
        It would land with a force of
        ${num(
          String(force.total),
          () => breakdownTip("How hard the piece lands", force),
          "cq-opinion good",
        )}
        (half that if it falls flat). The risk:
        ${num(
          `${Math.round(risk.total)}%`,
          () =>
            breakdownTip(
              "What could come of it",
              risk,
              (v) => `${Math.round(v)}%`,
              [
                "A person attacked may sue for libel (a trial); the governor may prosecute for seditious libel or shut the press; an unlicensed press may be seized.",
              ],
            ),
          `cq-opinion ${risk.total >= 20 ? "bad" : ""}`,
        )}
        of a libel suit, the governor's anger or a seizure.
      </p>
      ${targets.length
        ? html`<div class="cq-btnrow">
            ${action(
              `Print it (${Math.max(0, left)} of ${piecesPerMonth(x)} this month)`,
              check,
              () =>
                void ui.cmd({
                  k: "power",
                  act: "print",
                  on: draft.on,
                  c: draft.id,
                  side: draft.side,
                }),
              "primary",
            )}
          </div>`
        : html`<p class="cq-muted small">
            ${draft.on === "m"
              ? "No cause stirs in the colony."
              : "Nobody to write about."}
          </p>`}`,
  );
}

function staff(ui: GameUi, x: Paper): TemplateResult {
  const s = ui.s;
  const pool = writerPool(s, x);
  if (!pool.some((c) => c.id === hirePick)) hirePick = pool[0]?.id ?? -1;
  return section(
    "Writers and the paper's line",
    html`<ul class="cq-list">
        ${x.writers.map(
          (c) =>
            html`<li>
              ${charLink(ui, s.chars[c], false)}
              <span class="cq-muted small"
                >wit ${stat(s, s.chars[c], "int")} · ${WRITER_WAGE} a
                month</span
              >
              <button
                class="cq-btn quiet small"
                @click=${() => ui.cmd({ k: "power", act: "fire", c })}
              >
                Let go
              </button>
            </li>`,
        )}
        ${x.writers.length
          ? nothing
          : html`<li class="cq-muted small">You write it all yourself.</li>`}
      </ul>
      <div class="cq-btnrow">
        <select
          class="cq-office-pick"
          aria-label="Hire whom"
          @change=${(e: Event) => {
            hirePick = Number((e.target as HTMLSelectElement).value);
            ui.redraw();
          }}
        >
          ${pool.map(
            (c) =>
              html`<option value=${c.id} ?selected=${c.id === hirePick}>
                ${charName(c)} (wit ${stat(s, c, "int")})
              </option>`,
          )}
        </select>
        ${action(
          html`Hire a writer${price(WRITER_WAGE, { per: "month" })}`,
          x.writers.length >= MAX_WRITERS
            ? { ok: false, why: `${MAX_WRITERS} is all a paper can feed.` }
            : pool.length
              ? { ok: true }
              : { ok: false, why: "Nobody in town who can write." },
          () => void ui.cmd({ k: "power", act: "hire", c: hirePick }),
          "small",
        )}
      </div>
      <p class="cq-muted small">
        Each writer adds a piece a month, and the best one's wit makes every
        piece land harder.
      </p>
      <div class="cq-seg" role="radiogroup" aria-label="The paper's line">
        ${(Object.keys(STANCE_NAMES) as Paper["stance"][]).map(
          (k) =>
            html`<button
              role="radio"
              aria-checked=${x.stance === k}
              class=${x.stance === k ? "on" : ""}
              @click=${() =>
                x.stance !== k &&
                ui.cmd({ k: "power", act: "stance", stance: k })}
            >
              ${STANCE_NAMES[k]}
            </button>`,
        )}
      </div>
      <p class="cq-muted small">
        For the government: the governor's favour and an easy licence, fewer
        readers when the town is angry. For the country party: readers in hard
        times, and the governor's suspicion. A new line costs credit.
      </p>
      <div class="cq-btnrow end">
        <button
          class="cq-btn quiet small"
          @click=${() =>
            confirm(`Sell ${x.name} for about ${paperValue(x)} coins?`) &&
            void ui.cmd({ k: "power", act: "sell" })}
        >
          Sell the paper${price(paperValue(x), { gain: true, approx: true })}
        </button>
      </div>`,
  );
}

function getOne(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const check = foundCheck(s, ui.w, life);
  const here = life.travel ? [] : papersIn(s, life.prov);
  const press = !life.travel && hasPlace(s, ui.w, life.prov, "press");
  const odds = licenceNeeded(s, s.provinces[life.prov]?.owner ?? -1)
    ? licenceOdds(s, life, s.provinces[life.prov].owner, draft.stance)
    : null;
  return html`${howTo(
    "You own no newspaper. A paper of your own prints pieces that move elections, causes and the governor's temper, earns by its readers, and brings libel suits and the governor's anger.",
    [
      html`<b>Found one</b> at a printing house (a capital, or a town of 2,500)
        where the law allows a press: ${FOUND_COST} coins, letters 3. The
        English colonies have newspapers from 1704, New Spain from 1722; New
        France none until the 1760s.`,
      html`<b>Buy one</b> from its printer, at its printing house.`,
      html`<b>Rise to it</b>: the printer's trade (News and print) ends at
        Publisher, with a press and a paper of your own.`,
    ],
  )}
  ${section(
    "Found a paper here",
    html`<div class="cq-seg" role="radiogroup" aria-label="Its line">
        ${(Object.keys(STANCE_NAMES) as Paper["stance"][]).map(
          (k) =>
            html`<button
              role="radio"
              aria-checked=${draft.stance === k}
              class=${draft.stance === k ? "on" : ""}
              @click=${() => {
                draft.stance = k;
                ui.redraw();
              }}
            >
              ${STANCE_NAMES[k]}
            </button>`,
        )}
      </div>
      ${odds
        ? html`<p class="small">
            ${licenceLine(s, s.provinces[life.prov].owner)} Would the governor
            license it?
            ${num(
              odds.total >= 0 ? "Yes" : "No",
              () => breakdownTip("A licence for your press", odds),
              `cq-opinion ${odds.total >= 0 ? "good" : "bad"}`,
            )}
            ${odds.total < 0
              ? "(You may print without one, at the risk of the press.)"
              : ""}
          </p>`
        : nothing}
      <div class="cq-btnrow">
        ${action(
          html`Found a paper${price(FOUND_COST, { have: life.purse })}`,
          check,
          () => void ui.cmd({ k: "power", act: "found", stance: draft.stance }),
          "primary",
        )}
      </div>
      ${!press
        ? html`<p class="cq-muted small">
            ${life.travel
              ? "On the road."
              : `${ui.map.provinces[life.prov].name} has no printing house.`}
          </p>`
        : nothing}`,
  )}
  ${here.length
    ? section(
        "Papers printed here",
        html`<ul class="cq-papers">
          ${here.map((x) => {
            const b = buyCheck(s, life, x.id);
            return html`<li>
              ${frontPage(ui, x, 2)}
              <div class="cq-btnrow">
                <span class="cq-muted small"
                  >${charName(s.chars[x.owner])}, printer · ${x.readers}
                  readers</span
                >
                ${action(
                  html`Buy
                  it${price(Math.round(paperValue(x) * 1.2), {
                    have: life.purse,
                  })}`,
                  b,
                  () => void ui.cmd({ k: "power", act: "buy", id: x.id }),
                  "small",
                )}
              </div>
            </li>`;
          })}
        </ul>`,
      )
    : nothing}`;
}

export function pressPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const x = paperOf(s, me.id);
  const reach = papersWithin(s, ui.map, life.prov, me.nation).filter(
    (y) => y !== x,
  );
  return html`${pageHead(
    x ? x.name : "The press",
    x
      ? html`Your newspaper, printed at ${ui.map.provinces[x.p]?.name} since
        ${formatDate(x.founded)}.`
      : "Newspapers: owning one, and what the colony's papers are saying.",
  )}
  ${x
    ? html`${masthead(ui, x)} ${frontPage(ui, x)} ${composer(ui, x)}
      ${staff(ui, x)}`
    : getOne(ui)}
  ${reach.length
    ? section(
        "The papers within reach",
        html`<ul class="cq-papers">
            ${reach.map((y) => html`<li>${frontPage(ui, y, 3)}</li>`)}
          </ul>
          <p class="cq-muted small">
            Read the gazette at a tavern or the printing house to hear their
            latest in your journal (and the leads and prices with them).
          </p>`,
      )
    : nothing}`;
}
