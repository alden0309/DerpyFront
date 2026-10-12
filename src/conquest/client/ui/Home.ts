// HOME (r12): the Home place, the heart of your household. Before you own a
// house it's your lodgings (where you lodge by the way you live, and what of
// your living goes on rent), with every house you could buy or rent here.
// Once you have one: the house itself on a card (its level and what it gives
// you), the family (an evening together, time with your husband or wife,
// playing with the children, teaching them), rest and study, gatherings and
// letters, the house's rooms, furniture, servants, lodgers and stores, your
// other properties, and where everything else money buys is to be had.

import { html, nothing, svg, TemplateResult } from "lit";
import { areaName, areasOf } from "../../engine/Areas";
import { formatDate } from "../../engine/Calendar";
import { Explain } from "../../engine/Explain";
import {
  furnishName,
  homeCheck,
  housesOf,
  kidsAtHome,
  leaseRent,
  spouseAtHome,
  storedLoads,
  storeRoom,
  teachable,
} from "../../engine/Household";
import {
  extrasWorth,
  FURNISH,
  furnishCap,
  furnishCost,
  houseCoins,
  houseComforts,
  LET_RENT,
  LODGER_RENT,
  lodgerRoom,
  LODGING_SHARE,
  LODGINGS,
  ratesOn,
  ROOM_ORDER,
  roomFor,
  ROOMS,
  SERVANT_ORDER,
  servantRoom,
  SERVANTS,
  TEACH_MAX,
} from "../../engine/HouseRules";
import { ACT_BY_KEY, actCheck, actLabel } from "../../engine/LifeActs";
import {
  hasKit,
  isChildLife,
  lifeIsNative,
  lifestyleCost,
  meOf,
  skillLevel,
  stationOf,
} from "../../engine/LifeQueries";
import {
  HOUSES,
  KIT,
  LIFESTYLE,
  LODGES,
  SKILL_NAMES,
  type HouseDef,
} from "../../engine/LifeRules";
import {
  houseCheck,
  houseOf,
  housePrice,
  leaseCheck,
  propertyOf,
  propertyWorth, // LEDGER (r15)
} from "../../engine/Property";
import { ageOf } from "../../engine/Queries";
import type {
  Character,
  HomeCommand,
  PlaceKind,
  Property,
  Skill,
} from "../../engine/Types";
import { GOODS, SKILLS } from "../../engine/Types";
import { WARES } from "../../engine/Wares";
import { play } from "../Sound";
import { GOOD_NAMES } from "../Text";
import { num } from "../Tip";
import { breakdownTip, GameUi, section, token } from "./Context";
import { actButton, runAct } from "./Here";
import { price, splitPrice } from "./Price"; // LEDGER (r15)
import { homeSchooling } from "./Schooling"; // EDU (r13)
import { hostAt } from "./Society";

// ---------------------------------------------------------------- doing things at home

type HomeAct = Omit<HomeCommand, "k">;

async function home(ui: GameUi, c: HomeAct, scene = true): Promise<void> {
  if (await ui.cmd({ k: "home", ...c })) {
    if (/^(buy|lease|room|furnish|servant)$/.test(c.act)) play("coins");
    if (scene) ui.modal({ k: "outcome" });
  }
}

function homeButton(
  ui: GameUi,
  label: string | TemplateResult,
  c: HomeAct,
  o: { cost?: number; title?: string; cls?: string; scene?: boolean } = {},
): TemplateResult {
  const check = homeCheck(ui.s, ui.life!, c);
  return actButton({
    label,
    ok: check.ok,
    why: check.ok ? null : check.why,
    cost: o.cost,
    have: ui.life!.purse, // LEDGER (r15)
    cls: o.cls,
    title: check.ok ? (o.title ?? "") : `${check.why} ${o.title ?? ""}`,
    run: () => void home(ui, c, o.scene ?? true),
  });
}

/** One of the old place acts (the tutor, a dinner), as a button here. */
function actHere(ui: GameUi, key: string): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const def = ACT_BY_KEY.get(key)!;
  const check = actCheck(s, ui.w, life, "home", key);
  // LEDGER (r15): the cost in its chip, not the words.
  const { text: label, cost } = splitPrice(actLabel(s, life, def));
  return actButton({
    label,
    ok: check.ok,
    cost: cost ?? def.cost ?? undefined,
    have: life.purse,
    why: check.ok ? null : check.why,
    title: check.ok ? def.text : `${check.why} ${def.text}`,
    run: () => runAct(ui, "home", key),
  });
}

// ---------------------------------------------------------------- the house, drawn

/** A house in the engraver's line, by its size (1 to 4), or a lodge. */
export function houseArt(level: number, native: boolean): TemplateResult {
  const l = Math.max(0, Math.min(4, level));
  const ink = "#3a2716";
  if (native)
    return html`<svg
      class="cq-house-art"
      viewBox="0 0 120 70"
      aria-hidden="true"
    >
      <path d="M2 64 H118" stroke=${ink} stroke-width="1.2" />
      ${l === 0
        ? svg`<path
              d="M30 64 Q60 18 90 64"
              fill="#e9d9b0"
              stroke=${ink}
              stroke-width="1.4"
            />
            <path d="M54 64 Q60 48 66 64" fill="#3a2716" />`
        : l === 1
          ? svg`<path
                d="M34 64 Q60 16 86 64 Z"
                fill="#d9c08b"
                stroke=${ink}
                stroke-width="1.4"
              />
              <path
                d="M42 40 Q60 30 78 40 M38 50 Q60 40 82 50"
                fill="none"
                stroke=${ink}
                stroke-width="0.8"
              />
              <path d="M54 64 Q60 50 66 64" fill=${ink} />
              <path d="M60 18 L56 8 M60 18 L64 7" stroke=${ink} />`
          : svg`<path
                d="M${l === 2 ? 26 : l === 3 ? 12 : 4} 64 V40 Q60 ${
                  l === 4 ? 6 : 14
                } ${l === 2 ? 94 : l === 3 ? 108 : 116} 40 V64 Z"
                fill="#d9c08b"
                stroke=${ink}
                stroke-width="1.4"
              />
              ${Array.from(
                { length: l + 2 },
                (_, i) =>
                  svg`<path
                    d="M${
                      (l === 2 ? 30 : l === 3 ? 16 : 8) +
                      i * (l === 2 ? 16 : l === 3 ? 18 : 22)
                    } 64 V44"
                    stroke=${ink}
                    stroke-width="0.6"
                  />`,
              )}
              <rect x="54" y="50" width="12" height="14" fill=${ink} />
              <path
                d="M${l === 4 ? 40 : 50} 22 v-8 M${l === 4 ? 80 : 70} 22 v-8"
                stroke=${ink}
                stroke-width="1"
              />`}
    </svg>`;
  // Colonists: a cottage, a house, a fine house, a mansion.
  const W = [0, 50, 64, 84, 110][l];
  const x0 = 60 - W / 2;
  const wall = l >= 3 ? "#e2cfa4" : "#ead9b2";
  const roofH = [0, 22, 18, 16, 16][l];
  const wallTop = [0, 36, 30, 26, 24][l];
  const windows = (row: number, n: number) =>
    Array.from({ length: n }, (_, i) => {
      const step = W / (n + 1);
      const x = x0 + step * (i + 1) - 4;
      return svg`<rect
          x=${x}
          y=${row}
          width="8"
          height="9"
          fill="#7a6a4a"
          stroke=${ink}
          stroke-width="0.8"
        /><path
          d="M${x + 4} ${row} v9 M${x} ${row + 4.5} h8"
          stroke="#e9dcb8"
          stroke-width="0.6"
        />`;
    });
  return html`<svg class="cq-house-art" viewBox="0 0 120 70" aria-hidden="true">
    <path d="M2 64 H118" stroke=${ink} stroke-width="1.2" />
    ${l === 0
      ? svg`<path
            d="M40 64 V36 H80 V64 M36 36 L60 20 L84 36"
            fill="none"
            stroke=${ink}
            stroke-width="1.2"
            stroke-dasharray="3 3"
          />
          <text
            x="60"
            y="54"
            text-anchor="middle"
            font-size="9"
            font-family="IM Fell English, serif"
            fill=${ink}
          >
            to let
          </text>`
      : svg`<rect
            x=${x0}
            y=${wallTop}
            width=${W}
            height=${64 - wallTop}
            fill=${wall}
            stroke=${ink}
            stroke-width="1.4"
          />
          <path
            d="M${x0 - 4} ${wallTop} L${l >= 3 ? x0 + 10 : 60} ${
              wallTop - roofH
            } ${l >= 3 ? `L${x0 + W - 10} ${wallTop - roofH}` : ""} L${
              x0 + W + 4
            } ${wallTop} Z"
            fill=${l >= 3 ? "#8a6a4a" : "#b39058"}
            stroke=${ink}
            stroke-width="1.4"
          />
          ${
            l === 1
              ? svg`<path
                d="M${x0 - 2} ${wallTop - 4} L60 ${wallTop - roofH + 2} L${
                  x0 + W + 2
                } ${wallTop - 4}"
                fill="none"
                stroke=${ink}
                stroke-width="0.5"
                stroke-dasharray="1 2"
              />`
              : nothing
          }
          <rect
            x=${x0 + W * 0.7}
            y=${wallTop - roofH - 4}
            width="6"
            height=${roofH}
            fill="#8a5a3a"
            stroke=${ink}
            stroke-width="1"
          />
          ${
            l >= 2
              ? windows(wallTop + 6, l === 2 ? 4 : l === 3 ? 5 : 7)
              : nothing
          }
          ${windows(
            l >= 2 ? 50 : 46,
            l === 1 ? 2 : l === 2 ? 4 : l === 3 ? 4 : 6,
          )}
          <rect
            x="56"
            y=${l >= 2 ? 50 : 48}
            width="8"
            height=${l >= 2 ? 14 : 16}
            fill="#4a3220"
            stroke=${ink}
            stroke-width="0.8"
          />
          ${
            l === 4
              ? svg`<path
                  d="M50 ${wallTop} L60 ${wallTop - 9} L70 ${wallTop} Z"
                  fill=${wall}
                  stroke=${ink}
                />
                <path d="M53 50 v14 M67 50 v14" stroke=${ink} />`
              : nothing
          }`}
  </svg>`;
}

/** I · II · III · IV, the ones you have darker. */
function pips(level: number, of = 4): TemplateResult {
  return html`<span
    class="cq-house-pips"
    aria-label=${`Level ${level} of ${of}`}
    >${Array.from(
      { length: of },
      (_, i) =>
        html`<i class=${i < level ? "on" : ""}
          >${["I", "II", "III", "IV"][i]}</i
        >`,
    )}</span
  >`;
}

// ---------------------------------------------------------------- what a house gives

function signed(v: number, digits = 1): string {
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}`;
}

/** Everything a house gives and costs a month, as chips and a figure. */
function gives(
  ui: GameUi,
  pr: Property,
  isHome: boolean,
): { chips: TemplateResult; coins: TemplateResult } {
  const s = ui.s;
  const life = ui.life!;
  const native = lifeIsNative(s, life);
  const def = (native ? LODGES : HOUSES)[pr.level - 1];
  const me = meOf(s, life);
  const kids = (me?.children ?? []).filter((k) => {
    const c = s.chars[k];
    return !!c?.alive && ageOf(s, c) < 12;
  }).length;
  const extra = houseComforts(pr, { native, kids });
  const lives = isHome && !pr.let;
  const stress = lives ? def.stress + extra.stress : 0;
  const renown = lives ? def.renown + extra.renown : 0;
  const health = lives ? def.health + extra.health : 0;
  const e = new Explain();
  if (!pr.leased) e.add(`Upkeep: ${def.name.toLowerCase()}`, -def.upkeep);
  const rates = ratesOn(pr, native);
  if (rates) e.add("Rates", -rates);
  houseCoins(e, pr, {
    native,
    home: isHome,
    horse: hasKit(s, life, "horse"),
  });
  const coins = e.done(2);
  const chip = (v: number, what: string, good: boolean) =>
    v
      ? html`<span class="cq-give ${good ? "good" : "bad"}"
          >${signed(v, 2)} ${what}</span
        >`
      : nothing;
  return {
    chips: html`${chip(stress, "stress", stress < 0)}
    ${chip(renown, "renown", renown > 0)} ${chip(health, "health", health > 0)}
    ${!lives
      ? html`<span class="cq-give quiet"
          >${pr.let ? "let to a tenant" : "you don't live here"}</span
        >`
      : nothing}`,
    coins: num(
      `${coins.total >= 0 ? "+" : "−"}${Math.abs(coins.total).toFixed(1)} a month`,
      () => breakdownTip(`Your ${pr.name.toLowerCase()}, a month`, coins),
      `cq-house-coins ${coins.total >= 0 ? "good" : "bad"}`,
    ),
  };
}

/** The card of a house: drawn, named, its level, what it gives. */
export function houseCard(
  ui: GameUi,
  pr: Property,
  o: { compact?: boolean } = {},
): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const native = lifeIsNative(s, life);
  const isHome = pr.prov === life.home;
  const where = ui.map.provinces[pr.prov]?.name ?? "";
  const g = gives(ui, pr, isHome);
  const rooms = (pr.rooms ?? [])
    .map((r) => roomFor(r, native)?.name)
    .filter(Boolean) as string[];
  const servants = (pr.servants ?? []).map((k) =>
    SERVANTS[k].name.replace(/^An? /, ""),
  );
  return html`<article
    class="cq-house-card ${isHome ? "home" : ""} ${o.compact ? "compact" : ""}"
  >
    <div class="cq-house-pic">
      ${houseArt(pr.level, native)} ${pips(pr.level)}
    </div>
    <div class="cq-house-body">
      <p class="cq-house-kicker">
        ${isHome
          ? pr.leased
            ? "Your home, rented"
            : "Your home"
          : pr.let
            ? "Let to a tenant"
            : pr.leased
              ? "Rented"
              : "Your house"}
        · ${where}
      </p>
      <h4 class="cq-house-name">${pr.name}</h4>
      <p class="cq-house-line small">
        ${furnishName(pr.furnish ?? 0, native)}${rooms.length
          ? `; ${rooms.map((r) => r.replace(/^An? /, "").toLowerCase()).join(", ")}`
          : ""}${servants.length
          ? `; ${servants.length === 1 ? "a" : servants.length} servant${servants.length === 1 ? "" : "s"}`
          : ""}${pr.lodgers
          ? `; ${pr.lodgers} lodger${pr.lodgers === 1 ? "" : "s"}`
          : ""}.
        <span class="cq-muted">Since ${formatDate(pr.since)}.</span>
      </p>
      <p class="cq-house-gives">${g.chips} ${g.coins}</p>
    </div>
  </article>`;
}

// ---------------------------------------------------------------- the Home tile

/** What the Home tile says: your cottage, or your lodgings. */
export function homeTileName(ui: GameUi, p: number): string {
  const life = ui.life;
  if (!life) return "Home";
  const h = houseOf(life, p);
  if (!h) return lifeIsNative(ui.s, life) ? "Your place" : "Your lodgings";
  return `Your ${h.name.toLowerCase()}`;
}

/** The line under the Home banner. */
export function homeBanner(ui: GameUi, p: number): string {
  const life = ui.life!;
  const h = houseOf(life, p);
  if (!h)
    return lifeIsNative(ui.s, life)
      ? "A place at a kinsman's fire, until you build your own."
      : "A roof over your head, if not your own: lodgings, until you buy or rent a house.";
  return lifeIsNative(ui.s, life)
    ? "Your own fire, your own people, and nobody's business but yours."
    : "Your own door, your own fire, your own people, and nobody's business but yours.";
}

export function homeTileSub(ui: GameUi, p: number): string {
  const life = ui.life!;
  const h = houseOf(life, p);
  if (!h) return "no house yet";
  const lv = ["", "I", "II", "III", "IV"][h.level];
  return `${lv} of IV${h.leased ? ", rented" : ""}${p !== life.home ? ", not home" : ""}`;
}

// ---------------------------------------------------------------- the Home place

/** What you can do at home (it replaces the place's list of acts). */
export function homePlace(ui: GameUi, p: number): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  if (life.travel) return html``;
  const child = isChildLife(s, life);
  const h = houseOf(life, p);
  const isHome = life.home === p;
  return html`<div class="cq-hearth">
    ${h ? houseCard(ui, h) : lodgingsCard(ui)}
    ${!isHome && h
      ? html`<div class="cq-callout small">
          <p>
            Your household lives at
            ${ui.map.provinces[life.home]?.name ?? "your home"}. Make this house
            your home and they'll come here.
          </p>
          ${homeButton(ui, "Make this your home", { act: "move" })}
        </div>`
      : nothing}
    <h4 class="cq-area-h">Things to do</h4>
    ${familyBlock(ui, isHome, child)} ${restBlock(ui, h)}
    ${child ? nothing : societyBlock(ui, isHome)}
    ${child
      ? nothing
      : html`<div class="cq-folds cq-home-folds">
          ${h && !h.let ? houseFolds(ui, h) : nothing} ${buyFold(ui, h)}
          ${otherProperty(ui, p)} ${moneyBuys(ui)}
        </div>`}
  </div>`;
}

function lodgingsCard(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const native = lifeIsNative(s, life);
  const lodging = LODGINGS[life.lifestyle][native ? "native" : "colonist"];
  const living = lifestyleCost(s, life).total;
  const rent = Math.round(living * LODGING_SHARE * 10) / 10;
  const station = stationOf(s, life);
  const wants = station.level >= 2;
  return html`<article class="cq-house-card lodging">
    <div class="cq-house-pic">${houseArt(0, native)}</div>
    <div class="cq-house-body">
      <p class="cq-house-kicker">
        ${native ? "Your place" : "Your lodgings"} ·
        ${ui.map.provinces[life.prov]?.name ?? ""}
      </p>
      <h4 class="cq-house-name">${lodging}</h4>
      <p class="cq-house-line small">
        ${native
          ? html`You share a kinsman's fire as you live
            (${LIFESTYLE[life.lifestyle].nativeName.toLowerCase()}).`
          : html`Your rent is part of your living
            (${LIFESTYLE[life.lifestyle].name.toLowerCase()}):
            ${num(`about ${rent} a month`, () =>
              breakdownTip("Living costs", lifestyleCost(s, life)),
            )}
            of the ${Math.round(living * 10) / 10} you spend.`}
        Live better and you lodge better (Estate › Purse).
      </p>
      <p class="cq-house-gives">
        <span class="cq-give quiet">no house of your own</span>
        ${wants
          ? html`<span
              class="cq-give bad"
              title=${`${station.who[0].toUpperCase()}${station.who.slice(1)} is expected to keep a house at home.`}
              >your station expects a house</span
            >`
          : nothing}
      </p>
    </div>
  </article>`;
}

function familyBlock(
  ui: GameUi,
  isHome: boolean,
  child: boolean,
): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const sp = spouseAtHome(s, life);
  const kids = kidsAtHome(s, life, 15, 5);
  const little = kidsAtHome(s, life, 13);
  const parts: TemplateResult[] = [
    homeButton(
      ui,
      "An evening with the family",
      { act: "evening" },
      {
        title:
          "Supper, a story, the children put to bed. Cares fall away; your family remembers it.",
      },
    ),
  ];
  if (!child) {
    parts.push(
      homeButton(
        ui,
        sp ? `Time with ${sp.first}, the two of you` : "Time with your spouse",
        { act: "spouse" },
        {
          title:
            "A walk, a long dinner, an evening by the fire: your husband or wife thinks the better of you, and your cares ease.",
        },
      ),
      homeButton(
        ui,
        "Play with the children",
        { act: "children" },
        {
          title:
            "An afternoon of games and stories: the little ones love you for it, and you forget your troubles.",
        },
      ),
    );
  }
  return html`<p class="cq-act-group">The family</p>
    <div class="cq-acts">${parts}</div>
    ${!child && isHome && kids.length ? teachBlock(ui, kids) : nothing}
    ${!child && isHome ? homeSchooling(ui) : nothing}
    ${!child && isHome && !sp && !little.length && !kids.length
      ? html`<p class="cq-muted small cq-pad">
          A household of one. Marry (the church's <i>Seek a match</i>, then
          court) and fill it.
        </p>`
      : nothing}`;
}

/** The skill picked for each child, while you look. */
const teachPick = new Map<number, Skill>();

function teachBlock(ui: GameUi, kids: Character[]): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const h = houseOf(life, life.home);
  const nursery = (h?.rooms ?? []).includes("nursery");
  return html`<ul class="cq-teach">
    ${kids.map((k) => {
      const can = teachable(s, life, k);
      const pick =
        teachPick.get(k.id) && can.includes(teachPick.get(k.id)!)
          ? teachPick.get(k.id)!
          : can[0];
      const got = Object.entries(k.taught ?? {})
        .filter(([, v]) => (v ?? 0) > 0)
        .map(
          ([sk, v]) =>
            `${SKILL_NAMES[sk as Skill].toLowerCase()} ${v}/${TEACH_MAX}`,
        );
      const check = homeCheck(s, life, { act: "teach", c: k.id, kind: pick });
      return html`<li>
        ${token(ui, k, "small")}
        <span class="cq-folk-text">
          <b>${k.first}, ${ageOf(s, k)}</b>
          <span class="cq-muted small"
            >${got.length
              ? `Taught: ${got.join(", ")}`
              : "Nothing taught yet"}${nursery
              ? " · the nursery helps"
              : ""}</span
          >
        </span>
        <span class="cq-teach-do">
          <select
            aria-label=${`What to teach ${k.first}`}
            ?disabled=${!can.length}
            @change=${(e: Event) => {
              teachPick.set(
                k.id,
                (e.target as HTMLSelectElement).value as Skill,
              );
              ui.redraw();
            }}
          >
            ${can.length
              ? can.map(
                  (sk) =>
                    html`<option value=${sk} ?selected=${sk === pick}>
                      ${SKILL_NAMES[sk]} (you ${skillLevel(s, life, sk)})
                    </option>`,
                )
              : html`<option>Nothing you know well enough</option>`}
          </select>
          <button
            class="cq-btn small"
            ?disabled=${!check.ok || !pick}
            title=${check.ok ? "A month of lessons at home" : check.why}
            @click=${() => void home(ui, { act: "teach", c: k.id, kind: pick })}
          >
            Teach
          </button>
        </span>
        ${!check.ok && /Again/.test(check.why)
          ? html`<span class="cq-act-why">${check.why}</span>`
          : nothing}
      </li>`;
    })}
    <li class="cq-teach-note cq-muted small">
      What you teach them stays with them: if one becomes your heir, they start
      with it in their skills.
    </li>
  </ul>`;
}

let studyPick: Skill = "letters";

function restBlock(ui: GameUi, h: Property | undefined): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const room = (h?.rooms ?? []).includes("study");
  const check = homeCheck(s, life, { act: "study", kind: studyPick });
  return html`<p class="cq-act-group">Rest and study</p>
    <div class="cq-acts">
      ${homeButton(
        ui,
        h ? "Rest and recover" : "Rest in your lodgings",
        { act: "rest" },
        {
          title: h
            ? "A week by your own fire: health and calm return (more with a cook, good furniture and a garden)."
            : "A few quiet days: a little health and calm.",
        },
      )}
      ${isChildLife(s, life) ? nothing : actHere(ui, "lessons")}
    </div>
    <div class="cq-study">
      <label class="small"
        >${room ? "Study in your study" : h ? "Study by the fire" : "Study"}
        <select
          aria-label="What to study"
          @change=${(e: Event) => {
            studyPick = (e.target as HTMLSelectElement).value as Skill;
            ui.redraw();
          }}
        >
          ${SKILLS.map(
            (sk) =>
              html`<option value=${sk} ?selected=${sk === studyPick}>
                ${SKILL_NAMES[sk]}
              </option>`,
          )}
        </select></label
      >
      <button
        class="cq-btn small"
        ?disabled=${!check.ok}
        title=${check.ok
          ? room
            ? "Twice as far, in a study of your own"
            : "An evening's reading"
          : check.why}
        @click=${() => void home(ui, { act: "study", kind: studyPick })}
      >
        Study
      </button>
      <span class="cq-muted small"
        >${check.ok
          ? room
            ? "A study doubles it."
            : h
              ? "A study would double it."
              : "A house would help."
          : check.why}</span
      >
    </div>`;
}

function societyBlock(ui: GameUi, isHome: boolean): TemplateResult {
  return html`<p class="cq-act-group">Society and letters</p>
    <div class="cq-acts">
      ${isHome
        ? actButton({
            label: "Give a gathering here…",
            ok: true,
            title:
              "A dinner, a feast, a ball, a wedding: a parlour, good furniture and a cook give it a better start",
            run: () => hostAt(ui, "home"),
          })
        : nothing}
      ${actHere(ui, "dinner")}
      ${actButton({
        label: "Sit down to write a letter",
        ok: true,
        title: "To anyone, anywhere: your writing desk",
        run: () => ui.modal({ k: "write" }),
      })}
      ${actButton({
        label: "Your letters",
        ok: true,
        run: () => ui.open({ k: "tab", tab: "society", sub: "letters" }),
      })}
    </div>`;
}

// ---------------------------------------------------------------- the house's folds

/** Which folds are open, by key; they never open or close by themselves. */
const folds = new Map<string, boolean>();

function fold(
  key: string,
  title: string,
  count: string,
  body: TemplateResult,
  open = false,
): TemplateResult {
  return html`<details
    class="cq-fold"
    ?open=${folds.get(key) ?? open}
    @toggle=${(e: Event) =>
      folds.set(key, (e.currentTarget as HTMLDetailsElement).open)}
  >
    <summary>
      <span class="cq-fold-title">${title}</span>
      <span class="cq-fold-n">${count}</span>
    </summary>
    <div class="cq-fold-body">${body}</div>
  </details>`;
}

function houseFolds(ui: GameUi, h: Property): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const native = lifeIsNative(s, life);
  const rooms = ROOM_ORDER.filter((r) => roomFor(r, native));
  const have = h.rooms ?? [];
  const next = (h.furnish ?? 0) + 1;
  const cap = furnishCap(h.level);
  const servants = h.servants ?? [];
  const kept = Object.entries(h.store ?? {}).filter(([, v]) => (v ?? 0) > 0);
  const carry = [
    ...GOODS.filter((g) => (life.goods[g] ?? 0) > 0).map((g) => ({
      id: g as string,
      name: GOOD_NAMES[g],
      n: life.goods[g] ?? 0,
    })),
    ...Object.entries(life.wares ?? {})
      .filter(([, v]) => (v ?? 0) > 0)
      .map(([k, v]) => ({
        id: k,
        name: WARES[k as keyof typeof WARES]?.name ?? k,
        n: v ?? 0,
      })),
  ];
  const itemName = (id: string) =>
    GOOD_NAMES[id as keyof typeof GOOD_NAMES] ??
    WARES[id as keyof typeof WARES]?.name ??
    id;
  return html`${fold(
    "home:rooms",
    native ? "Its grounds and additions" : "Rooms and grounds",
    `${have.length} of ${rooms.length}`,
    html`<ul class="cq-home-list">
      ${rooms.map((r) => {
        const def = roomFor(r, native)!;
        const built = have.includes(r);
        return html`<li class=${built ? "built" : ""}>
          <span class="cq-home-mark" aria-hidden="true"
            >${built ? "✓" : "◦"}</span
          >
          <span class="cq-folk-text">
            <b>${def.name}</b>
            <span class="cq-muted small"
              >${def.text}${ROOMS[r].upkeep
                ? ` Upkeep ${ROOMS[r].upkeep} a month.`
                : ""}</span
            >
          </span>
          ${built
            ? html`<span class="cq-chip good">built</span>`
            : homeButton(
                ui,
                "Add",
                { act: "room", kind: r },
                {
                  cls: "slim",
                  cost: def.cost, // LEDGER (r15)
                },
              )}
        </li>`;
      })}
    </ul>`,
    have.length === 0,
  )}
  ${fold(
    "home:furnish",
    "Furniture",
    furnishName(h.furnish ?? 0, native),
    html`<ol class="cq-home-ladder">
        ${FURNISH.map(
          (f, i) =>
            html`<li
              class="${i <= (h.furnish ?? 0) ? "done" : ""} ${i > cap
                ? "beyond"
                : ""}"
            >
              <b>${native ? f.nativeName : f.name}</b>
              <span class="cq-muted small"
                >${i ? `${furnishCost(i, native)} coins. ` : ""}${f.text}
                ${f.stress
                  ? `${signed(f.stress)} stress a month`
                  : ""}${f.renown ? `, ${signed(f.renown)} renown` : ""}${i >
                cap
                  ? " (a bigger house)"
                  : ""}</span
              >
            </li>`,
        )}
      </ol>
      ${next <= 3
        ? homeButton(
            ui,
            `Furnish: ${furnishName(next, native).toLowerCase()}`,
            { act: "furnish" },
            { cost: furnishCost(next, native) }, // LEDGER (r15)
          )
        : nothing}`,
  )}
  ${native
    ? nothing
    : fold(
        "home:servants",
        "Servants",
        `${servants.length} of ${servantRoom(h)}`,
        html`<ul class="cq-home-list">
          ${SERVANT_ORDER.map((k) => {
            const d = SERVANTS[k];
            const kept = servants.includes(k);
            return html`<li class=${kept ? "built" : ""}>
              <span class="cq-home-mark" aria-hidden="true"
                >${kept ? "✓" : "◦"}</span
              >
              <span class="cq-folk-text">
                <b>${d.name}</b>
                <span class="cq-muted small">${d.wage} a month. ${d.text}</span>
              </span>
              ${kept
                ? html`<button
                    class="cq-btn small quiet"
                    @click=${() =>
                      void home(ui, { act: "dismiss", kind: k }, false)}
                  >
                    Let go
                  </button>`
                : homeButton(
                    ui,
                    html`Hire${price(d.wage, { per: "month" })}`,
                    { act: "servant", kind: k },
                    {
                      cls: "slim",
                    },
                  )}
            </li>`;
          })}
        </ul>`,
      )}
  ${native || h.leased
    ? nothing
    : fold(
        "home:lodgers",
        "Lodgers",
        `${h.lodgers ?? 0} of ${lodgerRoom(h.level)}`,
        html`<p class="small">
            A lodger pays ${LODGER_RENT} a month and costs you a little peace
            (+1 stress a month each).
          </p>
          <div class="cq-acts">
            ${homeButton(
              ui,
              html`Take in a
              lodger${price(LODGER_RENT, {
                gain: true,
                per: "month",
              })}`,
              { act: "lodger" },
            )}
            ${(h.lodgers ?? 0) > 0
              ? homeButton(
                  ui,
                  "Give a lodger notice",
                  { act: "nolodger" },
                  {
                    scene: false,
                  },
                )
              : nothing}
          </div>`,
      )}
  ${fold(
    "home:store",
    "Kept at home",
    `${storedLoads(h)} of ${storeRoom(h)} loads`,
    html`${kept.length
      ? html`<ul class="cq-home-list">
          ${kept.map(
            ([id, n]) =>
              html`<li>
                <span class="cq-folk-text"
                  ><b>${n} ${itemName(id).toLowerCase()}</b></span
                >
                ${homeButton(
                  ui,
                  "Take 1",
                  { act: "take", item: id, qty: 1 },
                  {
                    cls: "slim",
                    scene: false,
                  },
                )}
                ${(n ?? 0) > 1
                  ? homeButton(
                      ui,
                      "Take all",
                      { act: "take", item: id, qty: n },
                      { cls: "slim", scene: false },
                    )
                  : nothing}
              </li>`,
          )}
        </ul>`
      : html`<p class="cq-muted small">
          Nothing kept here. Goods kept at home don't count against what you
          carry.
        </p>`}
    ${carry.length
      ? html`<p class="cq-act-group">Put away what you carry</p>
          <ul class="cq-home-list">
            ${carry.map(
              (x) =>
                html`<li>
                  <span class="cq-folk-text"
                    ><b>${x.n} ${x.name.toLowerCase()}</b></span
                  >
                  ${homeButton(
                    ui,
                    "Put away",
                    { act: "store", item: x.id, qty: x.n },
                    { cls: "slim", scene: false },
                  )}
                </li>`,
            )}
          </ul>`
      : nothing}`,
  )}
  ${sellFold(ui, h)}`;
}

/** Selling the house (or giving up the lease): what it's worth, and the button. */
function sellFold(ui: GameUi, h: Property): TemplateResult {
  const worth = propertyWorth(ui.s, ui.life!, h); // LEDGER (r15): what selling pays
  const kept = storedLoads(h) > 0;
  const word = h.leased
    ? "Give up the lease"
    : html`Sell it${price(worth, { gain: true })}`;
  return fold(
    "home:sell",
    h.leased ? "Give up the lease" : "Sell the house",
    h.leased ? "rented" : `${worth}`,
    html`<p class="small">
        ${h.leased
          ? "You hand back the keys: no more rent, and nothing back."
          : "Half of what the house cost, and half of what you put into its rooms and furniture. The servants and lodgers go with it."}
        ${h.prov === ui.life!.home ? " You'll be back in lodgings here." : ""}
      </p>
      <div class="cq-acts">
        ${actButton({
          label: word,
          ok: !kept,
          cls: "rough",
          why: kept ? "Take out what you keep there first." : null,
          run: () => {
            if (
              confirm(
                h.leased
                  ? `Give up the lease on the ${h.name.toLowerCase()}?`
                  : `Sell the ${h.name.toLowerCase()} for ${worth} coins?`,
              )
            )
              void ui.cmd({ k: "property", act: "sell", id: h.id });
          },
        })}
      </div>`,
  );
}

// ---------------------------------------------------------------- buying or renting a house here

function buyFold(ui: GameUi, h: Property | undefined): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const native = lifeIsNative(s, life);
  const defs: HouseDef[] = native ? LODGES : HOUSES;
  const owned = h && !h.leased ? h.level : 0;
  if (owned >= defs.length) return html``;
  const here = ui.map.provinces[life.prov]?.name ?? "";
  return fold(
    "home:buy",
    h
      ? native
        ? "A bigger lodge"
        : "A better house"
      : native
        ? "Build a lodge of your own"
        : "A house of your own",
    h ? `${defs.length - owned} better` : `from ${defs[0].cost}`,
    html`<p class="small">
        ${native
          ? `Built by your kin and neighbours at ${here}: you pay for the feast and the bark.`
          : `In ${here}. Buy one outright (a better one takes half the old one's worth off the price), or rent one by the month. Your household moves in with you.`}
      </p>
      <ul class="cq-house-offers">
        ${defs.map((d, i) => {
          const level = i + 1;
          if (level <= owned) return nothing;
          const buy = houseCheck(s, life, level);
          const cost = housePrice(s, life, level);
          // Renting is for those without a house of their own here.
          const lease = native || owned ? null : leaseCheck(s, life, level);
          const rented = h?.leased && h.level === level;
          return html`<li>
            <span class="cq-house-offer-pic">${houseArt(level, native)}</span>
            <span class="cq-folk-text">
              <b>${d.name}</b>
              <span class="cq-muted small"
                >${signed(d.stress)}
                stress${d.renown
                  ? `, ${signed(d.renown)} renown`
                  : ""}${d.health ? `, ${signed(d.health)} health` : ""}
                a month; upkeep
                ${d.upkeep}${native
                  ? ""
                  : `, rates ${ratesOn({ level, leased: false } as Property, false)}`}</span
              >
              ${!buy.check.ok && !/coins/.test(buy.check.why)
                ? html`<span class="cq-why">${buy.check.why}</span>`
                : nothing}
            </span>
            <span class="cq-house-offer-do">
              <button
                class="cq-btn small ${buy.check.ok ? "primary" : ""}"
                ?disabled=${!buy.check.ok}
                title=${buy.check.ok ? "" : buy.check.why}
                @click=${() => void home(ui, { act: "buy", arg: level })}
              >
                ${native ? "Build" : "Buy"}${price(cost, { have: life.purse })}
              </button>
              ${lease
                ? rented
                  ? html`<span class="cq-chip">rented</span>`
                  : html`<button
                      class="cq-btn small"
                      ?disabled=${!lease.ok}
                      title=${lease.ok
                        ? "No upkeep, no rates; the rent every month"
                        : lease.why}
                      @click=${() =>
                        void home(ui, { act: "lease", arg: level })}
                    >
                      Rent${price(leaseRent(level), {
                        per: "month",
                        have: life.purse,
                      })}
                    </button>`
                : nothing}
            </span>
          </li>`;
        })}
      </ul>`,
    !h,
  );
}

// ---------------------------------------------------------------- your other property

function otherProperty(ui: GameUi, p: number): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const native = lifeIsNative(s, life);
  const list = propertyOf(life).filter(
    (x) => !(x.kind === "house" && x.prov === p),
  );
  if (!list.length) return html``;
  return fold(
    "home:others",
    "Your other property",
    String(list.length),
    html`<ul class="cq-home-list">
        ${list.map((pr) => {
          const where = ui.map.provinces[pr.prov]?.name ?? "";
          const what =
            pr.kind === "house"
              ? pr.name
              : pr.kind === "land"
                ? `${pr.level * 10} acres`
                : pr.name[0].toUpperCase() + pr.name.slice(1);
          return html`<li>
            <span class="cq-folk-text">
              <b>${what}</b>
              <span class="cq-muted small"
                >at
                ${where}${pr.kind === "house"
                  ? pr.let
                    ? `, let for ${pr.let.rent} a month`
                    : pr.leased
                      ? ", rented"
                      : pr.prov === life.home
                        ? ", your home"
                        : `, standing empty (it would let for ${LET_RENT[pr.level - 1]})`
                  : ""}${pr.kind === "house" && !pr.leased
                  ? `; worth about ${Math.round((native ? LODGES : HOUSES)[pr.level - 1].cost * 0.5 + extrasWorth(pr, native))}`
                  : ""}</span
              >
            </span>
            ${pr.kind === "house" && !pr.leased && !native
              ? pr.let
                ? homeButton(
                    ui,
                    "End the let",
                    { act: "unlet", id: pr.id },
                    {
                      cls: "slim",
                      scene: false,
                    },
                  )
                : homeButton(
                    ui,
                    html`Let
                    it${price(LET_RENT[pr.level - 1], {
                      gain: true,
                      per: "month",
                    })}`,
                    { act: "let", id: pr.id },
                    {
                      cls: "slim",
                      scene: false,
                    },
                  )
              : nothing}
          </li>`;
        })}
      </ul>
      <div class="cq-btnrow">
        <button
          class="cq-btn small"
          @click=${() => ui.open({ k: "tab", tab: "estate", sub: "house" })}
        >
          Estate › House & land
        </button>
      </div>`,
  );
}

// ---------------------------------------------------------------- everything else money buys

const ELSEWHERE: {
  what: string;
  where: PlaceKind[];
  text: string;
  key?: string;
}[] = [
  {
    what: "Land",
    where: ["fields"],
    text: "ten acres at a time, let to tenants",
  },
  {
    what: "A horse",
    where: ["market", "fields", "village"],
    text: `ride, and go overland in two thirds the time (${KIT.horse.cost})`,
  },
  { what: "A carriage", where: ["market"], text: "a coach and pair" },
  {
    what: "Good tools",
    where: ["workshop", "market", "village"],
    text: "a point of skill in your trade",
  },
  { what: "A pew", where: ["church"], text: "your name on the door" },
  {
    what: "A boat",
    where: ["docks"],
    text: "the boatyard, from a canoe to a ship",
  },
  { what: "Shares", where: ["market"], text: "a stake in a company" },
  {
    what: "People in your service",
    where: ["tavern", "market", "docks", "fort"],
    text: "clerks, hands, swords, mates",
  },
  {
    what: "A land grant",
    where: ["governor"],
    text: "a headright, for the fees",
  },
];

function moneyBuys(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const here = new Set(areasOf(s, ui.w, life.prov, life));
  const native = lifeIsNative(s, life);
  const rows = ELSEWHERE.filter(
    (x) =>
      !native ||
      !["Land", "A carriage", "A pew", "Shares", "A land grant"].includes(
        x.what,
      ),
  );
  return fold(
    "home:buys",
    "What else money buys, and where",
    String(rows.length),
    html`<ul class="cq-home-list">
      ${rows.map((x) => {
        const at = x.where.find((w) => here.has(w));
        return html`<li>
          <span class="cq-folk-text">
            <b>${x.what}</b>
            <span class="cq-muted small"
              >${x.text}; at
              ${(x.where.some((w) => here.has(w))
                ? x.where.filter((w) => here.has(w))
                : x.where
              )
                .map((w) => areaName(s, life.prov, w).replace(/^The /, "the "))
                .join(" or ")}</span
            >
          </span>
          <button
            class="cq-btn small slim"
            ?disabled=${!at}
            title=${at ? "" : "Not in this town: a bigger one has it"}
            @click=${async () => {
              if (!at) return;
              await ui.cmd({ k: "enter", area: at });
              ui.open({ k: "tab", tab: "here" });
            }}
          >
            ${at ? "Go" : "Not here"}
          </button>
        </li>`;
      })}
    </ul>`,
  );
}

// ---------------------------------------------------------------- Estate › House & land

/** The top of Estate › House & land: every house you have, and the way home. */
export function housesSection(ui: GameUi): TemplateResult {
  const life = ui.life!;
  const houses = housesOf(life);
  const atHome = !life.travel && life.prov === life.home;
  const go = async () => {
    if (atHome) await ui.cmd({ k: "enter", area: "home" });
    ui.open({ k: "tab", tab: "here" });
  };
  return section(
    houses.length > 1 ? "Your houses" : "Your house",
    html`${houses.length
        ? houses.map((h) => houseCard(ui, h, { compact: true }))
        : html`${lodgingsCard(ui)}
            <p class="cq-muted small">
              Buy or rent a house at Home (or at the market, or a village): your
              household moves in, and it eases the mind every month.
            </p>`}
      <div class="cq-btnrow">
        <button class="cq-btn small primary" @click=${() => void go()}>
          ${atHome
            ? houseOf(life, life.prov)
              ? "Go home: rooms, servants, family"
              : "Go home: buy or rent a house"
            : `Home is at ${ui.map.provinces[life.home]?.name ?? "your home"}`}
        </button>
      </div>`,
  );
}
