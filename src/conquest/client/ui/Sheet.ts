// Your character sheet (who you are, what you're good at, your family and
// your friends and enemies) and anyone else's page (what they think of you
// and what you could do with them).

import { html, nothing, TemplateResult } from "lit";
import { ambitionProgress, AMBITIONS } from "../../engine/Ambitions";
import { areaName, whereabouts } from "../../engine/Areas";
import { dateOf, formatDate } from "../../engine/Calendar";
import {
  GROUP_NAMES,
  interactionMenu,
  INTERACTIONS,
} from "../../engine/Interactions";
import {
  ageOfLife,
  familyAtHome,
  heirOf,
  isChildLife,
  isNativeChar,
  jobTitle,
  lifeIsNative,
  lifeOfChar,
  lifestyleCost,
  lifeTitle,
  monthlyBudget,
  officesOf,
  opinionOf,
  siblingsOf,
  stationOf,
  weddingCost, // LEDGER (r15)
} from "../../engine/LifeQueries";
import {
  ATTRIBUTE_HELP,
  ATTRIBUTE_NAMES,
  LIFE_TRAIT_TEXT,
  LIFESTYLES,
  livingOf,
  WORK_DAYS,
} from "../../engine/LifeRules";
import { owing } from "../../engine/LoanCore"; // ECON (r17)
import { movementOf } from "../../engine/Movements";
import { houseDefs, propertyOf } from "../../engine/Property";
import { ageOf, charName, statOf } from "../../engine/Queries";
import { RELIGION_NAMES, TRAITS } from "../../engine/Rules";
import type { Character, Good, WareId } from "../../engine/Types";
import { STATS } from "../../engine/Types";
import { WARES } from "../../engine/Wares";
import { arms } from "../Arms";
import { GOOD_NAMES } from "../Text";
import { num, plain } from "../Tip";
import { moneyBetween, owedList } from "./Bonds"; // ECON (r17)
import { curveNotes } from "./Canvass"; // POLLS (r16)
import {
  bar,
  breakdownTip,
  charLink,
  GameUi,
  nationLink,
  provLink,
  section,
  token,
} from "./Context";
import { roleOf, verdictChip } from "./Here";
import { intrigueCard } from "./Intrigue"; // INTRIGUE (r15)
import {
  healthMeter,
  marksChips,
  skillsList,
  statsSection,
  studyLine,
} from "./LifeR21"; // LIFE (r21)
import { personR11 } from "./Livelihood";
import { partnerCard } from "./Partners"; // PARTNERS (r13)
import { price, splitPrice } from "./Price"; // LEDGER (r15)
import { eduChip } from "./Schooling"; // EDU (r13)
import { sittingPrompt } from "./Sitting";
import { personSociety } from "./Society"; // SOCIETY (r11)
import { steadySet } from "./Steady";
import { term, termMark } from "./Terms";

export function traitChips(c: Character, life = false): TemplateResult {
  if (c.traits.length === 0)
    return html`<span class="cq-muted small">No marked traits.</span>`;
  return html`<span class="cq-traits">
    ${c.traits.map(
      (t) =>
        html`<span
          class="cq-chip trait ${TRAITS[t].acquired ? "earned" : ""}"
          title=${life ? LIFE_TRAIT_TEXT[t] : TRAITS[t].text}
          >${TRAITS[t].name}</span
        >`,
    )}
  </span>`;
}

export function meter(
  label: string | TemplateResult,
  v: number,
  max: number,
  tip: string,
  invert = false,
): TemplateResult {
  const f = v / max;
  return html`<div
    class="cq-meter"
    title=${typeof label === "string" ? tip : ""}
  >
    <span class="cq-meter-label">${label}</span>
    ${bar(invert ? 1 - f : f, invert ? "invert" : "")}
    <span class="cq-meter-n">${Math.round(v)}</span>
  </div>`;
}

/** The You tab. */
/** Your work, what you're after and what you own, at a glance. */
export function glance(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const a = life.ambition;
  const def = a ? AMBITIONS[a.key] : undefined;
  const prog = ambitionProgress(s, life);
  const props = propertyOf(life);
  const native = lifeIsNative(s, life);
  const owned = props.map((pr) =>
    pr.kind === "house"
      ? (houseDefs(native)[pr.level - 1]?.name ?? "House").toLowerCase()
      : pr.kind === "land"
        ? `${pr.level * 10} acres`
        : pr.name.toLowerCase(),
  );
  return html`<div class="cq-glance">
    <button
      class="cq-glance-item"
      @click=${() => ui.open({ k: "tab", tab: "work", sub: "job" })}
    >
      <span class="cq-meter-label">Work</span>
      <span>${life.job ? jobTitle(life) : "None"}</span>
      ${life.job
        ? html`<span class="cq-muted small"
            >${Math.min(WORK_DAYS, life.job.worked ?? 0)} of ${WORK_DAYS} days
            this month</span
          >`
        : html`<span class="cq-muted small">ask someone who hires</span>`}
    </button>
    <button
      class="cq-glance-item"
      @click=${() => ui.open({ k: "tab", tab: "you", sub: "ambition" })}
    >
      <span class="cq-meter-label">Ambition</span>
      <span>${def?.name ?? "None set"}</span>
      ${prog
        ? bar(prog[1] > 0 ? prog[0] / prog[1] : 0, "xp")
        : html`<span class="cq-muted small">choose one</span>`}
    </button>
    <button
      class="cq-glance-item"
      @click=${() => ui.open({ k: "tab", tab: "estate", sub: "house" })}
    >
      <span class="cq-meter-label">Property</span>
      <span
        >${owned.length
          ? owned.join(", ").replace(/^./, (m) => m.toUpperCase())
          : "Nothing yet"}</span
      >
    </button>
  </div>`;
}

/** You › Yourself: who you are, how you're keeping, what you're good at. */
export function youTab(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  if (!life || !me)
    return html`<p class="cq-empty">
      You're watching. Take over someone, or begin a new life.
    </p>`;
  const native = isNativeChar(s, me);
  const budget = monthlyBudget(s, ui.w, life);
  const child = isChildLife(s, life);
  const station = stationOf(s, life);
  return html`<header class="cq-sheet-top">
      ${token(ui, me, "xl")}
      <div class="cq-sheet-who">
        <p class="cq-kicker">${lifeTitle(s, life)}</p>
        <h2 class="cq-h1">${charName(me)}</h2>
        <p class="cq-muted small">
          ${ageOf(s, me)}, born ${formatDate(me.born)};
          ${RELIGION_NAMES[me.religion]}. ${nationLink(ui, me.nation)}
        </p>
        ${life.motto ? html`<p class="cq-motto">“${life.motto}”</p>` : nothing}
        ${sittingPrompt(ui)}
      </div>
      <span class="cq-sheet-arms"
        >${arms(life.sigil, "cq-arms", native, "Your arms")}</span
      >
    </header>
    <div class="cq-meters">
      ${healthMeter(ui) /* LIFE (r21): the most it can be, and the strain */}
      ${meter(
        term("stress"),
        life.stress,
        100,
        "At 70 your health and judgement suffer. Drink, prayer, rest and good company bring it down.",
        true,
      )}
      <div class="cq-meter">
        <span class="cq-meter-label">${term("renown")}</span>
        ${term("renown", plain(life.renown), "cq-meter-big", () =>
          curveNotes(life, "renown"),
        )}
        <span class="cq-muted small"
          >${term(
            "favour",
            `${native ? "elders' regard" : "favour at home"} ${plain(life.favor)}`,
            "",
            () => curveNotes(life, "favour"), // POLLS (r16)
          )}</span
        >
      </div>
      <div class="cq-meter">
        <span class="cq-meter-label">${term("purse")}</span>
        <span class="cq-meter-big">${plain(life.purse)}</span>
        ${num(
          `${budget.total >= 0 ? "+" : ""}${plain(budget.total)} a month`,
          () => breakdownTip("A month's money", budget),
          `small ${budget.total >= 0 ? "good" : "bad"}`,
        )}
      </div>
    </div>
    ${child ? nothing : glance(ui)}
    ${child
      ? nothing
      : html`<p class="small cq-station-line">
          ${term("station", "Station")}: among <b>${station.name}</b>. How you
          live:
          <b>${livingOf(native, life.lifestyle).name}</b>${station.expected ===
          life.lifestyle
            ? ", as they expect"
            : LIFESTYLES.indexOf(life.lifestyle) <
                LIFESTYLES.indexOf(station.expected)
              ? html`;
                  <span class="bad"
                    >they expect
                    ${livingOf(
                      native,
                      station.expected,
                    ).name.toLowerCase()}</span
                  >`
              : ", above what they expect"}.
          <button
            class="cq-link small"
            @click=${() => ui.open({ k: "tab", tab: "estate", sub: "purse" })}
          >
            Change how you live ›
          </button>
        </p>`}
    ${section(
      "Attributes",
      html`<div class="cq-attrs">
          ${STATS.map((st) => {
            const b = statOf(s, me, st);
            return html`<div class="cq-attr" title=${ATTRIBUTE_HELP[st]}>
              <span class="cq-stat-label">${ATTRIBUTE_NAMES[st]}</span>
              ${num(
                String(b.total),
                () =>
                  breakdownTip(ATTRIBUTE_NAMES[st], b, undefined, [
                    ATTRIBUTE_HELP[st],
                  ]),
                "cq-stat-value",
              )}
            </div>`;
          })}
        </div>
        ${studyLine(ui) /* LIFE (r21): learning grown by study */}`,
    )}
    ${section(
      html`Skills ${termMark("skills")}`,
      skillsList(
        ui,
      ) /* LIFE (r21): thirty levels, each with its tier and its next */,
    )}
    ${section(
      "Traits",
      html`${traitChips(me, true)} ${marksChips(ui) /* LIFE (r21) */}
        <ul class="cq-trait-notes">
          ${me.traits.map(
            (t) =>
              html`<li><b>${TRAITS[t].name}</b>: ${LIFE_TRAIT_TEXT[t]}</li>`,
          )}
        </ul>`,
    )}
    ${child
      ? html`<p class="cq-callout small">
          A child of ${ageOfLife(s, life)}: you can't work, marry or hold office
          until sixteen, but you can learn: study, pray, listen, and visit.
        </p>`
      : nothing}`;
}

/** Estate › Purse: how you live, and what it costs. */
export function livingSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const native = isNativeChar(s, me);
  const cost = lifestyleCost(s, life);
  const child = isChildLife(s, life);
  const station = stationOf(s, life);
  return section(
    "How you live",
    html`<div
        class="cq-seg cq-living"
        role="radiogroup"
        aria-label="Way of living"
      >
        ${LIFESTYLES.map(
          (l) =>
            html`<button
              role="radio"
              aria-checked=${life.lifestyle === l}
              class=${!child && station.expected === l ? "expected" : ""}
              title=${livingOf(native, l).text}
              @click=${() => ui.cmd({ k: "lifestyle", v: l })}
            >
              ${livingOf(native, l).name}
            </button>`,
        )}
      </div>
      <p class="cq-muted small">
        ${livingOf(native, life.lifestyle).text}
        ${num(`${plain(cost.total)} a month`, () =>
          breakdownTip("Living costs", cost),
        )}
      </p>
      ${child
        ? nothing
        : html`<p class="cq-muted small">
            The underlined way is what your ${term("station", "station")}
            (${station.name}) expects of you.
          </p>`}`,
  );
}

export function familySection(ui: GameUi, me: Character): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const spouse = s.chars[me.spouse];
  const kids = me.children
    .map((id) => s.chars[id])
    .filter((c): c is Character => !!c);
  const heir = heirOf(s, life);
  const parents = [s.chars[me.father], s.chars[me.mother]].filter(
    (c): c is Character => !!c,
  );
  const sibs = siblingsOf(s, me);
  const line = life.line
    .slice(0, -1)
    .map((id) => s.chars[id])
    .filter((c): c is Character => !!c);
  return section(
    "Family",
    html`<dl class="cq-family">
        ${parents.length
          ? html`<dt>Parents</dt>
              <dd>
                ${parents.map(
                  (c) => html`${charLink(ui, c)}${c.alive ? "" : " †"} `,
                )}
              </dd>`
          : nothing}
        <dt>${me.female ? "Husband" : "Wife"}</dt>
        <dd>
          ${spouse
            ? html`${charLink(ui, spouse)}${spouse.alive ? "" : " †"}`
            : html`<span class="cq-muted">Unmarried</span>`}
        </dd>
        <dt>Children</dt>
        <dd>
          ${kids.length === 0
            ? html`<span class="cq-muted">None yet</span>`
            : html`<ul class="cq-kids">
                ${kids.map(
                  (c) =>
                    html`<li>
                      ${charLink(ui, c)}${c.alive
                        ? nothing
                        : html` <span class="cq-muted"
                            >† ${c.died?.cause ?? ""}</span
                          >`}
                      ${c.abroad
                        ? html`<span class="cq-muted small">in Europe</span>`
                        : nothing}
                      ${eduChip(c)}
                      ${c.id === heir
                        ? html`<span class="cq-chip good">heir</span>`
                        : c.alive && !c.abroad
                          ? html`<button
                              class="cq-link small"
                              @click=${() => ui.cmd({ k: "heir", c: c.id })}
                            >
                              name heir
                            </button>`
                          : nothing}
                    </li>`,
                )}
              </ul>`}
        </dd>
        ${sibs.length
          ? html`<dt>Brothers and sisters</dt>
              <dd>
                ${sibs.map(
                  (c) => html`${charLink(ui, c)}${c.alive ? "" : " †"} `,
                )}
              </dd>`
          : nothing}
        ${line.length
          ? html`<dt>Your line</dt>
              <dd class="cq-line">
                ${line.map(
                  (c) =>
                    html`<span
                      >${charLink(ui, c, false)}<span class="cq-muted small">
                        ${c.alive
                          ? c.abroad
                            ? "in Europe"
                            : "living"
                          : `† ${c.died ? dateOf(c.died.day).year : ""}`}</span
                      ></span
                    >`,
                )}
              </dd>`
          : nothing}
      </dl>
      ${heir < 0
        ? html`<p class="cq-warn small">
            No heir: if you die now, your story ends.
          </p>`
        : nothing}
      <label class="cq-check small">
        <input
          type="checkbox"
          .checked=${life.shareWithSpouse}
          @change=${(e: Event) =>
            ui.cmd({
              k: "will",
              share: (e.target as HTMLInputElement).checked,
            })}
        />
        Leave a third of the purse to your widow(er)
      </label>
      ${familyAtHome(s, life).length
        ? html`<p class="cq-muted small">
            At home in ${provLink(ui, life.home)}:
            ${familyAtHome(s, life).length} besides you.
          </p>`
        : nothing}`,
  );
}

export function tiesSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const entries = Object.entries(life.ties)
    .map(([id, t]) => ({ c: s.chars[Number(id)], t }))
    .filter((x) => x.c?.alive);
  const patron = s.chars[life.patron];
  if (entries.length === 0 && !patron?.alive) return nothing;
  return section(
    "Friends and enemies",
    html`<ul class="cq-ties">
      ${patron?.alive
        ? html`<li>
            <span class="cq-tie patron">patron</span> ${charLink(ui, patron)}
          </li>`
        : nothing}
      ${entries.map(
        ({ c, t }) =>
          html`<li>
            <span class="cq-tie ${t}">${t}</span> ${charLink(ui, c)}
          </li>`,
      )}
    </ul>`,
  );
}

export function goodsSection(ui: GameUi): TemplateResult {
  const life = ui.life!;
  const goods = Object.entries(life.goods).filter(([, v]) => (v ?? 0) > 0) as [
    Good,
    number,
  ][];
  // WORLD r11: culture goods carried too.
  const wares = Object.entries(life.wares ?? {}).filter(
    ([, v]) => (v ?? 0) > 0,
  ) as [WareId, number][];
  // ECON (r17): what you owe is on bond now.
  const debts = owing(ui.s, life);
  if (goods.length === 0 && wares.length === 0 && debts.length === 0)
    return html``;
  return section(
    "Goods and debts",
    html`${goods.length || wares.length
      ? html`<p>
          Carrying:
          ${[
            ...goods.map(([g, v]) => `${v} ${GOOD_NAMES[g].toLowerCase()}`),
            ...wares.map(([g, v]) => `${v} ${WARES[g].name.toLowerCase()}`),
          ].join(", ")}.
          <button
            class="cq-link small"
            @click=${() => ui.modal({ k: "trade" })}
          >
            Sell
          </button>
        </p>`
      : nothing}
    ${debts.length ? owedList(ui) : nothing}`,
  );
}

// ---------------------------------------------------------------- someone else

/** Where someone is now, and what they're doing. */
function where(ui: GameUi, c: Character): TemplateResult {
  if (!c.alive || c.abroad) return html``;
  const w = whereabouts(ui.s, ui.w, c.id, ui.life);
  if (!w) return html``;
  const area = w.area
    ? areaName(ui.s, w.p, w.area).replace(/^The /, "the ")
    : null;
  return html`<p class="cq-where small">
    ${area
      ? html`In ${area} at ${provLink(ui, w.p)}`
      : html`At ${provLink(ui, w.p)}`},
    <i>${w.doing}</i>.
  </p>`;
}

/** Anyone's page: who they are, what they think of you, and what you could do. */
export function personPage(ui: GameUi, cId: number): TemplateResult {
  const s = ui.s;
  const c = s.chars[cId];
  if (!c) return html`<p class="cq-empty">Nobody by that name.</p>`;
  const life = ui.life;
  const mine = life && life.c >= 0 ? life : null;
  const op = mine ? opinionOf(s, c, mine) : null;
  const played = lifeOfChar(s, c.id);
  const offices = officesOf(s, c.id);
  const m = movementOf(s, c.id);
  const spouse = s.chars[c.spouse];
  const kids = c.children
    .map((id) => s.chars[id])
    .filter((x): x is Character => !!x?.alive);
  const parents = [s.chars[c.father], s.chars[c.mother]].filter(
    (x): x is Character => !!x,
  );
  const isMe = mine?.c === c.id;
  if (isMe) return youTab(ui);
  return html`<header class="cq-sheet-top">
      ${token(ui, c, "xl")}
      <div class="cq-sheet-who">
        <p class="cq-kicker">${offices[0]?.label ?? roleOf(ui, c)}</p>
        <h2 class="cq-h1">${charName(c)}</h2>
        <p class="cq-muted small">
          ${c.alive
            ? html`${ageOf(s, c)}, ${RELIGION_NAMES[c.religion]}.
              ${nationLink(ui, c.nation)}`
            : html`Died ${c.died ? formatDate(c.died.day) : ""}:
              ${c.died?.cause ?? ""}.`}
          ${c.abroad ? html` <b>Gone to Europe.</b>` : nothing}
        </p>
        ${played
          ? html`<p class="cq-chip">Played by ${played.name}</p>`
          : nothing}
        ${where(ui, c)} ${traitChips(c)}
      </div>
    </header>
    ${op
      ? html`<div class="cq-opinion-box">
          <span>What ${c.first} thinks of you</span>
          ${num(
            `${op.total > 0 ? "+" : ""}${op.total}`,
            () => breakdownTip(`${c.first}'s opinion of you`, op),
            `cq-opinion big ${op.total >= 20 ? "good" : op.total <= -20 ? "bad" : ""}`,
          )}
          ${mine?.ties[c.id]
            ? html`<span class="cq-tie ${mine.ties[c.id]}"
                >${mine.ties[c.id]}</span
              >`
            : nothing}
        </div>`
      : nothing}
    ${
      mine && c.alive && !c.abroad
        ? statsSection(ui, c)
        : nothing /* LIFE (r21) */
    }
    ${mine && c.alive && !c.abroad ? personSociety(ui, c) : nothing}
    ${mine && c.alive && !c.abroad ? actsSection(ui, c) : nothing}
    ${mine && c.alive && !c.abroad ? personR11(ui, c) : nothing}
    ${mine && c.alive && !c.abroad ? partnerCard(ui, c) : nothing}
    ${
      mine && c.alive && !c.abroad
        ? moneyBetween(ui, c)
        : nothing /* ECON (r17) */
    }
    ${mine && c.alive && !c.abroad ? intrigueCard(ui, c) : nothing}
    ${section(
      "Their family",
      html`<dl class="cq-family">
        ${parents.length
          ? html`<dt>Parents</dt>
              <dd>
                ${parents.map(
                  (x) => html`${charLink(ui, x)}${x.alive ? "" : " †"} `,
                )}
              </dd>`
          : nothing}
        <dt>Married</dt>
        <dd>
          ${spouse
            ? charLink(ui, spouse)
            : html`<span class="cq-muted">No</span>`}
        </dd>
        ${kids.length
          ? html`<dt>Children</dt>
              <dd>${kids.map((x) => html`${charLink(ui, x)} `)}</dd>`
          : nothing}
      </dl>`,
    )}
    ${m
      ? section(
          "Their cause",
          html`<p>
              <b>${m.name}</b> ${m.leader === c.id ? "(they lead it)" : ""}
            </p>
            <p class="cq-muted small">${m.text}</p>`,
        )
      : nothing}
    ${c.home !== undefined
      ? html`<p class="cq-muted small cq-pad">
          Lives at ${provLink(ui, c.home)}.
        </p>`
      : nothing}
    ${life?.watching && c.alive && !c.abroad && !played && ageOf(s, c) >= 16
      ? html`<div class="cq-callout">
          <p>
            You're watching. You could take up ${c.first}'s life from here on.
          </p>
          <button
            class="cq-btn primary"
            @click=${async () => {
              if (await ui.cmd({ k: "takeover", c: c.id }))
                ui.open({ k: "tab", tab: "here" });
            }}
          >
            Become ${c.first}
          </button>
        </div>`
      : nothing}`;
}

/** Reasons an interaction isn't for the two of you at all (not shown). */
const NOT_BETWEEN_YOU =
  /^(Only with a lover|You've nothing on them|Nothing to seek|You're not getting up|Nothing they could teach|You know their secret|They paid you lately|They don't take|They've nothing|You belong to no|They belong to no|They're a player|Not in this century|That's you|They haven't the standing|Too close kin|Not your own family|They're married|You're married|They're a child|You don't work for|They're not your master|You'd need a business|You have no work|You're your own master|Only with another|A commission comes|They've nothing to teach|A duel needs|A child)/;

/**
 * What you could do with someone, grouped. Once a button is shown it stays
 * while you look at them (greyed, with why, if it can't be done just now),
 * and every button is the same size, so nothing moves as the days pass.
 */
function actsSection(ui: GameUi, c: Character): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const menu = interactionMenu(s, ui.w, life, c.id);
  const keyOf = (m: { act: string; arg?: number }) => `${m.act}:${m.arg ?? ""}`;
  const now = menu
    .filter(
      ({ act, view }) =>
        view.check.ok ||
        act === "talk" ||
        !NOT_BETWEEN_YOU.test(view.check.why),
    )
    .map(keyOf);
  const keys = new Set(steadySet("card", `${ui.visit}:${c.id}`, now));
  const shown = menu.filter((m) => keys.has(keyOf(m)));
  const groups = [...new Set(shown.map((m) => m.group))];
  const other = lifeOfChar(s, c.id);
  return html`<section class="cq-section cq-interactions">
    <h3 class="cq-h3">Interactions</h3>
    ${other
      ? html`<p class="cq-muted small">
          ${c.first} is another player: friendship, courting, marriage, duels,
          your cause, work and trade go to them to answer.
        </p>`
      : nothing}
    ${groups.map(
      (gr) =>
        html`<h4 class="cq-int-group">${GROUP_NAMES[gr]}</h4>
          <div class="cq-int-list">
            ${shown
              .filter((m) => m.group === gr)
              .map(({ act, arg, view }) => {
                const def = INTERACTIONS[act];
                const hostile = gr === "hostile";
                // LEDGER (r15): what it costs, on the button.
                const said = splitPrice(view.label ?? def.label);
                const cost =
                  said.cost ??
                  (act === "propose" && arg !== 1 // INTRIGUE (r15): asking for a hand is free
                    ? weddingCost(s, life)
                    : act === "gift"
                      ? Math.max(1, Math.round(arg ?? 5))
                      : null);
                return html`<button
                  class="cq-int ${hostile ? "rough" : ""} ${view.will
                    ? "lit"
                    : ""} ${view.check.ok ? "" : "has-why"}"
                  ?disabled=${!view.check.ok}
                  title=${view.check.ok ? def.text : `${view.check.why}`}
                  @click=${() =>
                    ui.modal(
                      act === "borrow" // ECON (r17): borrowing is on bond: its window
                        ? { k: "bond", c: c.id, side: "borrow" }
                        : { k: "interact", c: c.id, act, arg },
                    )}
                >
                  <span class="cq-int-label">${said.text}</span>
                  ${cost ? price(cost, { have: life.purse }) : nothing}
                  ${verdictChip(view)}
                  <span class="cq-act-why"
                    >${view.check.ok ? "" : view.check.why}</span
                  >
                </button>`;
              })}
          </div>`,
    )}
  </section>`;
}
