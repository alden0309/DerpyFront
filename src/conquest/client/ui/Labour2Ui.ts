// LABOUR2 (r21): the new parts of Estate › Bondage, a business's card and a
// bound person's page. The overseer (who's for hire, what each would do, your
// orders, what he does now); those of the household at your businesses (and
// what a place there comes to against a hired hand, after the price and the
// risk); the house in the trade (its route planned with the people its factor
// would buy named before you commit, the odds, the human cost and the law; a
// voyage's manifest, and what became of each); and someone held, on their
// own page, where they live and work.
//
// Everything shown is reckoned from the engine's own models (Labour2Core,
// TradeCore, TradeLaw), the same the month and the voyages are rolled from.

import { html, nothing, TemplateResult } from "lit";
import {
  AWAY_FACTOR,
  bondFullName,
  bondForecast,
  bondName,
  boundOf,
  fieldsOf,
  healthWord,
  isBound,
  moodWord,
  ORIGIN_NAMES,
  rentForgone,
} from "../../engine/BondCore";
import { colonyOf, COLONY_NAMES } from "../../engine/BondLaw";
import {
  foundCheck,
  houseOf,
  houseOutlook,
  nextManifest,
  routeOf,
} from "../../engine/BondTrade";
import { propertyView } from "../../engine/Business";
import { dateOf, formatDate } from "../../engine/Calendar";
import {
  bizChoices,
  bizRoom,
  bizWorkCheck,
  boundAt,
  handWays,
  hireOverseerCheck,
  mindingWords,
  overseerCandidates,
  overseerPlan,
  partedBy,
} from "../../engine/Labour2Core";
import {
  atBusiness,
  bizEff,
  MANNERS,
  overseerMind,
  overseerOf,
  overseerParts,
  shareOf,
} from "../../engine/Labour2Rules";
import { lifeIsNative, opinionOf } from "../../engine/LifeQueries";
import { chanceWords } from "../../engine/Odds";
import { ageOf } from "../../engine/Queries";
import {
  EVERY,
  FOOD,
  HOUSE_SETUP,
  SIZES,
  tradeName,
  VOICES,
  type TradeRoute,
} from "../../engine/TradeCore";
import { houseLawOf, housePorts } from "../../engine/TradeLaw";
import { lawOf } from "../../engine/BondLaw";
import { tradeStanding } from "../../engine/TradeRep";
import type {
  Character,
  Property,
  TradeHouse,
  TradePerson,
  TradeVoyage,
} from "../../engine/Types";
import { num } from "../Tip";
import {
  action,
  bar,
  breakdownTip,
  GameUi,
  more,
  provLink,
  section,
  token,
} from "./Context";
import { oddsPanel } from "./Odds";
import { coins, price } from "./Price";
import { term, TERMS } from "./Terms";

const r1 = (v: number) => Math.round(v * 10) / 10;
const signed = (v: number) =>
  `${r1(v) > 0 ? "+" : r1(v) < 0 ? "−" : ""}${coins(Math.abs(v))}`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// ---------------------------------------------------------------- words explained

Object.assign(TERMS, {
  overseer: {
    name: "Overseer",
    what: "A hired man who manages a household's enslaved people for its holder: sets the work, keeps the place going while the holder is away. Paid wages, or (as Virginia's planters often paid them) shares of the crop.",
    good: "Your fields keep going while you're away, and he sets each to the work that suits them.",
    raise:
      "A hard overseer, or one paid by the crop, gets a little more from the day and loses it again in spirits, health, flight and risings. Your orders of restraint halve what his nature does.",
    ch: "labour2",
  },
  bondtrade: {
    name: "A house in the trade",
    what: "A merchant's house in the intercolonial trade in people: its factor buys people at one port where they were sold and a chartered sloop carries them to another, to be sold again. As many as a quarter of the Africans brought to the Americas were shipped on again this way.",
    good: "Money, when the passage, the duty and the sale go well.",
    raise:
      "Each voyage is a list of names: deaths on the passage, families and shipmates parted at the sale, now and then a rising. Lawful only between ports of your own crown where people were sold, under each colony's duties and bans.",
    ch: "labour2",
  },
  importduty: {
    name: "Duty on people brought in",
    what: "What a colony laid on each person brought in for sale: to raise money, to 'discourage' the trade, or (South Carolina, New York) to keep out people sold away from other colonies. Virginia's was a share of the price; most others' so much a head, in the colony's own money.",
    good: "",
    raise:
      "Some duties were meant to stop the trade: South Carolina's after the rising at Stono (1740 to 1745) and from 1766 to 1768, Pennsylvania's in 1712 and from 1773.",
    ch: "labour2",
  },
  shipmates: {
    name: "Shipmates",
    what: "Those who crossed the Atlantic in the same ship, who often called each other brother and sister for the rest of their lives: the passage made them kin. Each sale onward parted more of them.",
    good: "",
    raise: "",
    ch: "labour2",
  },
});

// ---------------------------------------------------------------- the overseer

const WORK_ORDER = ["assign", "keep"] as const;
const RULE_ORDER = ["restraint", "his"] as const;

/** The overseer: who he is and what he does, your orders, or who's for hire. */
export function overseerSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const b = life.bondage;
  if (!b || lifeIsNative(s, life) || !boundOf(s, life).length) return nothing;
  const o = overseerOf(s, life);
  const head = html`An overseer ${term("overseer", "?", "cq-term-mark")}`;
  if (!o) {
    const list = overseerCandidates(s, ui.map, life);
    const fields = bondForecast(s, life, ui.w).find((x) => x.key === "bond:fields");
    const workers = fieldsOf(s, ui.map, life).workers.length;
    return section(
      head,
      html`<p class="small cq-muted">
          A hired man to manage the household for you: he sets each to the work
          that suits them (the fields while there are acres, a business of yours
          in the town, a trade hired out, the house) and keeps the place going
          while you're away (nobody: ${Math.round(AWAY_FACTOR * 100)}% of the work; an overseer:
          ${Math.round(overseerMind(4) * 100)}% to
          ${Math.round(overseerMind(12) * 100)}% by his skill). What he's like
          matters more than what he costs.
        </p>
        <ul class="cq-l2-cands">
          ${list.map((x) => {
            const m = MANNERS[x.manner];
            const check = hireOverseerCheck(s, life, x);
            const rent = rentForgone(life, workers);
            const share = fields
              ? (fields.value + rent) * shareOf(x.shares, workers)
              : 0;
            return html`<li class="cq-l2-cand">
              <div>
                <b>${x.first} ${x.family}</b>
                <span class="cq-muted small">${x.age}, ${x.note}</span>
                <span class="small"
                  ><span class="cq-chip ${x.manner === "hard" ? "bad" : x.manner === "fair" ? "gold" : ""}"
                    >${m.name}</span
                  >
                  skill ${x.skill}: ${m.text}</span
                >
              </div>
              <div class="cq-btnrow">
                ${action(
                  html`Engage, for wages${price(x.wage, { per: "month", have: life.purse })}`,
                  check,
                  () =>
                    void ui.cmd({ k: "bond2", act: "hire", c: x.slot, pay: "wage" }),
                  "small",
                )}
                ${action(
                  x.shares
                    ? html`For ${x.shares === 1 ? "a share" : `${x.shares} shares`}
                        of the crop${share > 0 ? price(r1(share), { per: "month", approx: true }) : nothing}`
                    : html`For shares of the crop`,
                  hireOverseerCheck(s, life, x, "share"),
                  () =>
                    void ui.cmd({ k: "bond2", act: "hire", c: x.slot, pay: "share" }),
                  "small ghost",
                  "Paid by the crop, he drives them for it: spirits −4, health −3, the work ×1.04",
                )}
              </div>
            </li>`;
          })}
        </ul>`,
    );
  }
  const c = s.chars[o.c];
  const m = MANNERS[o.manner];
  const parts = overseerParts(o);
  const fields = bondForecast(s, life, ui.w).find((x) => x.key === "bond:fields");
  const nFields = fieldsOf(s, ui.map, life).workers.length;
  const k = shareOf(o.shares, nFields);
  const shareNow = fields ? (fields.value + rentForgone(life, nFields)) * k : 0;
  const plan = o.orders.work === "assign" ? overseerPlan(s, ui.map, life) : [];
  const changes = plan.filter((x) => {
    const p = s.chars[x.c];
    return p?.bond && (p.bond.work !== x.work || (x.work === "biz" && p.bond.biz !== x.biz));
  });
  const seg = <T extends string>(
    label: string,
    value: T,
    opts: readonly T[],
    words: Record<T, string>,
    tips: Record<T, string>,
    set: (v: T) => void,
  ) =>
    html`<div class="cq-bond-policy">
      <div class="cq-bond-policy-head"><b>${label}</b></div>
      <span class="cq-seg small" role="radiogroup" aria-label=${label}>
        ${opts.map(
          (v) =>
            html`<button
              role="radio"
              aria-checked=${value === v}
              title=${tips[v]}
              @click=${() => set(v)}
            >
              ${words[v]}
            </button>`,
        )}
      </span>
    </div>`;
  const orders = (patch: Record<string, unknown>) =>
    void ui.cmd({ k: "bond2", act: "orders", orders: patch });
  return section(
    head,
    html`<div class="cq-l2-ov">
        ${token(ui, c, "small")}
        <div>
          <b>${c ? `${c.first} ${c.family}` : "Your overseer"}</b>
          <span class="cq-muted small"
            >${c ? `${ageOf(s, c)}, ` : ""}since
            ${formatDate(o.since)}; skill ${o.skill}</span
          >
          <span class="small"
            ><span class="cq-chip ${o.manner === "hard" ? "bad" : o.manner === "fair" ? "gold" : ""}"
              >${m.name}</span
            >
            ${m.text}</span
          >
          <span class="small"
            >Paid
            ${o.pay === "wage"
              ? html`wages ${price(o.wage, { per: "month" })}`
              : html`${o.shares === 1 ? "a share" : `${o.shares} shares`} of the
                crop${shareNow > 0 ? price(r1(shareNow), { per: "month", approx: true }) : nothing}`}${o.owed
              ? html` · <b class="bad">${o.owed} month unpaid</b>`
              : nothing}</span
          >
        </div>
      </div>
      <p class="small">
        ${mindingWords(s, life)} The work under him:
        ${num(
          `×${Math.round(parts.drive * 100) / 100}`,
          () => ({
            title: "What he gets out of the day",
            notes: [
              `His nature: ×${m.drive}${o.orders.rule === "restraint" ? ", halved by your orders" : ""}.`,
              o.pay === "share" ? "Paid by the crop: ×1.04." : "",
              "What it costs in spirits and health is in each person's own figures (and so in the work).",
            ].filter(Boolean),
          }),
        )};
        spirits
        ${parts.mood.map(([l, v]) => html`<span title=${l}>${v > 0 ? "+" : ""}${v}</span> `)}${parts.health.length
          ? html`, health
            ${parts.health.map(([l, v]) => html`<span title=${l}>${v > 0 ? "+" : ""}${v}</span> `)}`
          : nothing}.
      </p>
      <div class="cq-bond-policies">
        ${seg(
          "The work",
          o.orders.work,
          WORK_ORDER,
          { assign: "He sets it", keep: "As you set it" },
          {
            assign:
              "Each month he sets each to what suits them: the fields while there are acres, a business of yours in this town, a trade hired out, the house",
            keep: "He keeps them at what you set",
          },
          (v) => orders({ work: v }),
        )}
        ${seg(
          "His hand",
          o.orders.rule,
          RULE_ORDER,
          { restraint: "Restraint, whatever his nature", his: "As he sees fit" },
          {
            restraint: "Half his harshness, and half his drive",
            his: "His own way",
          },
          (v) => orders({ rule: v }),
        )}
        ${seg(
          "While you're away",
          o.orders.report ? "yes" : "no",
          ["yes", "no"] as const,
          { yes: "He writes each season", no: "No letters" },
          { yes: "A letter each season", no: "Nothing unless you ask" },
          (v) => orders({ report: v === "yes" }),
        )}
      </div>
      ${changes.length
        ? html`<p class="small cq-muted">
            At the month's turn he'll set:
            ${changes
              .map((x) => {
                const p = s.chars[x.c];
                const where =
                  x.work === "biz"
                    ? `your ${(life.property ?? []).find((y) => y.id === x.biz)?.name ?? "business"}`
                    : x.work === "craft"
                      ? "a trade, hired out"
                      : x.work === "rest"
                        ? "rest"
                        : `the ${x.work}`;
                return `${p?.first ?? "?"} to ${where}`;
              })
              .join("; ")}.
          </p>`
        : nothing}
      <div class="cq-btnrow">
        ${action(
          o.pay === "wage" ? "Pay him by shares of the crop" : "Pay him wages",
          (life.cooldowns["bond2:ovpay"] ?? 0) > s.day
            ? { ok: false, why: "A new bargain, at most once in six months" }
            : { ok: true },
          () =>
            void ui.cmd({
              k: "bond2",
              act: "pay",
              pay: o.pay === "wage" ? "share" : "wage",
            }),
          "small ghost",
        )}
        ${action(
          "Let him go",
          { ok: true },
          () => {
            if (confirm(`Let ${c?.first ?? "your overseer"} go?`))
              void ui.cmd({ k: "bond2", act: "dismiss" });
          },
          "small ghost",
        )}
      </div>`,
  );
}

// ---------------------------------------------------------------- at your businesses

/** Those of the household at your businesses: who, where, and what each does. */
export function bizWorkSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const shops = bizChoices(life).filter((pr) => boundAt(s, life, pr).length);
  if (!shops.length) return nothing;
  return section(
    "At your businesses",
    html`<p class="small cq-muted">
        They live at the business and are counted among its hands. They draw no
        wage; the business pays their provisions and quarters (as the household
        is kept). They do what their trade, health and spirits allow, and run
        every risk the household's people run, the more for living among free
        people in a town.
      </p>
      <ul class="small cq-l2-shops">
        ${shops.map(
          (pr) =>
            html`<li>
              <b>${cap(pr.name)}</b> at ${provLink(ui, pr.prov)}:
              ${boundAt(s, life, pr).map(
                (c, i) =>
                  html`${i ? ", " : ""}${c.first}
                    <span class="cq-muted"
                      >(doing ${Math.round(bizEff(c.bond!) * 100)} in 100 of a
                      hired hand's work)</span
                    >`,
              )}
            </li>`,
        )}
      </ul>`,
  );
}

/** On someone's card: set them to work at a business of yours, or bring them home. */
export function bizPicker(ui: GameUi, c: Character): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const shops = bizChoices(life);
  if (!shops.length) return nothing;
  const at = atBusiness(c)
    ? shops.find((x) => x.id === c.bond!.biz)
    : undefined;
  return more(
    html`<span class="small"
      >${at ? `At your ${at.name} · change…` : "At a business of yours…"}</span
    >`,
    html`<ul class="small cq-l2-picks">
      ${at
        ? html`<li>
            ${action(
              `Bring ${c.first} home`,
              { ok: true },
              () => void ui.cmd({ k: "bond2", act: "biz", c: c.id, id: -1 }),
              "small ghost",
            )}
          </li>`
        : nothing}
      ${shops
        .filter((pr) => pr !== at)
        .map((pr) => {
          const check = bizWorkCheck(s, ui.map, life, c, pr);
          const room = bizRoom(pr) + (pr.biz?.extra ?? 0);
          const ok = check.ok || (room > 0 && /full/.test(check.why));
          const parted = partedBy(s, c, pr);
          const v = propertyView(s, life, pr);
          const ways = handWays(s, ui.map, life, pr, v.perHand, c);
          return html`<li>
            ${action(
              html`Set ${c.first} to work at your ${pr.name}
              (${ui.map.provinces[pr.prov]?.name})`,
              ok ? { ok: true } : check,
              () => {
                if (
                  !parted.length ||
                  confirm(
                    `${c.first} would live at ${ui.map.provinces[pr.prov]?.name}, away from ${parted.map((x) => x.first).join(" and ")}. They'd grieve for months.`,
                  )
                )
                  void ui.cmd({ k: "bond2", act: "biz", c: c.id, id: pr.id });
              },
              "small",
            )}
            ${parted.length
              ? html`<span class="bad">
                  Parts ${c.female ? "her" : "him"} from
                  ${parted.map((x) => x.first).join(" and ")}.</span
                >`
              : nothing}
            ${ways.bound
              ? html`<span class="cq-muted"
                  >A place there, a month: a hired hand nets
                  ${signed(ways.hired.net)}; ${c.first}, after the price
                  (${coins(ways.price ?? 0)}) and the risk,
                  ${signed(ways.bound.net)}.</span
                >`
              : nothing}
          </li>`;
        })}
    </ul>`,
  );
}

/** On a business's card: those of the household who work there, and what a place comes to. */
export function boundBizPart(ui: GameUi, pr: Property): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  if (!life.bondage || lifeIsNative(s, life) || pr.job === "sailor") return nothing;
  const here = boundAt(s, life, pr);
  const could = boundOf(s, life).filter(
    (c) => !here.includes(c) && bizWorkCheck(s, ui.map, life, c, { ...pr, biz: { ...pr.biz, extra: 0, bound: [] } }).ok,
  );
  if (!here.length && !could.length) return nothing;
  const v = propertyView(s, life, pr);
  const ways = handWays(s, ui.map, life, pr, v.perHand, here[0] ?? could[0]);
  return html`<div class="cq-biz-row cq-l2-bizrow">
    <span class="cq-biz-row-what"
      ><b>Held in bondage here</b>
      <span class="cq-muted small"
        >${here.length
          ? html`${here.map(
              (c, i) =>
                html`${i ? ", " : ""}${c.first}
                  <button
                    class="cq-link small"
                    title="Bring them home to the household"
                    @click=${() =>
                      void ui.cmd({ k: "bond2", act: "biz", c: c.id, id: -1 })}
                  >
                    (home)
                  </button>`,
            )}:
            no wages; their keep ${price(v.bound, { per: "month" })}.`
          : "Nobody of your household works here."}
        ${ways.bound
          ? html`A place, a month: a hired hand nets ${signed(ways.hired.net)}
              (wage ${coins(ways.hired.cost)}); ${ways.bound.label.split(",")[0]}
              ${signed(ways.bound.net)} after their keep
              (${coins(ways.bound.cost)}), their price spread over twelve years
              with the interest it would earn (${coins(ways.bound.capital)}),
              and the risk of flight and death (${coins(ways.bound.risk)}).
              <i
                >Franklin set out the same sum in 1751 ("Reckon then the
                Interest of the first Purchase ... the Insurance or Risque on
                his Life, his Cloathing and Diet ... Loss by his Neglect of
                Business") and found hired labour the cheaper.</i
              >`
          : nothing}
        Set someone of your household to work here from Estate › Bondage.</span
      ></span
    >
    <span class="cq-btnrow">
      ${action(
        "Estate › Bondage",
        { ok: true },
        () => ui.open({ k: "tab", tab: "estate", sub: "bondage" }),
        "small quiet",
      )}
    </span>
  </div>`;
}

// ---------------------------------------------------------------- the house in the trade

/** The route being planned, by seat (kept while the page is open). */
const plans = new Map<string, TradeRoute & { every: number }>();

function defaultRoute(ui: GameUi, law: "english" | "french" | "spanish"): TradeRoute & { every: number } {
  const s = ui.s;
  const buys = housePorts(s, ui.map, law, "buy");
  const sells = housePorts(s, ui.map, law, "sell");
  const life = ui.life!;
  const homeCol = colonyOf(ui.map, life.home);
  const isle = (p: number) => {
    const c = colonyOf(ui.map, p);
    return c === "islands" || c === "jamaica" || c === "hispaniola" || c === "cuba";
  };
  const from = buys.find(isle) ?? buys[0] ?? -1;
  const to =
    sells.find((p) => p !== from && colonyOf(ui.map, p) === homeCol) ??
    sells.find((p) => p !== from) ??
    -1;
  return { from, to, size: SIZES[1], every: EVERY[1], food: 1, together: false };
}

function planOf(ui: GameUi, law: "english" | "french" | "spanish"): TradeRoute & { every: number } {
  const seat = ui.life!.seat;
  let p = plans.get(seat);
  if (!p) {
    const h = houseOf(ui.life!);
    p = h ? { ...routeOf(h), every: h.every } : defaultRoute(ui, law);
    plans.set(seat, p);
  }
  return p;
}

function routePicker(
  ui: GameUi,
  law: "english" | "french" | "spanish",
  r: TradeRoute & { every: number },
): TemplateResult {
  const s = ui.s;
  const buys = housePorts(s, ui.map, law, "buy");
  const sells = housePorts(s, ui.map, law, "sell");
  const set = (patch: Partial<TradeRoute & { every: number }>) => {
    plans.set(ui.life!.seat, { ...r, ...patch });
    ui.redraw();
  };
  const name = (p: number) =>
    `${ui.map.provinces[p]?.name} (${COLONY_NAMES[colonyOf(ui.map, p)]})`;
  return html`<div class="cq-co-plan cq-l2-plan">
    <label class="cq-field"
      ><span>Its factor buys at</span>
      <select
        @change=${(e: Event) =>
          set({ from: Number((e.target as HTMLSelectElement).value) })}
      >
        ${buys.map(
          (p) => html`<option value=${p} ?selected=${p === r.from}>${name(p)}</option>`,
        )}
      </select></label
    >
    <label class="cq-field"
      ><span>And sells at</span>
      <select
        @change=${(e: Event) =>
          set({ to: Number((e.target as HTMLSelectElement).value) })}
      >
        ${sells
          .filter((p) => p !== r.from)
          .map(
            (p) => html`<option value=${p} ?selected=${p === r.to}>${name(p)}</option>`,
          )}
      </select></label
    >
    <span class="cq-field"
      ><span>People a voyage</span>
      <span class="cq-seg small" role="radiogroup" aria-label="People a voyage">
        ${SIZES.map(
          (n) =>
            html`<button role="radio" aria-checked=${r.size === n} @click=${() => set({ size: n })}>
              ${n}
            </button>`,
        )}
      </span></span
    >
    <span class="cq-field"
      ><span>A voyage every</span>
      <span class="cq-seg small" role="radiogroup" aria-label="How often">
        ${EVERY.map(
          (n) =>
            html`<button role="radio" aria-checked=${r.every === n} @click=${() => set({ every: n })}>
              ${n} months
            </button>`,
        )}
      </span></span
    >
    <span class="cq-field"
      ><span>On the passage</span>
      <span class="cq-seg small" role="radiogroup" aria-label="Provisions on the passage">
        ${([0, 1, 2] as const).map(
          (f) =>
            html`<button
              role="radio"
              aria-checked=${r.food === f}
              title=${`Deaths ×${FOOD[f].death}, risings ×${FOOD[f].rise}; ${FOOD[f].day} a person a day`}
              @click=${() => set({ food: f })}
            >
              ${FOOD[f].name}
            </button>`,
        )}
      </span></span
    >
    <span class="cq-field"
      ><span>At the sale</span>
      <span class="cq-seg small" role="radiogroup" aria-label="Families at the sale">
        <button
          role="radio"
          aria-checked=${r.together}
          title="A family is sold as one lot: a little less, and longer to sell"
          @click=${() => set({ together: true })}
        >
          Families together
        </button>
        <button
          role="radio"
          aria-checked=${!r.together}
          title="To whoever bids most, as the custom is: families and shipmates often parted"
          @click=${() => set({ together: false })}
        >
          To whoever bids most
        </button>
      </span></span
    >
  </div>`;
}

const KIN_WORDS: Record<string, [string, string]> = {
  mother: ["his mother", "her mother"],
  child: ["his child", "her child"],
  wife: ["his wife", "his wife"],
  husband: ["her husband", "her husband"],
  sister: ["his sister", "her sister"],
  brother: ["his brother", "her brother"],
  shipmate: ["his shipmate", "her shipmate"],
};

function kinWords(
  v: { people: TradePerson[] },
  p: TradePerson,
): TemplateResult | typeof nothing {
  if (p.kin === undefined || !p.rel) return nothing;
  const k = v.people[p.kin];
  return html`; ${KIN_WORDS[p.rel]?.[p.f ? 1 : 0] ?? "kin"} <b>${k?.n ?? ""}</b>`;
}

const FATE_WORDS: Record<string, string> = {
  died: "died on the passage",
  sold: "sold",
  free: "got free",
  taken: "carried off by a privateer",
  kept: "kept in your household",
};

/** A manifest: each name, who they are, their kin aboard, and what became of them. */
function manifest(ui: GameUi, v: { people: TradePerson[] }): TemplateResult {
  return html`<ul class="cq-l2-manifest small">
    ${v.people.map((p) => {
      const kin = kinWords(v, p);
      return html`<li class=${p.fate ?? ""}>
        <b>${tradeName(p)}</b>
        <span class="cq-muted"
          >${p.a}, ${ORIGIN_NAMES[p.o].split(",")[0]}${p.fresh
            ? ", lately from Africa"
            : ""}${kin}</span
        >
        ${p.fate
          ? html`<span class="cq-l2-fate ${p.fate}"
              >${FATE_WORDS[p.fate]}${p.to && p.fate === "sold" ? html` to ${p.to}` : ""}${p.parted
                ? html`, <b class="bad">parted</b>`
                : ""}</span
            >`
          : nothing}
        ${p.said !== undefined
          ? html`<i class="cq-l2-said">${p.n} ${VOICES[p.said]?.text ?? ""}</i>`
          : nothing}
      </li>`;
    })}
  </ul>`;
}

/** What the town thinks of the trade now, in a line. */
function standingLine(ui: GameUi, col: string): TemplateResult {
  const year = dateOf(ui.s.day).year;
  const st = tradeStanding(year, col);
  return html`<p class="small cq-muted">
    <b>What people think of the trade, ${year}:</b> ${st.why} Ministers, the
    just and the devout ${st.conscience}; most others
    ${st.others ? st.others : "nothing either way"}${st.trade
      ? html`; planters and merchants +${st.trade}`
      : nothing}
    (to their opinion of you, while your house trades, and half for three years
    after).
  </p>`;
}

/** Estate › Bondage: the house in the trade, or setting one up. */
export function tradeSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  if (!ui.me || lifeIsNative(s, life) || ageOf(s, ui.me) < 16) return nothing;
  const h = houseOf(life);
  const law = h?.law ?? houseLawOf(lawOf(s, life.home).law);
  const head = html`A house in the trade ${term("bondtrade", "?", "cq-term-mark")}`;
  if (!law)
    return section(
      head,
      html`<p class="small cq-muted">
        Only a subject of the English, French or Spanish crowns could keep such a
        house where you live: the Dutch trade was the West India Company's.
      </p>`,
    );
  if (h) return houseCard(ui, h);
  const past = life.bondTrade;
  const r = planOf(ui, law);
  const out = r.from >= 0 && r.to >= 0 ? houseOutlook(s, ui.w, life, r, r.every) : undefined;
  const people = r.from >= 0 ? nextManifest(s, ui.w, life, r) : [];
  const check = foundCheck(s, ui.w, life, r);
  return section(
    head,
    html`<p class="small">
        A merchant's house in the intercolonial trade in people: its factor buys
        at one port where people were sold, a chartered sloop carries them, and
        they're sold again at another port of your crown. As many as a quarter of
        the Africans brought to the Americas were shipped on again this way. Every
        voyage is a list of names.
      </p>
      ${past?.closed !== undefined
        ? html`<p class="small cq-muted">
            ${past.name} was wound up ${formatDate(past.closed)}, after
            ${past.totals.voyages} voyages.
          </p>`
        : nothing}
      ${more("Plan a route", routePicker(ui, law, r), true)}
      ${people.length
        ? html`<h4 class="cq-int-group">
              Who its factor would buy at
              ${ui.map.provinces[r.from]?.name} for the first voyage
            </h4>
            ${manifest(ui, { people })}`
        : nothing}
      ${out
        ? html`${humanCost(out)} ${oddsPanel(out.view)} ${dutyLine(ui, out, r.to)}`
        : nothing}
      ${standingLine(ui, colonyOf(ui.map, life.home))}
      <div class="cq-btnrow">
        ${action(
          html`Set up the house${price(HOUSE_SETUP, { have: life.purse })}`,
          check,
          () => {
            if (
              confirm(
                `Set up a house in the trade in people? Its first voyage buys ${r.size} people at ${ui.map.provinces[r.from]?.name}${out ? ` for about ${coins(out.buy)} coins, with the passage ${coins(out.passage)}` : ""}, to be sold at ${ui.map.provinces[r.to]?.name}.`,
              )
            )
              void ui.cmd({ k: "bond2", act: "found", route: r });
          },
          "small",
        )}
      </div>`,
  );
}

/** The human cost of a voyage, before its money. */
function humanCost(o: NonNullable<ReturnType<typeof houseOutlook>>): TemplateResult {
  return html`<p class="small cq-l2-cost">
    <b>What a voyage costs those it carries:</b> about ${o.deaths} of them would
    die on the passage (${o.days} days at sea); ${o.parted
      ? html`about ${o.parted} of the families and shipmates aboard would be
          parted at the sale`
      : "no family parted at the sale"};
    ${chanceWords(o.rise)} that they rise aboard.
  </p>`;
}

/** The colony's duty at the far port, act by act. */
function dutyLine(
  ui: GameUi,
  o: NonNullable<ReturnType<typeof houseOutlook>>,
  to: number,
): TemplateResult {
  return html`<p class="small">
    <b>${term("importduty", "The duty")} at ${ui.map.provinces[to]?.name}:</b>
    ${o.dutyLaws.length
      ? html`${coins(o.duty)} on the voyage's people, under
        ${o.dutyLaws.join("; ")}.`
      : "none in the game's sources."}
    ${o.prohibitive
      ? html`<b class="bad">A duty meant to stop the trade, not to tax it.</b>`
      : nothing}
  </p>`;
}

function houseCard(ui: GameUi, h: TradeHouse): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const v = h.voyage;
  const name = (p: number) => ui.map.provinces[p]?.name ?? "?";
  const t = h.totals;
  const r = planOf(ui, h.law);
  const changed =
    r.from !== h.from || r.to !== h.to || r.size !== h.size || r.every !== h.every || r.food !== h.food || r.together !== h.together;
  const out = !v && h.on ? houseOutlook(s, ui.w, life) : undefined;
  return section(
    html`${h.name} ${term("bondtrade", "?", "cq-term-mark")}`,
    html`<p class="small">
        Est. ${formatDate(h.founded)}. Buys ${h.size} at a time at
        ${provLink(ui, h.from)} and sells at ${provLink(ui, h.to)}, a voyage every
        ${h.every} months; ${FOOD[h.food].name.toLowerCase()} on the passage;
        ${h.together ? "families sold together" : "sold to whoever bids most"}.
        ${h.on ? "" : html`<b class="bad">It sends no voyages now.</b>`}
      </p>
      <p class="small cq-l2-totals">
        <b>All told:</b> ${t.voyages} voyages, ${t.carried} people carried;
        <span class="bad">${t.died} died on the passage</span>, ${t.sold} sold,
        <span class="bad">${t.parted} parted from their kin at the sale</span>,
        ${t.free} got free${t.taken ? `, ${t.taken} carried off by privateers` : ""};
        ${t.rose} risings aboard. The house's money: ${signed(t.net)}.
      </p>
      ${v
        ? html`<h4 class="cq-int-group">
              ${v.landed !== undefined
                ? html`At ${name(v.to)}: the sale, ${formatDate(v.sells ?? s.day)}`
                : html`At sea, from ${name(v.from)} to ${name(v.to)}: due
                  ${formatDate(v.due)}`}
            </h4>
            ${manifest(ui, v)} ${logList(v)}`
        : h.on
          ? html`<h4 class="cq-int-group">
                The next voyage, ${formatDate(Math.max(s.day, h.next))}: who its
                factor would buy
              </h4>
              ${manifest(ui, { people: nextManifest(s, ui.w, life) })}
              ${out ? html`${humanCost(out)} ${oddsPanel(out.view)} ${dutyLine(ui, out, h.to)}` : nothing}`
          : nothing}
      ${standingLine(ui, h.col)}
      ${more(
        "Change its route and rules",
        html`${routePicker(ui, h.law, r)}
          <div class="cq-btnrow">
            ${action(
              "Change, from the next voyage",
              changed ? { ok: true } : { ok: false, why: "Nothing changed" },
              () => void ui.cmd({ k: "bond2", act: "route", route: r }),
              "small",
            )}
          </div>`,
      )}
      <div class="cq-btnrow">
        ${h.on
          ? action("Send no more voyages", { ok: true }, () => void ui.cmd({ k: "bond2", act: "off" }), "small ghost")
          : action("Send voyages again", { ok: true }, () => void ui.cmd({ k: "bond2", act: "on" }), "small ghost")}
        ${action(
          "Wind the house up",
          v ? { ok: false, why: "Not while a voyage is at sea or its people unsold" } : { ok: true },
          () => {
            if (confirm(`Wind up ${h.name}?`)) void ui.cmd({ k: "bond2", act: "close" });
          },
          "small ghost",
        )}
      </div>
      ${h.past.length
        ? more(
            html`<span class="small">Past voyages (${h.past.length})</span>`,
            html`${[...h.past].reverse().map(
              (x) =>
                html`<h4 class="cq-int-group">
                    ${formatDate(x.sailed)}: ${name(x.from)} to ${name(x.to)}
                    <span class="cq-muted small"
                      >${x.people.length} aboard${x.got !== undefined
                        ? html`, sold for ${coins(x.got)} less ${coins(x.duty ?? 0)} duty, against ${coins(x.cost)}`
                        : html`, ${x.rose === "away" ? "they got away" : "lost"}`}</span
                    >
                  </h4>
                  ${manifest(ui, x)}`,
            )}`,
          )
        : nothing}`,
  );
}

function logList(v: TradeVoyage): TemplateResult {
  return more(
    html`<span class="small">The voyage, day by day (${v.log.length})</span>`,
    html`<ul class="small cq-bond-record">
      ${v.log.map(
        (x) => html`<li><span class="cq-muted">${formatDate(x.day)}</span> ${x.t}</li>`,
      )}
    </ul>`,
  );
}

// ---------------------------------------------------------------- someone held, on their own page

/** A bound person's page: who they are, where they live and work, their family, and (yours) what they think of you. */
export function boundPersonPage(ui: GameUi, c: Character): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const m = c.bond!;
  const holder = s.lives.find((l) => l.seat === m.seat);
  const mine = !!life && holder?.seat === life.seat;
  const op = mine && life!.c >= 0 ? opinionOf(s, c, life!) : null;
  const where = ui.map.provinces[m.at]?.name ?? "somewhere";
  const shop = m.work === "biz" ? (holder?.property ?? []).find((x) => x.id === m.biz) : undefined;
  const fam = [c.spouse, c.mother, c.father, ...c.children]
    .map((id) => s.chars[id])
    .filter((x): x is Character => !!x);
  const rel = (f: Character) =>
    c.spouse === f.id
      ? f.female
        ? "wife"
        : "husband"
      : c.mother === f.id
        ? "mother"
        : c.father === f.id
          ? "father"
          : f.female
            ? "daughter"
            : "son";
  const work =
    m.work === "biz"
      ? `at work at ${mine ? "your" : "the"} ${shop?.name ?? "business"}`
      : m.work === "fields"
        ? "at work in the fields"
        : m.work === "house"
          ? "at work in the house"
          : m.work === "craft"
            ? "at a trade, hired out in the town"
            : "not at work";
  return html`<header class="cq-sheet-top">
      ${token(ui, c, "xl")}
      <div class="cq-sheet-who">
        <p class="cq-kicker">
          ${m.status === "indenture" ? "Bound by indenture" : "Held in bondage"}${mine
            ? " in your household"
            : holder
              ? ` in ${holder.name}'s household`
              : ""}
        </p>
        <h2 class="cq-h1">${bondFullName(c)}</h2>
        <p class="cq-muted small">
          ${ageOf(s, c)}; ${ORIGIN_NAMES[m.origin]}${m.faith === "islam"
            ? "; a Muslim"
            : m.faith === "christian"
              ? "; a Christian"
              : ""}.
        </p>
        <p class="cq-where small">
          Lives at ${provLink(ui, m.at)}, <i>${work}</i>.
        </p>
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
        </div>`
      : nothing}
    ${section(
      "Their life",
      html`<p class="small">
          Health ${bar(m.health / 100)} ${healthWord(m.health)}${mine
            ? html`; how ${c.female ? "she bears" : "he bears"} it
                ${bar(m.mood / 100)} ${moodWord(m.mood)}`
            : nothing}.
          Fieldwork ${m.sk.field}, housework ${m.sk.house}, a trade ${m.sk.craft}.
          ${m.status === "indenture" && m.until
            ? html`${Math.max(0, Math.round((m.until - s.day) / 30))} months of the
              indenture left.`
            : nothing}
        </p>
        ${fam.length
          ? html`<p class="small">
              Family:
              ${fam.map(
                (f, i) =>
                  html`${i ? "; " : ""}${rel(f)} <b>${bondName(f)}</b>${!f.alive
                      ? " †"
                      : f.bond?.at !== undefined && f.bond.at !== m.at
                        ? html` <span class="cq-muted"
                            >(at ${ui.map.provinces[f.bond.at]?.name ?? "another estate"})</span
                          >`
                        : f.bond?.status === "free"
                          ? html` <span class="cq-muted">(free)</span>`
                          : nothing}`,
              )}
            </p>`
          : nothing}
        <p class="small cq-muted">
          ${mine
            ? "Not someone to court, hire, challenge or bargain with: their place is yours to answer for. Estate › Bondage has their card: hear them out, how they're kept, their work, freedom."
            : `Not free to be dealt with as a free person: ${where} holds them as the law there allows.`}
        </p>
        ${mine
          ? html`<div class="cq-btnrow">
              ${action(
                "Estate › Bondage",
                { ok: true },
                () => ui.open({ k: "tab", tab: "estate", sub: "bondage" }),
                "small",
              )}
            </div>`
          : nothing}`,
    )}`;
}

/** Whether a page should be a bound person's (Sheet.ts asks). */
export function showBoundPage(c: Character | undefined): boolean {
  return !!c?.alive && isBound(c);
}
