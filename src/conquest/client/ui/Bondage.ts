// LABOUR (r15): Estate › Bondage. Those a household holds in bondage (and
// servants bound by indenture), as people: their names and families, their
// health and how they bear it, their skills and their work, what they think
// of you, and their chance of flight; how the household keeps them (a few
// plain choices, each with its consequences); the risks, with their odds;
// the law where they live, and its history; freedom, with what the law asks
// on the button; and the sales at the docks where people were sold.
//
// Everything shown is reckoned from the engine's own model (BondCore.ts), the
// same the month is rolled from.

import { html, nothing, TemplateResult } from "lit";
import {
  bondFullName,
  bondName,
  bondRisks,
  boundOf,
  buyCheck,
  cropAt,
  CROPS,
  familyAway,
  familyOf,
  fieldsOdds,
  fieldsOf,
  flightChance,
  FOOD_COST,
  FOOD_NAMES,
  freeCheck,
  freeCost,
  healthTarget,
  healthWord,
  hiredOf,
  hireTown,
  homeFor,
  householdKeep,
  HOUSING_COST,
  HOUSING_NAMES,
  isBound,
  isHeld,
  leftBehind,
  moodTarget,
  moodWord,
  ORIGIN_NAMES,
  PUNISH_NAMES,
  saleAt,
  saleFamily,
  selfPrice,
  sellCheck,
  sellWorth,
  willCheck,
  WORK_NAMES,
  yearly,
  type SaleLot,
} from "../../engine/BondCore";
import {
  bondLaw,
  COLONY_NAMES,
  historyOf,
  REFUGE_NAMES,
  saleChance,
} from "../../engine/BondLaw";
import { dateOf, formatDate } from "../../engine/Calendar";
import { lifeIsNative, opinionOf } from "../../engine/LifeQueries";
import { chanceWords } from "../../engine/Odds";
import { ageOf } from "../../engine/Queries";
import type { BondPolicy, BondWork, Character } from "../../engine/Types";
import { num } from "../Tip";
import {
  action,
  bar,
  breakdownTip,
  GameUi,
  more,
  section,
  token,
} from "./Context";
import { pageHead } from "./Nav";
import { oddsPanel } from "./Odds";
import { coins, price } from "./Price";
import { term, TERMS } from "./Terms";
// LABOUR2 (r21): an overseer, those at your businesses, a house in the trade.
import {
  bizPicker,
  bizWorkSection,
  overseerSection,
  tradeSection,
} from "./Labour2Ui";

// ---------------------------------------------------------------- words explained

Object.assign(TERMS, {
  bondage: {
    name: "Held in bondage",
    what: "Enslaved: held for life as another's property, with any children born to an enslaved woman held as she was. Lawful only where and when a colony's law allowed it.",
    good: "The household's fields and house are worked for no wage; but those held are people, with families and their own will, and every cruelty is paid for in flight, risings, sickness and death.",
    raise:
      "Estate › Bondage shows the law where you live, the people your household holds, how they're kept, the risks, and the ways to freedom.",
    ch: "bondage",
  },
  indenture: {
    name: "Indenture",
    what: "A contract binding a servant to work for a master for a term of years (four to seven, often) in return for the passage over, board and keep, and freedom dues at the end.",
    good: "Cheap labour for a few years; the servant goes free at the end, with clothes, tools and corn.",
    raise:
      "Servants' indentures are sold at the docks of English ports (and engagés' in New France until the 1730s). A servant who runs away serves the time twice over, and more.",
    ch: "bondage",
  },
  manumission: {
    name: "Manumission",
    what: "Freeing someone held in bondage, by a deed, by a will, or by letting them buy their freedom, as the colony's law allows.",
    good: "They are free people from then on, in the world: they can be hired and have their own lives.",
    raise:
      "Each colony set its own hurdles: fees, security that the freed won't come on the town, a petition to the governor and council, leaving the colony, or (Maryland from 1752) no freeing by will at all.",
    ch: "bondage",
  },
  tasksystem: {
    name: "The task system",
    what: "A day's set task, and the rest of the day the worker's own: the way rice was grown in the Lowcountry.",
    good: "Better spirits and health than gangs, and time to grow and sell their own, toward buying their freedom.",
    raise: "Estate › Bondage, How the household is kept.",
    ch: "bondage",
  },
  maroons: {
    name: "Maroons",
    what: "Communities of those who fled slavery and lived free in swamps, mountains and forests: the Great Dismal Swamp, Jamaica's Blue Mountains and Cockpit Country.",
    good: "A refuge for freedom seekers. Jamaica's Leeward Maroons won a treaty in 1739.",
    raise: "Where refuges are near, more flee, and more get clear.",
    ch: "bondage",
  },
});

// ---------------------------------------------------------------- the page

export function bondagePage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const head = pageHead(
    "Those held in bondage",
    html`Enslaved people your household holds, and servants bound by
    ${term("indenture", "indenture")}: who they are, how they're kept, the
    risks, and freedom. Holding anyone in bondage was lawful only where and when
    the law allowed it.`,
  );
  if (lifeIsNative(s, life))
    return html`${head}
      <p class="cq-empty">
        Your people's ways have nothing to do with the colonists' trade in
        people. The history of it, and of the Native captives Carolina's traders
        sold, is in How to Play (Bondage in the colonies).
      </p>
      ${lawSection(ui, life.home, "Where you live")}`;
  const people = boundOf(s, life);
  const fled = (life.bondage?.people ?? [])
    .map((id) => s.chars[id])
    .filter((c): c is Character => !!c?.alive && c.bond?.status === "fled");
  return html`${head}
  ${people.length
    ? html`${householdSection(ui, people, fled)} ${keepingSection(ui)}
      ${risksSection(ui)} ${workSection(ui)}
      ${overseerSection(ui) /* LABOUR2 (r21) */} ${bizWorkSection(ui)}`
    : html`<p class="cq-empty">
        Your household holds no one in bondage, and has no servants under
        indenture.${fled.length ? " Some who fled are still out." : ""}
      </p>`}
  ${docksSection(ui)}
  ${tradeSection(ui) /* LABOUR2 (r21): a house in the trade */}
  ${freedomSection(ui)}
  ${lawSection(
    ui,
    homeFor(life),
    life.bondage ? "Where your household lives" : "Where you live",
  )}
  ${recordSection(ui)}`;
}

// ---------------------------------------------------------------- the household

function householdSection(
  ui: GameUi,
  people: Character[],
  fled: Character[],
): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const keep = householdKeep(s, life);
  return section(
    html`Your household
      <span class="cq-muted small"
        >${people.length} ${people.length === 1 ? "person" : "people"} ·
        ${coins(keep)} a month to keep</span
      >`,
    html`<ul class="cq-bond-list">
        ${people.map((c) => personCard(ui, c))}
      </ul>
      ${fled.length
        ? html`<p class="small cq-bond-fled">
            <b>Gone:</b>
            ${fled.map(
              (c, i) =>
                html`${i ? ", " : ""}${bondName(c)} (fled
                ${formatDate(c.bond!.fled!.day)}, making for
                ${REFUGE_NAMES[c.bond!.fled!.to].split(",")[0]})`,
            )}.
            Nothing is known yet.
          </p>`
        : nothing}`,
  );
}

function relWord(c: Character, f: Character): string {
  if (c.spouse === f.id) return f.female ? "wife" : "husband";
  if (c.mother === f.id) return "mother";
  if (c.father === f.id) return "father";
  if (c.children.includes(f.id)) return f.female ? "daughter" : "son";
  return "kin";
}

function familyLine(ui: GameUi, c: Character): TemplateResult | typeof nothing {
  const s = ui.s;
  const fam = familyOf(s, c);
  if (!fam.length) return nothing;
  const away = new Set(familyAway(s, c).map((x) => x.id));
  return html`<span class="cq-bond-family">
    ${fam.map((f, i) => {
      const where = away.has(f.id)
        ? f.bond?.status === "free"
          ? ` (free, at ${ui.map.provinces[f.home ?? -1]?.name ?? "elsewhere"})`
          : ` (at ${ui.map.provinces[f.bond?.at ?? f.home ?? -1]?.name ?? "another estate"})`
        : "";
      return html`${i ? "; " : ""}${relWord(c, f)}
        <b>${bondName(f)}</b>${where}`;
    })}
  </span>`;
}

const WORKS: BondWork[] = ["fields", "house", "craft", "rest"];
const WORK_SHORT: Record<BondWork, string> = {
  fields: "Fields",
  house: "House",
  craft: "A trade",
  rest: "None",
  biz: "A business", // LABOUR2 (r21)
};

function personCard(ui: GameUi, c: Character): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const map = ui.map;
  const m = c.bond!;
  const age = ageOf(s, c);
  const held = m.status === "held";
  const op = life.c >= 0 ? opinionOf(s, c, life) : null;
  const flight = yearly(flightChance(s, map, life, c).total);
  const months = m.until ? Math.max(0, Math.round((m.until - s.day) / 30)) : 0;
  const grieving = (m.grief ?? 0) > s.day;
  const fc = freeCost(s, map, life);
  const freeOk = freeCheck(s, map, life, c);
  const petition = fc.rule.kind === "petition" && held;
  const will = willCheck(s, map, life, c);
  const alone = sellCheck(s, map, life, c, false);
  const family = saleFamily(s, life, c);
  const withFam = sellCheck(s, map, life, c, true);
  const worth = sellWorth(s, map, life, [c]);
  const famWorth = sellWorth(s, map, life, family);
  const parts = leftBehind(s, life, [c]).length > 0;
  const save = m.saved ?? 0;
  const own = held ? selfPrice(s, map, life, c) : 0;
  const hearKey = `bond:hear:${c.id}`;
  const hearLeft = Math.max(0, (life.cooldowns[hearKey] ?? 0) - s.day);
  return html`<li class="cq-bond-card ${grieving ? "grief" : ""}">
    <div class="cq-bond-top">
      ${token(ui, c, "small")}
      <div class="cq-bond-who">
        <b class="cq-bond-name">${bondFullName(c)}</b>
        <span class="cq-muted small"
          >${age},
          ${c.female ? "a woman" : "a man"}${age < 16
            ? c.female
              ? " (a girl)"
              : " (a boy)"
            : ""};
          ${ORIGIN_NAMES[m.origin]}${m.faith === "islam"
            ? "; a Muslim"
            : m.faith === "christian"
              ? "; a Christian"
              : ""}${(m.lit ?? 0) >= 2
            ? "; reads and writes"
            : m.lit
              ? "; reads"
              : ""}</span
        >
        <span class="small"
          >${held
            ? html`Held for life${m.merit ? html`; <i>${m.merit}</i>` : nothing}`
            : html`Under ${term("indenture", "indenture")}: ${months} months to
              serve`}${m.will
            ? html` · <b class="good">freed in your will</b>`
            : nothing}${grieving
            ? html` · <b class="bad">grieving</b>`
            : nothing}</span
        >
        ${familyLine(ui, c)}
      </div>
    </div>
    <div class="cq-bond-gauges">
      <span class="cq-bond-gauge"
        ><span class="cq-muted small">Health</span> ${num(
          html`${bar(m.health / 100)}<span class="small"
              >${healthWord(m.health)}</span
            >`,
          () =>
            breakdownTip(
              `What ${c.first}'s health tends to`,
              healthTarget(s, map, life, c),
            ),
        )}</span
      >
      <span class="cq-bond-gauge"
        ><span class="cq-muted small">How they bear it</span> ${num(
          html`${bar(m.mood / 100)}<span class="small"
              >${moodWord(m.mood)}</span
            >`,
          () =>
            breakdownTip(
              `What ${c.first}'s spirits tend to`,
              moodTarget(s, map, life, c),
              undefined,
              ["Spirits drift a fifth of the way to this each month."],
            ),
        )}</span
      >
      <span class="cq-bond-gauge"
        ><span class="cq-muted small">Of you</span> ${op
          ? num(
              `${op.total > 0 ? "+" : ""}${op.total}`,
              () => breakdownTip(`What ${c.first} thinks of you`, op),
              `cq-bond-op ${op.total >= 20 ? "good" : op.total <= -20 ? "bad" : ""}`,
            )
          : nothing}</span
      >
      <span class="cq-bond-gauge"
        ><span class="cq-muted small">Flight, a year</span>
        <b
          class=${flight >= 0.1 ? "bad" : ""}
          title=${`${Math.round(flight * 1000) / 10}%`}
          >${age < 12 ? "a child" : chanceWords(flight)}</b
        ></span
      >
    </div>
    <p class="small cq-bond-skills">
      Fieldwork ${m.sk.field} · Housework ${m.sk.house} · A trade ${m.sk.craft}
      ${held && save > 0
        ? html` · has saved ${coins(save)} of ${coins(own)} toward
          ${c.female ? "her" : "his"} freedom`
        : nothing}
    </p>
    <div class="cq-bond-work">
      <span class="cq-muted small">Set to</span>
      <span
        class="cq-seg small"
        role="radiogroup"
        aria-label=${`${c.first}'s work`}
      >
        ${WORKS.map(
          (w) =>
            html`<button
              role="radio"
              aria-checked=${m.work === w}
              ?disabled=${w !== "rest" && age < 12}
              title=${w === "craft" && !hireTown(s, life)
                ? "Hired out only in a town of 600 or more"
                : WORK_NAMES[w]}
              @click=${() =>
                void ui.cmd({ k: "bond", act: "work", c: c.id, kind: w })}
            >
              ${WORK_SHORT[w]}
            </button>`,
        )}
      </span>
      ${bizPicker(ui, c) /* LABOUR2 (r21): at a business of yours */}
    </div>
    <div class="cq-btnrow cq-bond-acts">
      ${action(
        hearLeft
          ? html`Hear ${c.first} <span class="cq-muted">(${hearLeft}d)</span>`
          : html`Hear ${c.first} out`,
        hearLeft
          ? { ok: false, why: `Again in ${hearLeft} days.` }
          : { ok: true },
        () => void ui.cmd({ k: "bond", act: "hear", c: c.id }),
        "small",
        "What's on their mind: their home, their family, their faith, a request",
        false,
      )}
      ${held
        ? action(
            html`${petition ? "Petition to free" : "Free"}
            ${c.first}${price(fc.fee + fc.passage, { have: life.purse })}`,
            freeOk,
            () => {
              if (confirm(freeWords(ui, c)))
                void ui.cmd({ k: "bond", act: "free", c: c.id });
            },
            "small",
            fc.rule.text,
          )
        : action(
            html`Release from the indenture`,
            freeOk,
            () => void ui.cmd({ k: "bond", act: "free", c: c.id }),
            "small",
            "Free now, with the rest of the term forgiven",
          )}
      ${held && save >= own && own > 0
        ? action(
            html`Let ${c.first} buy ${c.female ? "her" : "his"}
            freedom${price(own, { gain: true })}`,
            freeOk,
            () => void ui.cmd({ k: "bond", act: "purchase", c: c.id }),
            "small",
          )
        : nothing}
      ${held
        ? action(
            m.will ? "Strike from your will" : "Free in your will",
            will,
            () => void ui.cmd({ k: "bond", act: "will", c: c.id }),
            "small ghost",
            m.will ? undefined : "Freed at your death, as the law then allows",
          )
        : nothing}
    </div>
    ${held
      ? more(
          html`<span class="small">Sell…</span>`,
          html`<p class="small cq-muted">
              A sale goes through a dealer, at ${Math.round(0.7 * 100)}% of what
              they'd fetch.
              ${parts
                ? "Sold alone, they'd be parted from their family here: those left behind grieve for a year, and the whole household fears it could be them."
                : "Everyone in the household knows it could be them."}
            </p>
            <div class="cq-btnrow">
              ${action(
                html`Sell
                ${c.first}${parts ? " alone" : ""}${price(worth, {
                  gain: true,
                })}`,
                alone,
                () => void ui.cmd({ k: "bond", act: "sell", c: c.id }),
                "small ghost",
              )}
              ${family.length > 1
                ? action(
                    html`Sell with the family
                    (${family.length})${price(famWorth, { gain: true })}`,
                    withFam,
                    () =>
                      void ui.cmd({
                        k: "bond",
                        act: "sell",
                        c: c.id,
                        key: "all",
                      }),
                    "small ghost",
                  )
                : nothing}
            </div>`,
        )
      : nothing}
  </li>`;
}

/** The confirm() before freeing someone: what the law asks. */
function freeWords(ui: GameUi, c: Character): string {
  const life = ui.life!;
  const fc = freeCost(ui.s, ui.map, life);
  const r = fc.rule;
  const parts = [
    r.kind === "petition"
      ? `Petition ${r.petition!.who} to free ${bondName(c)}: ${fc.fee} coins in fees. They grant about ${chanceWords(Math.min(0.9, c.bond?.merit ? r.petition!.odds + 0.5 : r.petition!.odds))}${c.bond?.merit ? " (for a meritorious service)" : ""}; the answer comes in about ${Math.round(r.petition!.days / 30)} months.`
      : `Free ${bondName(c)}: ${fc.fee} coins in fees.`,
  ];
  if (fc.passage)
    parts.push(
      `Under ${r.law} the freed must leave the colony within ${r.leave} months: ${fc.passage} coins for the passage.${leftBehind(ui.s, life, [c]).length ? " Their family here would stay behind." : ""}`,
    );
  if (fc.security)
    parts.push(
      `You stand bond for ${fc.security} coins (not paid unless the town ever calls on it).`,
    );
  if (fc.allowance)
    parts.push(
      `The law has you pay them ${fc.allowance} coins a year for life.`,
    );
  return parts.join("\n\n");
}

// ---------------------------------------------------------------- how they're kept

interface PolicyRow {
  key: keyof BondPolicy;
  title: string;
  note: string;
  options: {
    v: number;
    label: string;
    tip: string;
    cost?: number;
    why?: string;
  }[];
}

function policyRows(ui: GameUi): PolicyRow[] {
  const s = ui.s;
  const life = ui.life!;
  const law = bondLaw(s, ui.map, life.bondage!.home);
  const crop = CROPS[cropAt(s, ui.map, life.bondage!.home)].name;
  return [
    {
      key: "food",
      title: "Provisions and clothes",
      note: "Ill-fed people sicken, die younger and work less; and they know who feeds them so.",
      options: [0, 1, 2].map((v) => ({
        v,
        label: FOOD_NAMES[v],
        tip: [
          "Health −16, spirits −12",
          "As is customary",
          "Health +10, spirits +8",
        ][v],
        cost: FOOD_COST[v],
      })),
    },
    {
      key: "housing",
      title: "Quarters",
      note: "Rough cabins breed fevers.",
      options: [0, 1, 2].map((v) => ({
        v,
        label: HOUSING_NAMES[v],
        tip: [
          "Health −10, spirits −8",
          "As is customary",
          "Health +7, spirits +6",
        ][v],
        cost: HOUSING_COST[v],
      })),
    },
    {
      key: "regime",
      title: "The work",
      note: `Gangs under a driver get a little more from the day (${crop}), and wear people down for it; the task system leaves time of their own.`,
      options: [
        {
          v: 0,
          label: "Gangs under a driver",
          tip: "Work ×1.08; spirits −6, health −5",
        },
        {
          v: 1,
          label: "The task system",
          tip: "Spirits +8, health +2; they save toward their freedom",
        },
      ],
    },
    {
      key: "punish",
      title: "Punishment",
      note: "Harshness buys no work at all: it breeds fear, hatred, flight and risings.",
      options: [0, 1, 2].map((v) => ({
        v,
        label: PUNISH_NAMES[v],
        tip: [
          "Spirits +6",
          "Spirits −4",
          "Spirits −16, health −8, the household fears every return",
        ][v],
      })),
    },
    {
      key: "families",
      title: "Families",
      note: law.apart
        ? "Whether the household ever sells a husband, a wife or a child away from the rest."
        : `${law.code} forbids selling families apart.`,
      options: [
        {
          v: 0,
          label: "No promise",
          tip: "Spirits as they are",
          why: law.apart ? undefined : "The law forbids it here",
        },
        { v: 1, label: "Never sold apart", tip: "Spirits +5" },
      ],
    },
    {
      key: "passes",
      title: "Passes",
      note: "To visit family on other estates on a Saturday night or a holiday.",
      options: [
        {
          v: 0,
          label: "None",
          tip: "Spirits −4 for those with family elsewhere",
        },
        {
          v: 1,
          label: "Passes to visit family",
          tip: "Spirits +6 for those with family elsewhere (+2 others); a little more coming and going",
        },
      ],
    },
    {
      key: "church",
      title: "Religion",
      note:
        law.church === "required"
          ? `${law.code} requires the enslaved to be baptized and instructed.`
          : law.colony === "virginia"
            ? "Baptism frees nobody (Virginia's act of 1667). Some held their own faith, or Islam."
            : "Instruction, and baptism for those who want it.",
      options: [
        {
          v: 0,
          label: "Not encouraged",
          tip: "As many households did",
          why:
            law.church === "required" ? "The law requires it here" : undefined,
        },
        {
          v: 1,
          label: "Allowed and encouraged",
          tip: "Spirits +4 for Christians, +1 others",
        },
      ],
    },
    {
      key: "letters",
      title: "Letters",
      note: law.reading
        ? law.writing
          ? "Teaching to read and write."
          : `Reading only: ${law.lettersWhy}`
        : (law.lettersWhy ?? "The law forbids it here."),
      options: [
        { v: 0, label: "Not taught", tip: "As most households did" },
        {
          v: 1,
          label: law.writing ? "Taught to read and write" : "Taught to read",
          tip: "Spirits +4; in time they read (and write)",
          why: law.reading ? undefined : "The law forbids it here",
        },
      ],
    },
  ];
}

function keepingSection(ui: GameUi): TemplateResult {
  // What each choice would cost the whole household a month (a child half).
  const heads = boundOf(ui.s, ui.life!).reduce(
    (m, c) => m + (ageOf(ui.s, c) < 12 ? 0.5 : 1),
    0,
  );
  const s = ui.s;
  const life = ui.life!;
  const pol = life.bondage!.policy;
  const value = (k: keyof BondPolicy): number => {
    const v = pol[k];
    if (k === "regime") return v === "task" ? 1 : 0;
    if (typeof v === "boolean") return v ? 1 : 0;
    return v as number;
  };
  const n = boundOf(s, life).length;
  return section(
    "How the household is kept",
    html`<p class="small cq-muted">
        A few plain choices, each with its consequences for health, spirits, the
        work and the risks. What's customary here is the default; the costs are
        each person's, a month (a child's are half).
      </p>
      <div class="cq-bond-policies">
        ${policyRows(ui).map(
          (row) =>
            html`<div class="cq-bond-policy">
              <div class="cq-bond-policy-head">
                <b>${row.title}</b>
                <span class="cq-muted small">${row.note}</span>
              </div>
              <span
                class="cq-seg small"
                role="radiogroup"
                aria-label=${row.title}
              >
                ${row.options.map(
                  (o) =>
                    html`<button
                      role="radio"
                      aria-checked=${value(row.key) === o.v}
                      ?disabled=${!!o.why}
                      title=${o.why ?? o.tip}
                      @click=${() =>
                        void ui.cmd({
                          k: "bond",
                          act: "policy",
                          kind: row.key,
                          arg: o.v,
                        })}
                    >
                      ${o.label}${o.cost !== undefined
                        ? price(o.cost * heads, {
                            note: "The household's provisions (or quarters) a month",
                          })
                        : nothing}
                    </button>`,
                )}
              </span>
            </div>`,
        )}
      </div>
      <p class="small">
        Keeping ${n} ${n === 1 ? "person" : "people"} this way costs
        <b>${coins(householdKeep(s, life))} a month</b>, in the month's figure.
      </p>`,
  );
}

// ---------------------------------------------------------------- the risks

function risksSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const r = bondRisks(s, ui.map, life);
  const pct = (p: number) => `${Math.round(p * 1000) / 10}%`;
  return section(
    "The risks",
    html`<ul class="cq-bond-risks">
        <li>
          <b title=${pct(r.flightYear)}>${chanceWords(r.flightYear)}</b> a year
          that someone flees (about ${Math.round(r.flightsYear * 10) / 10} a
          year). Of those who go, <b>${chanceWords(r.freeOdds)}</b> reach
          freedom; the rest are taken up and brought back.
        </li>
        <li>
          <b title=${pct(r.riseYear)}
            >${r.riseYear > 0 ? chanceWords(r.riseYear) : "no chance"}</b
          >
          a year of a
          rising${r.riseYear > 0
            ? ": rare, and grave. A plot found out ends at the colony's court; a rising burns the barns and goes for the nearest refuge, and the militia is called out."
            : " (it needs four grown people or more)."}
        </li>
        <li>
          About <b>${Math.round(r.deathsYear * 10) / 10}</b>
          ${Math.round(r.deathsYear * 10) / 10 === 1 ? "death" : "deaths"} a
          year expected, of sickness, age and the work.
        </li>
        ${r.refuges.length
          ? html`<li>
              Where they'd make for:
              ${r.refuges.map(
                (x, i) =>
                  html`${i ? "; " : ""}${x.name} (${chanceWords(x.pick)} of
                  those who go; ${chanceWords(x.free)} get there)`,
              )}.
            </li>`
          : nothing}
      </ul>
      ${more(
        "What changes the odds",
        html`<ul class="cq-odds-factors">
          ${r.factors.map((f) => html`<li>${f}</li>`)}
        </ul>`,
      )}`,
  );
}

// ---------------------------------------------------------------- the work

function workSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const f = fieldsOf(s, ui.map, life);
  const hired = hiredOf(s, life);
  const house = boundOf(s, life).filter(
    (c) => c.bond!.work === "house" && ageOf(s, c) >= 12,
  );
  const craftIdle = boundOf(s, life).filter(
    (c) => c.bond!.work === "craft" && !hired.includes(c) && ageOf(s, c) >= 12,
  );
  const at = ui.map.provinces[life.bondage!.home]?.name ?? "home";
  return section(
    "The work",
    html`${f.workers.length
        ? oddsPanel(fieldsOdds(s, ui.w, life))
        : html`<p class="small">Nobody works your fields at ${at}.</p>`}
      ${f.idle.length
        ? html`<p class="small bad">
            ${f.idle.map((c) => c.first).join(", ")}: no fields to work. Each
            worker needs ten acres (Estate › House & land) or a farm at ${at}.
          </p>`
        : nothing}
      ${hired.length
        ? html`<p class="small">
            Hired out in town: ${hired.map((c) => c.first).join(", ")}
            (≈${coins(hired.length * 1.6)} a month between them, less the duty).
          </p>`
        : nothing}
      ${craftIdle.length
        ? html`<p class="small bad">
            ${craftIdle.map((c) => c.first).join(", ")}: no work for hire at
            ${at} (a town of 600 or more is needed).
          </p>`
        : nothing}
      ${house.length
        ? html`<p class="small">
            The house: ${house.map((c) => c.first).join(", ")}. An easier mind
            and better dinners while you're at home
            (−${Math.min(3, house.length)} stress a month).
          </p>`
        : nothing}
      <p class="small cq-muted">
        Against free labour: a hired hand costs 2 a month and needs a business
        to work in; a servant under indenture costs the passage (about 4 a year
        of the term), the same keep, and freedom dues at the end. Those held
        cost a great deal to buy, and their flight, sickness or death is the
        whole of it lost.
      </p>`,
  );
}

// ---------------------------------------------------------------- the docks

function lotPeople(lot: SaleLot): TemplateResult {
  return html`<span class="cq-bond-lot-who"
    >${lot.people.map(
      (x, i) =>
        html`${i ? ", " : ""}<b>${x.first}${x.family
          ? ` ${x.family}`
          : ""}</b>${x.born && x.born !== x.first
          ? html` <span class="cq-muted">(born ${x.born})</span>`
          : nothing}
        ${x.rel === "partner"
          ? x.female
            ? "his wife, "
            : "her husband, "
          : x.rel === "child"
            ? x.female
              ? "a daughter, "
              : "a son, "
            : ""}${x.age}${x.rel === "self" && lot.kind === "held"
          ? html`,
              <span class="cq-muted"
                >${ORIGIN_NAMES[x.origin].split(",")[0]}</span
              >`
          : nothing}`,
    )}</span
  >`;
}

function docksSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  if (life.travel) return nothing;
  const p = life.prov;
  const lots = saleAt(s, ui.map, p);
  const here = ui.map.provinces[p]?.name ?? "here";
  const chance = saleChance(s, ui.map, p);
  if (!lots.length)
    return section(
      `At ${here}`,
      html`<p class="small cq-muted">
        ${chance > 0
          ? `No sale here this month. A ship or an estate's sale comes about ${chanceWords(chance)} months.`
          : "Nobody sells people here: the trade went through particular ports (the Chesapeake's rivers, Charles Town, New York, Newport, the islands, Havana, Curaçao)."}
      </p>`,
    );
  return section(
    `For sale at ${here} this month`,
    html`<ul class="cq-bond-lots">
      ${lots.map((lot) => {
        const check = buyCheck(s, ui.map, life, lot);
        return html`<li class=${lot.sold ? "sold" : ""}>
          <div>
            ${lotPeople(lot)}
            <span class="small cq-muted"
              >${lot.kind === "indenture"
                ? "An indenture: "
                : ""}${lot.note}</span
            >
          </div>
          ${lot.sold
            ? html`<span class="cq-muted small">sold</span>`
            : action(
                html`Buy${price(lot.price, { have: life.purse })}`,
                check,
                () => {
                  if (
                    lot.kind === "indenture" ||
                    confirm(
                      `Buy ${lot.people.map((x) => x.first).join(", ")} for ${lot.price} coins? They are people, and will be held in your household at ${ui.map.provinces[homeFor(life)].name} for life, and their children after them.`,
                    )
                  )
                    void ui.cmd({ k: "bond", act: "buy", key: lot.key });
                },
                "small",
              )}
        </li>`;
      })}
    </ul>`,
  );
}

/** A button for the docks (Here): a sale's notice, if there is one. */
export function bondDocksButton(
  ui: GameUi,
  make: (o: {
    label: string;
    ok: boolean;
    run: () => void;
    title?: string;
  }) => TemplateResult,
): (() => TemplateResult) | null {
  const life = ui.life;
  if (!life || life.travel || lifeIsNative(ui.s, life)) return null;
  const lots = saleAt(ui.s, ui.map, life.prov).filter((l) => !l.sold);
  if (!lots.length) return null;
  const held = lots.some((l) => l.kind === "held");
  return () =>
    make({
      label: held
        ? "A notice of a sale of people…"
        : "Servants' indentures for sale…",
      ok: true,
      title: "Estate › Bondage: who is to be sold, and the law here",
      run: () => ui.open({ k: "tab", tab: "estate", sub: "bondage" }),
    });
}

// ---------------------------------------------------------------- freedom

function freedomSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const fc = freeCost(s, ui.map, life);
  const r = fc.rule;
  const pets = life.bondage?.petitions ?? [];
  const named = boundOf(s, life).filter((c) => c.bond!.will);
  return section(
    html`Freedom ${term("manumission", "?", "cq-term-mark")}`,
    html`<p class="small">
        <b>${r.law.charAt(0).toUpperCase()}${r.law.slice(1)}:</b> ${r.text}
        ${r.kind !== "none"
          ? html`Fees
            ${price(fc.fee)}${fc.passage
              ? html`, their passage out of the colony ${price(fc.passage)}`
              : nothing}${fc.security
              ? html`, and security of ${coins(fc.security)} you must have in
                hand (not paid unless they ever come on the town)`
              : nothing}${fc.allowance
              ? html`; and ${coins(fc.allowance)} a year to them, for life`
              : nothing}.`
          : nothing}
      </p>
      <p class="small cq-muted">
        Freed people stay in the world as free people (or go where the law sends
        them): they can be met, hired, and remember you.
        ${r.will
          ? "A will can free them at your death, as the law then allows."
          : "The law here doesn't let a will free anyone."}
        ${bondLaw(s, ui.map, homeFor(life)).selfPurchase === "right"
          ? "Under Spain's law (coartación), anyone who has saved their price may buy their freedom, and can't be refused."
          : "Those who save their price may ask to buy their freedom; it's yours to agree."}
      </p>
      ${pets.length
        ? html`<ul class="small">
            ${pets.map(
              (p) =>
                html`<li>
                  A petition for <b>${bondName(s.chars[p.c])}</b> before
                  ${p.who}${p.will ? " (your will's)" : ""}: answered about
                  ${formatDate(p.due)}; granted about ${chanceWords(p.odds)}.
                </li>`,
            )}
          </ul>`
        : nothing}
      ${named.length
        ? html`<p class="small">
            Your will frees: ${named.map((c) => bondName(c)).join(", ")}.
          </p>`
        : nothing}`,
  );
}

// ---------------------------------------------------------------- the law and its history

function lawSection(ui: GameUi, p: number, title: string): TemplateResult {
  const s = ui.s;
  const law = bondLaw(s, ui.map, p);
  const year = dateOf(s.day).year;
  const hist = historyOf(law.colony, year);
  const where = ui.map.provinces[p]?.name ?? "here";
  return section(
    html`The law: ${title} ${term("bondage", "?", "cq-term-mark")}`,
    html`<p class="small">
        <b>${where}, ${COLONY_NAMES[law.colony]}</b>
        <span class="cq-muted"
          >(${law.law === "none" ? "no one's law" : `${law.ruler} law`})</span
        >: ${law.why}
      </p>
      <ul class="small cq-bond-law">
        ${law.legal
          ? html`<li>
              <b>Freeing:</b> ${law.freeing.law}: ${law.freeing.text}
            </li>`
          : nothing}
        ${law.legal && !law.writing
          ? html`<li><b>Letters:</b> ${law.lettersWhy}</li>`
          : nothing}
        ${law.legal && !law.apart
          ? html`<li><b>Families:</b> may not be sold apart.</li>`
          : nothing}
        ${law.patrols ? html`<li><b>Patrols</b> ride at night.</li>` : nothing}
        ${law.notes.map((n) => html`<li>${n}</li>`)}
      </ul>
      ${hist.length
        ? more(
            html`<span class="small"
              >The history here, to ${year} (${hist.length})</span
            >`,
            html`<ul class="small cq-bond-history">
              ${hist.map(
                (e) =>
                  html`<li
                    class=${e.rising ? "rising" : e.native ? "native" : ""}
                  >
                    <b>${e.year}</b> ${e.text}
                  </li>`,
              )}
            </ul>`,
          )
        : nothing}`,
  );
}

// ---------------------------------------------------------------- the record

const NOTE_WORDS: Record<string, string> = {
  bought: "came to the household",
  born: "was born",
  died: "died",
  fled: "fled",
  taken: "was taken up and brought back",
  free: "got clear, and is free",
  freed: "was freed",
  sold: "was sold away",
  served: "served out the indenture",
  married: "married",
  petition: "a petition was filed for",
  denied: "the petition was refused for",
  plot: "was condemned for a plot",
  rose: "people rose and went",
};

function recordSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const log = life.bondage?.log ?? [];
  if (!log.length) return nothing;
  return section(
    "The household's record",
    more(
      html`<span class="small">${log.length} entries, newest first</span>`,
      html`<ul class="small cq-bond-record">
        ${[...log].reverse().map((n) => {
          const c = n.c !== undefined ? s.chars[n.c] : undefined;
          const what = NOTE_WORDS[n.k] ?? n.k;
          return html`<li>
            <span class="cq-muted">${formatDate(n.day)}</span>
            ${n.k === "rose"
              ? `${n.n ?? ""} ${what}`
              : n.k === "petition" || n.k === "denied"
                ? html`${what} <b>${bondName(c)}</b>`
                : html`<b>${bondName(c)}</b> ${what}${n.k === "married" &&
                    n.n !== undefined
                      ? html` <b>${bondName(s.chars[n.n])}</b>`
                      : nothing}`}
          </li>`;
        })}
      </ul>`,
    ),
  );
}

/** For other pages: whether a character is held in some household. */
export function heldWord(c: Character | undefined): string | null {
  if (!c?.bond) return null;
  if (isHeld(c)) return "held";
  if (isBound(c)) return "under indenture";
  if (c.bond.status === "free") return c.bond.freed ? "freed" : null;
  return null;
}
