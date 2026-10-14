// DLC (r21): the pages of Conquest's store items.
// - Society › The war (a game that begins in 1776): where the war stands,
//   your side in it, a commission, spying, privateers, the war so far and
//   the places by their 1776 names.
// - Journal › Legends (a seat whose account owns Legends): the legends
//   you've heard of, each trail's next step, where it's worked, its odds
//   and its price, and what each was, once it's followed to its end.
// Every odds figure is worked out by the same functions the engine rolls by.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import {
  BEATS,
  beatsCome,
  britainOf,
  COMMISSION,
  commissionCheck,
  commissionOdds,
  isCampaign,
  kingOf,
  sideCheck,
  sideOf,
  SPY,
  spyCheck,
  spyOdds,
  TURNCOAT,
  usOf,
} from "../../engine/Campaign1776";
import {
  askCheck,
  askOdds,
  LEGEND_RULES,
  LEGENDS,
  legendsOn,
  progressOf,
  skillWord,
  stepOdds,
  stepProvinces,
  trailOdds,
  workCheck,
} from "../../engine/Legends";
import type { LegendDef, LegendOutcome } from "../../engine/LegendsData";
import { JOBS } from "../../engine/LifeRules";
import { chanceWords } from "../../engine/Odds";
import { PLACE_NAMES_1776 } from "../../engine/Start1776";
import { STORE_LEGENDS } from "../Dlc";
import { nationName } from "../Text";
import { num } from "../Tip";
import {
  action,
  breakdownTip,
  type GameUi,
  more,
  nationLink,
  provLink,
  section,
} from "./Context";
import { howTo, pageHead } from "./Nav";
import { price } from "./Price";
import { term, termMark } from "./Terms";

const pct = (p: number) => `${Math.round(p * 100)}%`;

/** "1 in 3", with the percentage when pointed at ("1 in 1,953" for a long shot). */
function chance(p: number): TemplateResult {
  const words = chanceWords(p).replace(/\d{4,}/g, (n) =>
    Number(n).toLocaleString("en-US"),
  );
  return html`<b title=${p < 0.01 ? "under 1%" : pct(p)}>${words}</b>`;
}

function provNamed(ui: GameUi, name: string): number {
  return ui.map.provinces.findIndex((p) => p.name === name);
}

/** A town on the map, with its name in 1776 where the map's is older ("Fort Christina (Philadelphia)"). */
function placeLink(ui: GameUi, p: number): TemplateResult {
  const then = isCampaign(ui.s)
    ? PLACE_NAMES_1776[ui.map.provinces[p]?.name ?? ""]
    : undefined;
  return html`<span class="cq-nowrap"
    >${provLink(ui, p)}${then ? html` (${then})` : nothing}</span
  >`;
}

// ---------------------------------------------------------------- Society › The war

const SIDE_WORDS: Record<string, string> = {
  patriot: "with the patriots",
  loyal: "with the King",
  neutral: "with neither side",
};

export function warPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  if (!isCampaign(s))
    return html`${pageHead(
      "The war",
      "The War of Independence, in a game that begins in 1776.",
    )}
    ${howTo(
      "This page follows the War of Independence in a game that begins in 1776 (1776: The Revolution, a campaign in the Derp Store). Its owner hosts the game; anyone can join it for free.",
      [],
    )}`;
  const us = usOf(s);
  const nation = s.nations[us];
  return html`${pageHead(
    "The war",
    "The War of Independence as it comes: where it stands, your side in it, and what you can do for it.",
  )}
  ${standsSection(ui)} ${sideSection(ui)}
  ${nation?.rebelling && sideOf(s, life) !== undefined
    ? html`${commissionSection(ui)} ${spySection(ui)}`
    : nothing}
  ${seaSection(ui)} ${yourPartSection(ui)} ${soFarSection(ui)}
  ${namesSection(ui)}`;
}

function standsSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const us = usOf(s);
  const king = kingOf(s);
  const br = britainOf(s);
  const nation = s.nations[us];
  const held = s.provinces.flatMap((pr, p) =>
    pr.occupier === king && pr.owner === us ? [p] : [],
  );
  const allies = s.nations
    .map((n, i) => ({ n, i }))
    .filter(
      ({ n, i }) =>
        n.alive &&
        n.kind === "power" &&
        i !== us &&
        i !== br &&
        s.wars.some(
          (w) => (w.a === i && w.b === br) || (w.b === i && w.a === br),
        ),
    );
  return section(
    "Where it stands",
    html`<p class="small">
        ${nation.independent
          ? html`${nationLink(ui, us)} has won its independence. The war is
            over.`
          : html`${nationLink(ui, us)} has been at war with the King since the
            fighting at Lexington and Concord (19 April 1775).
            ${nation.capital >= 0
              ? html`Congress sits at ${placeLink(ui, nation.capital)}.`
              : nothing}`}
      </p>
      ${held.length
        ? html`<p class="small">
            The King's army holds
            ${held.map((p, i) => html`${i ? ", " : ""}${placeLink(ui, p)}`)}.
          </p>`
        : nothing}
      ${allies.length
        ? html`<p class="small">
            At war with Britain as well:
            ${allies.map(
              ({ i }, k) => html`${k ? ", " : ""}${nationLink(ui, i)}`,
            )}.
          </p>`
        : nothing}
      <p class="cq-muted small">
        The war follows its history: its battles, its alliances and its peace
        come on their dates, and the armies of it move as they did. You live
        your part in it.
      </p>`,
  );
}

function sideSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me;
  const us = usOf(s);
  if (!me) return html``;
  if (me.nation !== us) {
    const br = britainOf(s);
    return section(
      "Your side",
      html`<p class="small">
        ${me.nation === br
          ? "You're of British America, which stayed with the King: enlist at a fort (Work › Find work) to serve him, or sail as a privateer from its ports."
          : s.nations[me.nation]?.kind === "native"
            ? "The war is the colonists' quarrel, and it comes to your people's country all the same: both sides court the nations, and their armies burn towns that took the other side."
            : `${nationName(s.nations[me.nation]?.name ?? "Your nation")} watches the war; its privateers and its armies may yet have a part in it.`}
      </p>`,
    );
  }
  const side = sideOf(s, life);
  const btn = (key: "patriot" | "loyal" | "neutral", label: string) =>
    action(
      label,
      sideCheck(s, life, key),
      () => void ui.cmd({ k: "r76", act: "side", arg: key }),
      `small ${key === "neutral" ? "quiet" : ""}`,
      undefined,
      false,
    );
  const ok = sideCheck(s, life, side === "patriot" ? "loyal" : "patriot");
  return section(
    "Your side",
    html`<p class="small">
        ${side
          ? html`You stand <b>${SIDE_WORDS[side]}</b>.`
          : "You haven't said where you stand."}
        ${(life.r76?.turned ?? 0) > 0
          ? html` You've changed sides
            ${life.r76!.turned === 1 ? "once" : `${life.r76!.turned} times`}.`
          : nothing}
      </p>
      ${s.nations[us].rebelling
        ? html`<div class="cq-btnrow">
              ${btn("patriot", "With the patriots")}
              ${btn("loyal", "With the King")} ${btn("neutral", "Neither")}
            </div>
            ${!ok.ok && side && side !== "neutral"
              ? html`<p class="cq-why small">${ok.why}</p>`
              : nothing}
            <p class="cq-muted small">
              Won: the patriots win renown; the King's friends lose a third of
              their purse, and some go to Nova Scotia or England. Going from one
              side to the other makes you a ${term("turncoat", "turncoat")}:
              renown ${TURNCOAT.renown}, and not again within a year.
            </p>`
        : nothing}`,
  );
}

function commissionSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const side = sideOf(s, life);
  if (side !== "patriot" && side !== "loyal") return html``;
  const job = life.job;
  const have =
    job?.kind === "soldier" && job.rank >= 3
      ? JOBS.soldier.ranks[job.rank]?.title
      : null;
  const check = commissionCheck(s, life);
  const { odds, rank } = commissionOdds(s, life);
  const by =
    side === "patriot" ? "the Continental Army" : "a Loyalist regiment";
  return section(
    "A commission",
    html`<p class="small">
        ${have
          ? html`You hold a commission: <b>${have}</b>${life.r76?.commission
                ? html`, given ${formatDate(life.r76.commission.day)}`
                : nothing}.`
          : html`A commission in ${by}, from
              ${side === "patriot"
                ? "Congress (where it sits) or the army's headquarters"
                : "the King's commander, in a town his army holds"}.
              They'd make you
              <b>${JOBS.soldier.ranks[rank]?.title.toLowerCase()}</b>
              (captain needs leadership ${COMMISSION.captain.leadership} and
              renown ${COMMISSION.captain.renown}). The odds:
              ${num(chance(odds.total), () =>
                breakdownTip("The odds of a commission", odds, pct),
              )}.`}
      </p>
      ${have
        ? nothing
        : html`<div class="cq-btnrow">
            ${action(
              html`Ask for a commission
              ${price(COMMISSION.cost, { have: life.purse })}`,
              check,
              () => void ui.cmd({ k: "r76", act: "commission" }),
              "small",
            )}
          </div>`}
      <p class="cq-muted small">
        The kit is paid only if they say yes. Ask once a season. A soldier's
        battles come as scenes, with their odds, wherever the army he serves
        with fights.
      </p>`,
  );
}

function spySection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const side = sideOf(s, life);
  if (side !== "patriot" && side !== "loyal") return html``;
  const o = spyOdds(s, life);
  const check = spyCheck(s, life);
  return section(
    "Spying",
    html`<p class="small">
        In a town the other side holds, count its regiments and its guns and get
        word out to ${side === "patriot" ? "the committee" : "the British"}
        (stealth). A report: ${chance(o.pass)}, paid
        ${price(SPY.pay[side], { gain: true })} and renown +${SPY.renown}.
        Taken: ${chance(o.caught)}, and then tried: hanged
        ${chance(SPY.hanged)}, or held in the provost's prison till you're
        exchanged. A bribe (${SPY.bribe} coins) or a bluff may get you away.
      </p>
      <div class="cq-btnrow">
        ${action(
          "Spy here",
          check,
          () => void ui.cmd({ k: "r76", act: "spy" }),
          "small",
        )}
      </div>
      <p class="cq-muted small">
        Once in ${SPY.rest} days. Nobody else sees your reports.
      </p>`,
  );
}

function seaSection(ui: GameUi): TemplateResult {
  return section(
    "Privateers",
    html`<p class="small">
        Congress and the states give letters of marque, and the King's colonies
        give theirs: a privateer takes the other side's merchantmen as prizes.
        Sign aboard one, or fit out your own, at a port at war.
      </p>
      <div class="cq-btnrow">
        <button
          class="cq-btn small quiet"
          @click=${() => ui.open({ k: "tab", tab: "work", sub: "sea" })}
        >
          Work › At sea
        </button>
      </div>`,
  );
}

function yourPartSection(ui: GameUi): TemplateResult | typeof nothing {
  const r = ui.life!.r76;
  const fought = (r?.fought ?? [])
    .map((k) => BEATS.find((b) => b.key === k)?.title)
    .filter(Boolean);
  if (!fought.length && !r?.reports && !r?.commission) return nothing;
  return section(
    "Your part",
    html`<ul class="cq-list small">
      ${fought.length ? html`<li>At ${fought.join(", ")}.</li>` : nothing}
      ${r?.reports
        ? html`<li>
            ${r.reports} report${r.reports === 1 ? "" : "s"} got out as a spy.
          </li>`
        : nothing}
      ${r?.commission
        ? html`<li>
            Commissioned
            ${JOBS.soldier.ranks[r.commission.rank]?.title.toLowerCase()} by
            ${r.commission.by === "congress"
              ? "Congress"
              : "the King's commander"},
            ${formatDate(r.commission.day)}.
          </li>`
        : nothing}
    </ul>`,
  );
}

function soFarSection(ui: GameUi): TemplateResult {
  const come = beatsCome(ui.s).slice().reverse();
  return section(
    "The war so far",
    come.length
      ? html`<ol class="cq-r76-beats">
          ${come.map(
            ({ beat, day }) =>
              html`<li>
                <span class="cq-r76-day">${formatDate(day)}</span>
                <b>${beat.title}</b>
                ${beat.at && provNamed(ui, beat.at) >= 0
                  ? html`<span class="cq-muted small"
                      >${placeLink(ui, provNamed(ui, beat.at))}</span
                    >`
                  : nothing}
                <p class="small">${beat.text}</p>
              </li>`,
          )}
        </ol>`
      : html`<p class="cq-muted small">The war's news will come here.</p>`,
  );
}

function namesSection(ui: GameUi): TemplateResult {
  const rows = Object.entries(PLACE_NAMES_1776)
    .map(([map, then]) => ({ p: provNamed(ui, map), then }))
    .filter((x) => x.p >= 0);
  return more(
    "The places of the war, by their names in 1776",
    html`<p class="cq-muted small">
        The map keeps its own names for the colonies' first towns. In 1776 they
        were called:
      </p>
      <table class="cq-table small">
        <tbody>
          ${rows.map(
            (x) =>
              html`<tr>
                <td>${provLink(ui, x.p)}</td>
                <td>${x.then}</td>
              </tr>`,
          )}
        </tbody>
      </table>`,
  );
}

// ---------------------------------------------------------------- Journal › Legends

/** What an ending brings, in words. */
function outcomeWords(def: LegendDef, o: LegendOutcome): string {
  const bits: string[] = [];
  if (o.keep)
    return "learned, and kept: renown, and later a call to speak for it";
  if (o.waters)
    return "something more than water, nobody can say what, and it lasts";
  if (o.coins) bits.push(`${o.coins[0]} to ${o.coins[1]} coins`);
  if (o.renown) bits.push(`renown +${o.renown}`);
  if (o.health) bits.push(`health ${o.health > 0 ? "+" : ""}${o.health}`);
  void def;
  return bits.join(", ") || "nothing much";
}

export function legendsPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const head = pageHead(
    html`Legends ${termMark("legend")}`,
    "Old stories worth following: the ones you've heard of, the next step of each trail, where it's worked and its odds.",
  );
  if (!legendsOn(life))
    return html`${head}
    ${howTo(
      html`Legends is in the <a href=${STORE_LEGENDS}>Derp Store</a>: the
        Fountain of Youth, the Seven Cities of Cíbola, the Lost Colony,
        Blackbeard's hoard, the native nations' sacred places and more, for the
        bold and the learned. Whoever owns it hears of them, in any game.`,
      [],
    )}`;
  const list = life.legends?.list ?? [];
  const R = LEGEND_RULES;
  const askOk = askCheck(s, ui.w, life);
  const live = list.filter(
    (x) => x.found === undefined && x.cold === undefined,
  );
  const done = list.filter(
    (x) => x.found !== undefined || x.cold !== undefined,
  );
  return html`${head}
  ${section(
    "Asking after old stories",
    html`<p class="small">
        Talk of a legend comes rarely on its own: ${chance(R.rumour)} a month
        (${chance(Math.min(1, R.rumour * R.region))} in its own country). At a
        tavern, the docks or a native town you can stand a round and ask:
        ${chance(askOdds(s, life))} you hear one worth following (persuasion).
      </p>
      <div class="cq-btnrow">
        ${action(
          html`Ask after old stories ${price(R.ask.cost, { have: life.purse })}`,
          askOk,
          () => void ui.cmd({ k: "legend", act: "ask" }),
          "small",
        )}
      </div>
      <p class="cq-muted small">
        A trail is clues that need a master's skill, each worked at its own
        place, then a journey to its end. Fail a step ${R.tries} times and it
        goes cold. Nobody else knows what you've heard.
      </p>`,
  )}
  ${live.length
    ? live.map((x) => trailCard(ui, x.key))
    : html`<p class="cq-empty">
        ${list.length
          ? "No trail open now."
          : "You haven't heard of any legends yet. Keep your ears open, or go asking."}
      </p>`}
  ${done.length
    ? section(
        "Followed and gone cold",
        html`${done.map((x) => doneCard(ui, x.key))}`,
      )
    : nothing}`;
}

function trailCard(ui: GameUi, key: string): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const i = LEGENDS.findIndex((d) => d.key === key);
  const def = LEGENDS[i];
  const x = progressOf(life, key);
  if (!def || !x) return html``;
  const step = def.steps[x.step];
  const odds = stepOdds(s, ui.w, life, def, x.step);
  const where = stepProvinces(s, ui.w, def, x.step);
  const check = workCheck(s, ui.w, life, key);
  const last = x.step === def.steps.length - 1;
  const R = LEGEND_RULES;
  return section(
    html`${def.name}${def.kind === "sacred"
      ? html` <span class="cq-dlc-tag"
          >${term("sacredplace", "a sacred place")}</span
        >`
      : nothing}`,
    html`<p class="cq-muted small">
        Heard ${formatDate(x.heard)} at ${x.from}. Step ${x.step + 1} of
        ${def.steps.length}; the whole trail from here, first time each step:
        ${chance(trailOdds(s, ui.w, life, def, x.step))}.
      </p>
      ${def.steps
        .slice(0, x.step)
        .map(
          (st) =>
            html`<p class="small cq-legend-done">
              <b>${st.title}.</b> ${st.found}
            </p>`,
        )}
      ${step
        ? html`<div class="cq-legend-step">
            <p class="small"><b>${step.title}.</b> ${step.doing}</p>
            <p class="small">
              Where:
              ${step.at.people && where.length > 6
                ? html`any town of their people
                  (${where
                    .slice(0, 4)
                    .map((p, k) => html`${k ? ", " : ""}${provLink(ui, p)}`)},
                  and others)`
                : where.length > 8
                  ? html`${where
                      .slice(0, 6)
                      .map((p, k) => html`${k ? ", " : ""}${provLink(ui, p)}`)}
                    and ${where.length - 6} other towns`
                  : where.map(
                      (p, k) => html`${k ? ", " : ""}${provLink(ui, p)}`,
                    )}${step.at.place && !(def.kind === "sacred" && last)
                ? `, at the ${step.at.place === "governor" ? "governor's house (its archives)" : step.at.place}`
                : ""}.
              ${skillWord(def, x.step)}
              ${odds.level}${odds.bonus ? ` +${odds.bonus} (their tongue)` : ""}
              against ${odds.dc}: ${chance(odds.chance)}.
              ${x.tries
                ? html`Failed ${x.tries} of ${R.tries} tries.`
                : nothing}
            </p>
            ${last
              ? html`<p class="small">
                  At its end:
                  ${def.outcomes.map(
                    (o, k) =>
                      html`${k ? "; " : ""}${chance(o.chance)}
                      ${outcomeWords(def, o)}`,
                  )}.${def.fever
                    ? html` The interior's fever: ${chance(def.fever.chance)}
                      (health −${def.fever.health}).`
                    : nothing}
                </p>`
              : nothing}
            <div class="cq-btnrow">
              ${action(
                html`${last ? "Set out" : "Try it"}
                ${step.cost ? price(step.cost, { have: life.purse }) : nothing}`,
                check,
                () => void ui.cmd({ k: "legend", act: "work", key }),
                "small",
              )}
              <button
                class="cq-btn small quiet"
                @click=${() =>
                  confirm(`Give up the trail of ${def.name}?`) &&
                  void ui.cmd({ k: "legend", act: "drop", key })}
              >
                Give it up
              </button>
            </div>
          </div>`
        : nothing}`,
  );
}

function doneCard(ui: GameUi, key: string): TemplateResult {
  const life = ui.life!;
  const def = LEGENDS.find((d) => d.key === key);
  const x = progressOf(life, key);
  if (!def || !x) return html``;
  const o = def.outcomes.find((y) => y.key === x.outcome);
  const kept = life.legends?.kept?.[key];
  return more(
    html`${def.name}:
    ${x.found !== undefined
      ? `followed to its end, ${formatDate(x.found)}`
      : `gone cold, ${formatDate(x.cold!)}`}`,
    html`${o ? html`<p class="small">${o.text}</p>` : nothing}
    ${kept !== undefined
      ? html`<p class="small">You spoke for it, and it was kept.</p>`
      : nothing}
    ${x.found !== undefined
      ? html`<p class="small cq-legend-truth">
          <b>What history knows of it.</b> ${def.truth}
        </p>`
      : nothing}`,
  );
}
