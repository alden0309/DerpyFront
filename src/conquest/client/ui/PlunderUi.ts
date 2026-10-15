// CQ24 (r24): on Journal › Legends, a sacred place's other road: dig it for
// what's buried there. Before the click: where, the price on the button, the
// odds of digging unseen (and what changes them), each find with its chance
// and what it comes to, the chance of being caught or of coming away with
// nothing, and what follows. Every figure comes from SacredPlunder.ts's own
// tables, the ones the dig rolls by (LEDGER r15's conventions).

import { html, nothing, type TemplateResult } from "lit";
import { dateOf, formatDate } from "../../engine/Calendar";
import { KEPT_FAITH } from "../../engine/Legends";
import type { LegendDef } from "../../engine/LegendsData";
import { SKILL_NAMES } from "../../engine/LifeRules";
import { chanceWords } from "../../engine/Odds";
import {
  placeName,
  PLUNDER,
  PLUNDER_FINDS,
  plunderCheck,
  plunderedMark,
  plunderOdds,
  RECKONING,
  sacredPeople,
  sacredProv,
} from "../../engine/SacredPlunder";
import type { LegendProgress } from "../../engine/Types";
import { nationName } from "../Text";
import { action, type GameUi, provLink } from "./Context";
import { price } from "./Price";

const pct = (p: number) => `${Math.round(p * 100)}%`;
const coinsWords = (lo: number, hi: number) =>
  hi <= 0 ? "nothing" : lo === hi ? `${lo} coins` : `${lo} to ${hi} coins`;

function people(ui: GameUi, def: LegendDef): string {
  const n = sacredPeople(ui.s, def);
  return nationName(ui.s.nations[n]?.name ?? "its people");
}

/** A place that's been dug: when, and by whom (everyone can see it). */
export function plunderedLine(
  ui: GameUi,
  def: LegendDef,
): TemplateResult | typeof nothing {
  const mark = plunderedMark(ui.s, def);
  if (!mark) return nothing;
  const me = ui.s.chars[ui.life?.c ?? -1];
  return html`<p class="small cq-plunder-mark">
    Dug for what was buried there in ${dateOf(mark.day).year},
    ${mark.by === me?.id ? "by you" : `by ${mark.name}`}. The cut is there
    still, and ${people(ui, def)} remember it.
  </p>`;
}

/** The dig: its odds, its price, what follows; and the button. */
export function plunderBox(ui: GameUi, def: LegendDef): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const o = plunderOdds(s, life, def);
  const check = plunderCheck(s, ui.w, life, def.key);
  const p = sacredProv(ui.w, def);
  const who = people(ui, def);
  const finds = o.finds.filter((f) => f.p > 0);
  const max = Math.max(0.0001, ...finds.map((f) => f.p), o.caught, o.empty);
  const row = (
    p: number,
    label: TemplateResult | string,
    amt: string,
    bad = false,
  ) =>
    html`<li class=${bad ? "bad" : ""}>
      <span class="cq-odds-chance" title=${pct(p)}>${chanceWords(p)}</span>
      <span class="cq-odds-what"
        >${label}
        <span class="cq-odds-bar"
          ><span style="width:${Math.round((p / max) * 100)}%"></span></span
      ></span>
      <span class="cq-odds-amt">${amt}</span>
    </li>`;
  const trusted =
    (ui.life?.legends?.list.find((x) => x.key === def.key)?.step ?? 0) > 0;
  return html`<div class="cq-legend-step cq-plunder">
    <p class="small">
      <b>Or dig it for what's buried there.</b> Old men in the taverns swear the
      place holds what its people buried long ago. Go by night with spades and a
      guide who'll take your money, and dig. Nobody would call it honest; plenty
      would call it bold.
    </p>
    <p class="small">
      Where: ${p >= 0 ? provLink(ui, p) : "the place itself"}.
      ${SKILL_NAMES[PLUNDER.skill]}
      ${o.level}${o.bonus ? ` +${o.bonus} (you know the place)` : ""} against
      ${o.dc}: <b title=${pct(o.pass)}>${chanceWords(o.pass)}</b> you dig unseen
      and find where to dig.
    </p>
    <div class="cq-odds-panel">
      <p class="cq-odds-head">
        <b>Digging at ${placeName(def)}</b
        ><span
          >Costs ${o.cost} coins; expected, all told:
          <b class="cq-odds-net ${o.expected >= 0 ? "good" : "bad"}"
            >${o.expected >= 0 ? "+" : "−"}${Math.abs(o.expected)}</b
          ></span
        >
      </p>
      <ul class="cq-odds-rows">
        ${finds.map((f) =>
          row(
            f.p,
            html`${f.find.relic
              ? html`<b>${f.find.relic}</b>, kept`
              : findLabel(f.find.key)}`,
            coinsWords(f.find.coins[0], f.find.coins[1]),
          ),
        )}
        ${row(
          o.empty,
          "Nothing found; away unseen (try again in a season)",
          "nothing",
          true,
        )}
        ${row(
          o.caught,
          `Caught at it: beaten and driven off (health −${PLUNDER.hurt}), never again`,
          "nothing",
          true,
        )}
      </ul>
      <ul class="cq-odds-risks">
        <li>
          Dug: the ${who} won't forget it. Their nation's opinion of yours
          ${PLUNDER.people.value + (trusted ? PLUNDER.faith.value : 0)} for
          ${PLUNDER.people.years} years (their allies ${PLUNDER.allies.value}):
          raids and war come likelier. Those of them who know you,
          ${PLUNDER.person.value +
          (trusted ? PLUNDER.faith.value : 0)}.${trusted
            ? html` They trusted you, and that's remembered too (renown
              ${PLUNDER.faith.renown}).`
            : nothing}
        </li>
        <li>
          At home the bold admire the daring and the devout think it shameful
          (renown +${PLUNDER.renown}). The place stays dug, and the world hears
          of it.
        </li>
        <li>
          In time their people come for what was taken: give it back, pay
          amends, talk them round (persuasion against ${RECKONING.talk.dc}),
          stand your ground (fighting against ${RECKONING.fight.dc}), or let
          them take it.
        </li>
        <li>
          Caught at it: their nation's opinion ${PLUNDER.tried.value} for
          ${PLUNDER.tried.years} years.
        </li>
      </ul>
    </div>
    <p class="cq-muted small">
      Keeping faith instead: renown, their nation's goodwill
      (+${KEPT_FAITH.value} for ${KEPT_FAITH.years} years, and more if you later
      speak for the place), and nothing on your conscience.
    </p>
    <div class="cq-btnrow">
      ${action(
        html`Dig at ${placeName(def)}
        ${price(PLUNDER.cost, { have: life.purse })}`,
        check,
        () => {
          if (
            confirm(
              `Dig at ${placeName(def)}? The ${who} will know, and won't forget.`,
            )
          )
            void ui.cmd({ k: "legend", act: "plunder", key: def.key });
        },
        "small",
      )}
    </div>
  </div>`;
}

/** A find's short name, for the odds. */
function findLabel(key: string): string {
  return (
    {
      gorgets: "Shell gorgets and copper beads",
      copper: "A cache of copper plates and shell beads",
      mica: "Cut mica and a copper axe",
      gold: "Gold in the creeks",
      dust: "A little gold dust",
      offerings: "The offerings left there: silver, a kettle, furs",
      little: "Little: sherds and broken things",
      nothing: "Nothing but earth",
    }[key] ?? key
  );
}

/** What you did there, for the trail's card once it's done. */
export function plunderDone(
  ui: GameUi,
  def: LegendDef,
  x: LegendProgress,
): TemplateResult | typeof nothing {
  if (x.caught !== undefined)
    return html`<p class="small">
      Caught digging at ${placeName(def)} on ${formatDate(x.caught)}, and driven
      off. The place is closed to you for good.
    </p>`;
  if (x.plundered === undefined) return nothing;
  const key = x.outcome?.replace(/^plunder:/, "") ?? "";
  const find = (PLUNDER_FINDS[def.key] ?? []).find((f) => f.key === key);
  const how: Record<string, string> = {
    returned: "When its people came for it, you gave it all back.",
    paid: "When its people came for it, you paid them amends.",
    talked: "When its people came for it, you talked them round.",
    fought: "When its people came for it, you sent them off.",
    lost: "When its people came for it, they took it.",
  };
  return html`<p class="small">
      You dug at ${placeName(def)} on ${formatDate(x.plundered)}.
      ${find?.text ?? ""} ${x.got ? `It came to ${x.got} coins.` : ""}
    </p>
    ${x.relic ? html`<p class="small">You still have ${x.relic}.</p>` : nothing}
    ${x.reckoned
      ? html`<p class="small">${how[x.reckoned]}</p>`
      : x.reckonDue !== undefined
        ? html`<p class="small cq-muted">
            Its people haven't come for what was taken. Yet.
          </p>`
        : nothing}`;
}
