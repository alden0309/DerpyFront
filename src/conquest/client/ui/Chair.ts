// CHAIR (r16): the road to the governor's chair on the page. Where you are
// on the road (Society › Standing): each step ticked with the day you
// reached it, the step you're on, and what would bring the chair nearer.
// The governor's chair as it stands: the governor and his health, his
// commission and its end, the lieutenant governor, a petition for his
// recall (with its odds before you begin, and its names and friends at
// court as it goes), the house's address (from the speaker's chair), and
// following the government when the capital falls. A governor's own
// commission on Society › Office; marks of greatness on Estate › House &
// land. Every figure comes from engine/ChairCore.ts and Grandeur.ts, the
// same reckonings the round rolls.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import {
  actingNow,
  ADDRESS,
  addressAnswerOdds,
  addressCheck,
  addressDivision,
  addressInForce,
  chairOf,
  courtCheck,
  crownColony,
  followCheck,
  followCost,
  grievancesOf,
  healthNote,
  infirmity,
  lieutenantOf,
  livesInColony,
  LT,
  NAME_WEIGHT,
  namesCheck,
  nearerWords,
  PETITION,
  petitionCheck,
  petitionPool,
  recallOdds,
  renewOdds,
  roadView,
  skillOdds,
  whereabouts,
  wouldSign,
} from "../../engine/ChairCore";
import { GREAT, greatCheck, greatHad } from "../../engine/Grandeur";
import { isPlayed, lifeIsNative } from "../../engine/LifeQueries";
import { chanceWords } from "../../engine/Odds";
import { charName } from "../../engine/Queries";
import type { Breakdown, Character, RecallPetition } from "../../engine/Types";
import { num } from "../Tip";
import {
  action,
  breakdownTip,
  charLink,
  GameUi,
  more,
  section,
} from "./Context";
import { price } from "./Price";
import { term } from "./Terms";

/** A share of a hundred, signed: "+12", "−8". */
const hundred = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.round(Math.abs(v) * 100)}`;
const fmtHundred = (v: number) => `${hundred(v)} in 100`;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const shortName = (name: string) => name.replace(/^the /, "");
/** The governor's pronouns (a player who governs may be a woman). */
const pro = (c: Character | undefined) =>
  c?.female
    ? { he: "she", He: "She", his: "her", His: "Her", him: "her" }
    : { he: "he", He: "He", his: "his", His: "His", him: "him" };

/** An odds chip for a skill check on a button: "62%". */
function oddsChip(p: number): TemplateResult {
  const v = Math.round(p * 100);
  return html`<span class="cq-odds ${v >= 65 ? "good" : v < 40 ? "bad" : ""}"
    >${v}%</span
  >`;
}

/** A chance as words, with the reckoning behind it on hover. */
function chanceTip(title: string, b: Breakdown, cls = ""): TemplateResult {
  return num(
    chanceWords(b.total),
    () => breakdownTip(title, b, fmtHundred, [`In all: ${pct(b.total)}.`]),
    `cq-chair-chance ${cls}`,
  );
}

// ---------------------------------------------------------------- the road

/** The road to the governor's chair, from where you stand (Society › Standing). */
export function roadList(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const steps = roadView(s, ui.w, life);
  const nearer = nearerWords(s, ui.w, life);
  return html`<ol class="cq-chair-road">
      ${steps.map(
        (x) =>
          html`<li
            class="${x.done ? "done" : ""} ${x.here ? "here" : ""} ${x.optional
              ? "optional"
              : ""}"
          >
            <span class="cq-chair-mark" aria-hidden="true"
              >${x.done ? "✓" : x.here ? "➤" : ""}</span
            >
            <div>
              <b>${x.title}</b>${x.optional
                ? html` <span class="cq-muted small">(may be passed by)</span>`
                : nothing}${x.done && x.day !== undefined
                ? html` <span class="cq-chip good">${formatDate(x.day)}</span>`
                : nothing}${x.here
                ? html` <span class="cq-chip gold">you are here</span>`
                : nothing}
              <p class="small">
                ${x.text}${x.pick
                  ? html` As things stand it would name you
                    ${chanceTip(
                      "Would the crown name you, or a man of its own?",
                      x.pick,
                    )}.`
                  : nothing}
              </p>
            </div>
          </li>`,
      )}
    </ol>
    ${nearer.length
      ? html`<p class="cq-h4">What would bring the chair nearer</p>
          <ul class="cq-where-list small">
            ${nearer.map((t) => html`<li>${t}</li>`)}
          </ul>`
      : nothing}`;
}

// ---------------------------------------------------------------- the chair as it stands

/** Address form: what the speaker would ask. */
const draft = { salary: true, supply: false };

/** The governor's chair as it stands, and what you can do about it (Society › Standing). */
export function chairSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const n = me.nation;
  const nation = s.nations[n];
  if (!crownColony(nation) || lifeIsNative(s, life)) return nothing;
  const ch = chairOf(s, n);
  const gov = s.chars[nation.ruler];
  if (!ch || !gov || nation.ruler === me.id) return followBlock(ui);
  const renew = renewOdds(s, n);
  const lt = lieutenantOf(s, n);
  const ill = infirmity(s, ui.w, gov, ch);
  const p = pro(gov);
  return section(
    html`The governor's chair`,
    html`<div class="cq-chair-gov">
        <p>
          ${charLink(ui, gov)} is ${healthNote(s, ui.w, gov, ch)}. ${p.His}
          ${term("commission", "commission")} runs to
          <b>${formatDate(ch.ends)}</b>${ch.terms > 1
            ? html` (${p.his} ${ch.terms === 2 ? "second" : `${ch.terms}th`}
              term)`
            : nothing};
          then the crown renews it
          ${chanceTip(`Would the crown renew ${p.his} commission?`, renew)}, as
          things stand, or names another.
        </p>
        <p>
          ${term("lieutenant", "Lieutenant governor")}:
          ${lt >= 0
            ? html`${charLink(ui, s.chars[lt])}${lt === me.id
                ? " (you)"
                : ""}${actingNow(s, n)
                ? html` <span class="cq-chip gold">acting for ${p.him}</span>`
                : nothing}`
            : html`<span class="cq-muted"
                >none.
                ${ill
                  ? `${p.He} is ${ill}: the crown will name one (a case of ${LT.bar} is offered it first).`
                  : "Named when the governor grows old or ill."}</span
              >`}
        </p>
        ${ch.lost
          ? html`<p class="small bad">
              Towns lost while ${p.he} governed: ${ch.lost}.
            </p>`
          : nothing}
      </div>
      ${petitionBlock(ui, gov)} ${addressBlock(ui, gov)} ${followBlock(ui)}`,
  );
}

/** The petition for his recall: begin it (odds first), or how it goes. */
function petitionBlock(ui: GameUi, gov: Character): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const n = me.nation;
  const ch = chairOf(s, n)!;
  const pet = ch.petition;
  const head = html`<p class="cq-h4">
    ${term("petition", `A petition for ${pro(gov).his} recall`)}
  </p>`;
  if (pet && pet.by !== me.id) {
    const by = s.chars[pet.by];
    const o = recallOdds(s, n, pet, pet.by);
    return html`${head}
      <p class="small">
        ${charLink(ui, by)} is getting up a petition to the crown for
        ${gov.first}'s recall: ${pet.names.length}
        name${pet.names.length === 1 ? "" : "s"} to
        it${pet.names.includes(me.id) ? " (yours among them)" : ""},
        ${pet.stage === "gathering"
          ? `sailing on ${formatDate(pet.sails)}`
          : "at sea"};
        the crown's answer about ${formatDate(pet.answer)}. As it stands it
        would land ${chanceTip(`Would the crown recall ${pro(gov).him}?`, o)}.
      </p>`;
  }
  if (pet) return html`${head}${myPetitionPanel(ui, gov, pet)}`;
  const check = petitionCheck(s, life);
  const o = recallOdds(s, n, null, me.id);
  const last = ch.lastPetition;
  return html`${head}
    ${last
      ? html`<p class="cq-muted small">
          The last, ${last.by === me.id ? "yours" : charName(s.chars[last.by])},
          ${last.won ? "won" : "was thrown out"} on ${formatDate(last.day)}.
        </p>`
      : nothing}
    ${oddsBlock(ui, gov, o, null)}
    <div class="cq-btnrow">
      ${action(
        html`Begin the
        petition${price(PETITION.fee, {
          have: life.purse,
        })}${price(PETITION.retainer, { per: "month" })}`,
        check,
        () => void ui.cmd({ k: "chair", act: "petition" }),
        "small primary",
      )}
    </div>`;
}

/** The odds of a petition, before you begin or as it stands. */
function oddsBlock(
  ui: GameUi,
  gov: Character,
  o: Breakdown,
  pet: RecallPetition | null,
): TemplateResult {
  const s = ui.s;
  const me = ui.me!;
  const n = me.nation;
  const p = o.total;
  const pool = petitionPool(s, n, me.id);
  const asked = new Set([...(pet?.names ?? []), ...(pet?.refused ?? [])]);
  const willing = pool.filter(
    (c) => !asked.has(c) && !isPlayed(s, c) && wouldSign(s, n, c),
  ).length;
  const players = pool.filter((c) => !asked.has(c) && isPlayed(s, c)).length;
  return html`<div class="cq-odds-panel cq-chair-odds">
    <p class="cq-odds-head">
      <b
        >${pet ? "As it stands" : "If you begin"}: the crown's answer
        ${pet
          ? `about ${formatDate(pet.answer)}`
          : `in about ${Math.round((PETITION.gather + PETITION.voyage) / 30)} months`}</b
      >
    </p>
    <ul class="cq-odds-rows">
      <li>
        <span class="cq-odds-chance" title=${pct(p)}>${chanceWords(p)}</span>
        <span class="cq-odds-what"
          >${gov.first} is recalled: the chair falls empty
          <span class="cq-odds-bar"
            ><span style="width:${Math.round(p * 100)}%"></span></span
        ></span>
        <span class="cq-odds-amt">renown +8, favour +5</span>
      </li>
      <li class="bad">
        <span class="cq-odds-chance" title=${pct(1 - p)}
          >${chanceWords(1 - p)}</span
        >
        <span class="cq-odds-what"
          >Thrown out: ${pro(gov).he}'s your enemy, and may put you off
          ${pro(gov).his} council
          <span class="cq-odds-bar"
            ><span style="width:${Math.round((1 - p) * 100)}%"></span></span
        ></span>
        <span class="cq-odds-amt">favour −6</span>
      </li>
    </ul>
    <details class="cq-more">
      <summary>What makes the chance (${pct(p)})</summary>
      <ul class="cq-odds-factors">
        ${o.parts.map(
          (x) => html`<li>${x.label}: <b>${hundred(x.value)}</b> in 100</li>`,
        )}
      </ul>
    </details>
    <p class="cq-muted small">
      Each councillor's name adds ${Math.round(NAME_WEIGHT.council * 100)} in
      100, a member's ${Math.round(NAME_WEIGHT.house * 100)}, a friend at court
      ${Math.round(NAME_WEIGHT.court * 100)}.
      ${willing
        ? `Of those not yet asked, ${willing} would likely sign`
        : "Nobody not yet asked looks likely to sign"}${players
        ? `; ${players} other player${players === 1 ? "" : "s"} would be asked`
        : ""}.
      It sails ${Math.round(PETITION.gather / 30)} months after it begins.
    </p>
  </div>`;
}

/** Your own petition as it goes. */
function myPetitionPanel(
  ui: GameUi,
  gov: Character,
  pet: RecallPetition,
): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const o = recallOdds(s, me.nation, pet, me.id);
  const names = namesCheck(s, life);
  const court = courtCheck(s, life);
  return html`<p class="small">
      Your petition
      ${pet.stage === "gathering"
        ? html`sails on <b>${formatDate(pet.sails)}</b>`
        : html`is at sea`}.
      Names to it:
      ${pet.names.length
        ? pet.names.map(
            (c, i) => html`${i ? ", " : ""}${charLink(ui, s.chars[c], false)}`,
          )
        : "none yet"}.
      Friends at court: ${pet.court} of
      ${PETITION.maxCourt}.${pet.defence
        ? html` <span class="bad"
            >${gov.first} has answered it (${hundred(-pet.defence)} in
            100).</span
          >`
        : nothing}
    </p>
    ${oddsBlock(ui, gov, o, pet)}
    <div class="cq-btnrow">
      ${pet.stage === "gathering"
        ? action(
            html`Ask the council and the house for
            names${oddsChip(skillOdds(s, life, "persuasion", PETITION.namesDc))}`,
            names,
            () => void ui.cmd({ k: "chair", act: "names" }),
            "small",
            "Persuasion: two names if it goes well, one if not (and word reaches the governor).",
          )
        : nothing}
      ${action(
        html`Write to friends at
        court${price(PETITION.postage, {
          have: life.purse,
        })}${oddsChip(skillOdds(s, life, "letters", PETITION.courtDc))}`,
        court,
        () => void ui.cmd({ k: "chair", act: "court" }),
        "small",
        "Letters: a friend who'll speak for it at the Board of Trade.",
      )}
      ${action(
        "Let it drop",
        { ok: true },
        () =>
          confirm("Let the petition drop? Your agent keeps his fee.") &&
          void ui.cmd({ k: "chair", act: "withdraw" }),
        "small quiet",
      )}
    </div>`;
}

/** The house's address against the governor. */
function addressBlock(
  ui: GameUi,
  gov: Character,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const n = me.nation;
  const ch = chairOf(s, n)!;
  const a = ch.address;
  const cab = s.power?.cabinets[n];
  const speaker = cab?.speaker === me.id;
  const inHouse = !!s.polities[n]?.assembly.includes(me.id);
  const head = html`<p class="cq-h4">
    ${term("address", "The house's address")}
  </p>`;
  const p = pro(gov);
  const asks = (salary: boolean, supply: boolean) =>
    [salary ? `${p.his} salary withheld` : "", supply ? "supply refused" : ""]
      .filter(Boolean)
      .join(" and ");
  if (a && a.stage === "moved")
    return html`${head}
      <p class="small">
        ${charLink(ui, s.chars[a.by], false)} has moved an address against
        ${gov.first} (${asks(a.salary, a.supply)}). The house divides on
        ${formatDate(a.divide)}.
      </p>`;
  const force = addressInForce(s, n);
  if (force)
    return html`${head}
      <p class="small">
        <span class="cq-chip bad">${asks(force.salary, force.supply)}</span>
        ${force.session
          ? "The house carried it in its session"
          : html`The house carried the address
            ${charLink(ui, s.chars[force.by], false)} moved, ${force.ayes} to
            ${force.noes}`};
        it stands until
        ${formatDate(force.until)}${force.answer === "hold"
          ? `: ${gov.first} holds out`
          : ""}.
      </p>`;
  if (!speaker)
    return inHouse
      ? html`${head}
          <p class="cq-muted small">
            The speaker moves an address against the governor from the chair:
            ${p.his} salary withheld, supply refused, or both.
          </p>`
      : nothing;
  const check = addressCheck(s, life, draft.salary, draft.supply);
  const div = addressDivision(
    s,
    n,
    me.id,
    draft.salary,
    draft.supply,
    Math.floor(s.day / 365),
  );
  const odds = addressAnswerOdds(s, n);
  const grief = grievancesOf(s, n);
  return html`${head}
    <p class="small">
      From the chair you can move the house's address against ${gov.first}.
      Carried, it stands a year, and the crown hears of it (a grievance against
      ${p.him}, weighed at ${p.his} term's end and on any petition).
    </p>
    <div class="cq-seg" role="group" aria-label="What the address asks">
      <button
        aria-pressed=${draft.salary}
        @click=${() => {
          draft.salary = !draft.salary;
          ui.redraw();
        }}
      >
        Withhold ${p.his} salary<span>${p.he} goes unpaid</span>
      </button>
      <button
        aria-pressed=${draft.supply}
        @click=${() => {
          draft.supply = !draft.supply;
          ui.redraw();
        }}
      >
        Refuse supply<span
          >revenue ${hundred(ADDRESS.supply.tax)} in 100, the militia unpaid,
          London blames ${p.him}</span
        >
      </button>
    </div>
    <p class="small">
      As the house stands it would divide
      ${num(
        `${div.ayes} to ${div.noes}`,
        () =>
          breakdownTip(
            `What the house holds against ${p.him}`,
            grief,
            undefined,
            [
              "Country members lean for it, court members against; your own weight in the house brings a few over, never more than a member's party. Refusing supply hurts the colony too, and loses a few.",
            ],
          ),
        `cq-opinion ${div.ayes > div.noes ? "good" : "bad"}`,
      )}${div.abstain ? ` (${div.abstain} to decide for themselves)` : ""}.
      Carried, ${gov.first} would give way ${chanceWords(odds.yield)}, dissolve
      the house ${chanceWords(odds.dissolve)}, or hold out
      ${chanceWords(odds.hold)}${odds.why.length
        ? html` <span class="cq-muted">(${odds.why.join("; ")})</span>`
        : nothing}.
    </p>
    <div class="cq-btnrow">
      ${action(
        "Move the address",
        check,
        () =>
          void ui.cmd({
            k: "chair",
            act: "address",
            salary: draft.salary,
            supply: draft.supply,
          }),
        "small primary",
      )}
    </div>`;
}

/** Follow the government (when your home is no longer in the colony). */
function followBlock(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const nation = s.nations[me.nation];
  if (!nation || nation.capital < 0) return nothing;
  const following = life.chair?.follow !== undefined;
  if (livesInColony(s, life) && !following) return nothing;
  const capital = ui.map.provinces[nation.capital]?.name ?? "the capital";
  const out = life.chair?.outside;
  return html`<p class="cq-h4">The seat of government</p>
    <p class="small">
      ${following
        ? html`You're on your way to ${capital} with the household's goods.`
        : html`Your home is outside ${shortName(nation.name)}
          now.${out !== undefined
            ? html` <span class="bad"
                >Your seats lapse on ${formatDate(out + 90)} unless your
                household lives in the colony again.</span
              >`
            : nothing}
          The government sits at ${capital}.`}
    </p>
    ${following
      ? nothing
      : html`<div class="cq-btnrow">
          ${action(
            html`Follow the government to
            ${capital}${price(followCost(s, life), { have: life.purse })}`,
            followCheck(s, life),
            () => void ui.cmd({ k: "chair", act: "follow" }),
            "small primary",
            "You travel there, and your household moves in when you arrive.",
          )}
        </div>`}`;
}

// ---------------------------------------------------------------- a governor's own commission

/** Your commission, and what's moving against you (Society › Office, for a governor). */
export function commissionBlock(
  ui: GameUi,
  n: number,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const ch = chairOf(s, n);
  if (!ch) return nothing;
  const renew = renewOdds(s, n);
  const lt = lieutenantOf(s, n);
  const pet = ch.petition;
  const force = addressInForce(s, n);
  const months = Math.max(0, Math.round((ch.ends - s.day) / 30.4));
  return html`<div class="cq-chair-mine">
    <p>
      Your ${term("commission", "commission")} runs to
      <b>${formatDate(ch.ends)}</b>
      (${months}
      month${months === 1 ? "" : "s"}${ch.terms > 1
        ? `; your ${ch.terms === 2 ? "second" : `${ch.terms}th`} term`
        : ""}).
      As things stand the crown would renew it
      ${chanceTip("Would the crown renew your commission?", renew)}.
      ${ch.grievances
        ? html`<span class="bad"
            >Grievances heard against you: ${ch.grievances}.</span
          >`
        : nothing}
    </p>
    <p class="small">
      ${term("lieutenant", "Lieutenant governor")}:
      ${lt >= 0
        ? html`${charLink(ui, s.chars[lt], false)}${actingNow(s, n)
            ? " (acting in your absence)"
            : ""}`
        : html`<span class="cq-muted"
            >none (the crown names one when you grow old or ill)</span
          >`}
    </p>
    ${pet
      ? html`<p class="small bad">
          ${charLink(ui, s.chars[pet.by], false)} is getting up a petition for
          your recall (${pet.names.length} names; the answer about
          ${formatDate(pet.answer)}): as it stands it would land
          ${chanceTip(
            "Would the crown recall you?",
            recallOdds(s, n, pet, pet.by),
            "bad",
          )}.
        </p>`
      : nothing}
    ${force
      ? html`<p class="small bad">
          The house's address stands against you until
          ${formatDate(force.until)}:
          ${[
            force.salary ? "your salary withheld" : "",
            force.supply ? "supply refused" : "",
          ]
            .filter(Boolean)
            .join(" and ")}.
        </p>`
      : nothing}
    <p class="cq-muted small">
      A governor's money has things to buy: marks of greatness (Estate › House &
      land).
    </p>
  </div>`;
}

// ---------------------------------------------------------------- the council page's head

/** The lieutenant governor and supply, for the council chamber's head. */
export function chamberChips(
  ui: GameUi,
  n: number,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const lt = lieutenantOf(s, n);
  const force = addressInForce(s, n);
  if (lt < 0 && !force?.supply) return nothing;
  return html`${lt >= 0
    ? html` · lieutenant governor
      ${charLink(ui, s.chars[lt], false)}${actingNow(s, n) ? " (acting)" : ""}`
    : nothing}${force?.supply
    ? html` · <span class="cq-chip bad">supply refused</span>`
    : nothing}`;
}

// ---------------------------------------------------------------- the appointer

/** Where whoever gives an office is, and how far (the county's offices page). */
export function appointerWhere(ui: GameUi, by: Character): TemplateResult {
  const where = whereabouts(ui.s, ui.w, ui.life!, by.id);
  if (!where) return html``;
  return html`<p class="cq-muted small cq-chair-where">
    ${by.first} ${by.family} is
    ${where.text}.${where.days !== 0
      ? html` Ask in person there, or petition ${by.female ? "her" : "him"} by
        letter from here.`
      : nothing}
  </p>`;
}

// ---------------------------------------------------------------- marks of greatness

const GROUPS: [string, string][] = [
  ["house", "A house and a coach"],
  ["portrait", "Portraits"],
  ["endowment", "Endowments in your name"],
];

/** Marks of greatness (Estate › House & land). */
export function greatSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  if (lifeIsNative(s, life)) return nothing;
  const got = life.chair?.great ?? {};
  const governs = s.nations.some((x) => x.alive && x.ruler === life.c);
  return more(
    html`Marks of
    greatness${Object.keys(got).length
      ? html` <span class="cq-chip good">${Object.keys(got).length}</span>`
      : nothing}`,
    html`<p class="cq-muted small">
        What ${governs ? "a governor" : "anyone with money and a name"} can buy
        to be remembered by. Each is a line in the story of your life; some cost
        a little a month to keep. (Gifts to the town, and public works such as
        an almshouse, a church or a college, are at the church and the
        governor's house.)
      </p>
      ${GROUPS.map(
        ([kind, title]) =>
          html`<p class="cq-h4">${title}</p>
            <ul class="cq-chair-great">
              ${GREAT.filter((d) => d.kind === kind).map((d) => {
                const check = greatCheck(s, ui.w, life, d.key);
                const has = greatHad(s, life, d.key);
                const cost = d.cost(s, life);
                return html`<li class=${has ? "has" : ""}>
                  <div>
                    <b>${d.name(s, ui.w, life)}</b>
                    ${has
                      ? html`<span class="cq-chip good"
                          >yours since ${formatDate(got[d.key])}</span
                        >`
                      : nothing}
                    <p class="small">${d.text} ${d.does}</p>
                    <p class="cq-muted small">
                      Renown
                      +${d.renown}${d.favor
                        ? `, favour at home +${d.favor}`
                        : ""}${d.glow
                        ? ", and a little more each month it stands"
                        : ""}.
                    </p>
                  </div>
                  ${has
                    ? nothing
                    : action(
                        html`${d.kind === "portrait"
                          ? "Sit for it"
                          : d.kind === "endowment"
                            ? "Endow it"
                            : d.key === "coach"
                              ? "Set it up"
                              : "Build it"}${price(cost, {
                          have: life.purse,
                        })}${d.upkeep
                          ? price(d.upkeep, { per: "month" })
                          : nothing}`,
                        check,
                        () =>
                          void ui.cmd({ k: "chair", act: "great", key: d.key }),
                        "small",
                      )}
                </li>`;
              })}
            </ul>`,
      )}`,
  );
}
