// SEA (r15): Work › At sea. Everything of going to sea in person: the
// cruise you're aboard (where she is, her prizes, your share so far, her
// log), your voyage with your trade, ships fitting out at this quay (with
// the odds of signing as a hand, an officer or her captain), your own boat
// fitted out as a privateer or on the account, the privateering companies
// (yours, and those being got up), the King's pardon, and the hurricanes
// abroad. Costs go on the buttons; risk and reward come from the tables the
// cruises roll by.

import { html, nothing, TemplateResult } from "lit";
import { BOATS, boatsOf, boatyard } from "../../engine/Boats";
import { dateOf, formatDate } from "../../engine/Calendar";
import { CRUISE, GROUND_BY_KEY, havenIn, ROLE_NAMES } from "../../engine/CruiseData";
import {
  cruiseExpect,
  cruiseOffers,
  type CruiseOffer,
  enemiesOf,
  groundsFrom,
  havenNear,
  marqueCheck,
  marqueFee,
  offerOdds,
  ownCruiseCheck,
  ownCruiseOdds,
  ownOutfit,
  pardonCheck,
  pardonOpen,
  piratesFitHere,
  privateersFitHere,
  shareSoFar,
  signCheck,
} from "../../engine/Cruises";
import { lifeOfChar } from "../../engine/LifeQueries";
import {
  bestGround,
  commissionAt,
  COMPANY,
  companiesOf,
  companyOdds,
  cruiseCheck,
  joinCheck,
  openCheck,
  shipInPort,
  subNeeded,
  subsAt,
  subTotal,
  townMerchant,
} from "../../engine/Privateers";
import { charName } from "../../engine/Queries";
import { seaOf, voyageOfLife } from "../../engine/SeaCore";
import { stormName } from "../../engine/Storms";
import type {
  BoatKind,
  Cruise,
  CruiseRole,
  Firm,
  Life,
  Storm,
  Subscription,
  Voyage,
} from "../../engine/Types";
import { VOYAGE_DEFS } from "../../engine/Voyages";
import "../../engine/Sea"; // the sea's hooks: the month's forecast, the tracker
import { boatGlyph } from "./Livelihood";
import { action, bar, charLink, GameUi, provLink, section } from "./Context";
import { howTo, pageHead } from "./Nav";
import { oddsPanel } from "./Odds";
import { price, priceWords } from "./Price";
import { term } from "./Terms";

const r1 = (v: number) => Math.round(v * 10) / 10;
const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

// ---------------------------------------------------------------- what you've picked

const rolePick = new Map<string, CruiseRole>();
const groundPick = new Map<string, string>();
const longPick = new Map<string, boolean>();
const piratePick = new Map<number, boolean>();
const commandPick = new Map<number, boolean>();
const joinPick = new Map<number, number>();
const opening = { ship: "", stake: 25, name: "" };

const JOIN_SUMS = [10, 25, 50, 100];
const OPEN_STAKES = [10, 25, 50, 100];

/** A segmented picker of a few choices. */
function seg<T extends string | number | boolean>(
  ui: GameUi,
  label: string,
  choices: { v: T; text: string | TemplateResult; title?: string }[],
  now: T,
  set: (v: T) => void,
): TemplateResult {
  return html`<span class="cq-seg small" role="radiogroup" aria-label=${label}>
    ${choices.map(
      (c) =>
        html`<button
          role="radio"
          aria-checked=${c.v === now}
          title=${c.title ?? ""}
          @click=${() => {
            set(c.v);
            ui.redraw();
          }}
        >
          ${c.text}
        </button>`,
    )}
  </span>`;
}

// ---------------------------------------------------------------- the page

/** What wants looking at on the page: a share you've been asked to take, your company ready to sign, a ship lost. */
export function seaMarks(ui: GameUi): number {
  const s = ui.s;
  const life = ui.life;
  if (!life || life.c < 0) return 0;
  let n = 0;
  for (const x of s.sea?.subs ?? []) {
    if (x.status !== "open") continue;
    if (x.asked.includes(life.c) && !x.stakes.some((st) => st.c === life.c)) n++;
    if (x.by === life.c) {
      const cash = x.stakes.filter((st) => st.boat === undefined).reduce((m, st) => m + st.coins, 0);
      if (cash >= subNeeded(s, ui.w, x)) n++;
    }
  }
  for (const f of companiesOf(s, life.c))
    if (f.sea?.lost && f.partners.find((p) => p.c === life.c)?.role === "managing") n++;
  return n;
}

export function seaPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const mine = seaOf(s).cruises.find(
    (c) =>
      c.phase !== "done" &&
      c.phase !== "lost" &&
      c.hands.some((h) => h.seat === life.seat && h.c === life.c),
  );
  const voyage = voyageOfLife(s, life);
  const here = life.travel ? [] : cruiseOffers(s, ui.w, life.prov).filter((o) => o.cruise !== mine?.id);
  return html`${pageHead(
    "At sea",
    html`Go to sea in person: sign a privateer's or a pirate's
    ${term("articles", "articles")}, sail with your trade's voyages, take your
    own boat out, or get up a ${term("privateer-company", "privateering company")}.
    You sail on the map; while you're at sea the things of the town wait, and
    letters wait for you in port.`,
  )}
  ${mine ? cruiseCard(ui, mine) : nothing}
  ${voyage ? voyageCard(ui, voyage) : nothing}
  ${quaySection(ui, here)} ${ownBoatSection(ui)} ${companySection(ui)}
  ${pardonSection(ui)} ${stormSection(ui)}`;
}

// ---------------------------------------------------------------- your cruise

const PHASE: Record<Cruise["phase"], string> = {
  fitting: "Fitting out",
  out: "Outward bound",
  hunting: "On her cruising ground",
  home: "Homeward",
  selling: "Home: her prizes to sell",
  done: "Paid off",
  lost: "Lost",
};

function cruiseCard(ui: GameUi, cr: Cruise): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const h = cr.hands.find((x) => x.seat === life.seat)!;
  const gd = GROUND_BY_KEY.get(cr.ground);
  const w = cr.way;
  const where =
    cr.phase === "fitting"
      ? html`at the quay, ${provLink(ui, cr.port)}: she sails on
          <b>${formatDate(cr.sails)}</b>. Be aboard (at
          ${ui.map.provinces[cr.port].name}, not on the road) or she sails
          without you.`
      : cr.phase === "selling"
        ? html`at ${provLink(ui, cr.port)}:
            ${cr.flag === "pirate" ? "the fence pays" : "the prize court sits"}
            on <b>${formatDate(cr.court ?? s.day)}</b>.`
        : w && w.path.length
          ? html`off ${provLink(ui, w.prov)}, making for
              ${provLink(ui, w.path[0])}
              (${Math.max(1, w.arrive - s.day)}
              day${w.arrive - s.day === 1 ? "" : "s"})${cr.phase === "home"
                ? html`, bound for ${provLink(ui, cr.port)}`
                : nothing}.`
          : html`at ${provLink(ui, w?.prov ?? cr.port)}.`;
  const days =
    cr.phase === "hunting"
      ? `On the ground till ${formatDate(cr.until)} (${Math.max(0, cr.until - s.day)} days).`
      : cr.phase === "out"
        ? `${cr.until - cr.start} days on the ground once she's there.`
        : "";
  const x = cruiseExpect(s, ui.map, cr, life);
  const so = shareSoFar(s, ui.map, cr, life);
  const captain = h.role === "captain";
  const pirate = cr.flag === "pirate";
  const haven =
    pirate && captain ? havenNear(s, ui.map, w?.path[0] ?? w?.prov ?? cr.port, cr.kind) : null;
  return section(
    html`Your cruise`,
    html`<div class="cq-sea-card ${pirate ? "pirate" : ""}">
      <div class="cq-lv-boathead">
        ${boatGlyph(cr.kind)}
        <div>
          <b>The ${cr.ship}</b>
          <span class="cq-muted small"
            >${BOATS[cr.kind].name.toLowerCase()} of ${cr.guns} guns,
            ${pirate
              ? "on the account (no commission: pirates)"
              : `a privateer under ${s.nations[cr.nation]?.adjective ?? "her"} commission`}
            · ${cr.owner === "boat" ? "your own boat" : cr.owner === "firm" ? "a company's ship" : "an outfit of the town's merchants"}</span
          >
        </div>
        <span class="cq-chip ${captain ? "gold" : ""}"
          >${ROLE_NAMES[cr.flag][h.role]}</span
        >
      </div>
      <p class="small">
        <b>${PHASE[cr.phase]}</b>${gd ? html`, for ${gd.name}` : nothing}:
        ${where} ${days}
        ${captain ? "" : html`Her captain: ${cap(cr.cname)}.`}
      </p>
      ${cr.encounter
        ? html`<p class="cq-sea-alert small">
            ${cr.encounter.stage === "warship" ? "A man-of-war!" : "A sail!"}
            ${captain || cr.hands[0]?.seat === life.seat
              ? "Answer the scene: the ship waits on it a few days, then her captain decides."
              : "Her captain is deciding."}
          </p>`
        : nothing}
      <div class="cq-lv-gauges small">
        <span>Hull ${bar(cr.hull / 100)} ${Math.round(cr.hull)}%</span>
        <span>Men ${cr.men}</span>
        <span>Spirits ${bar(cr.morale / 100)}</span>
        ${cr.scurvy > 0
          ? html`<span>Scurvy ${bar(cr.scurvy / 100, "bad")}</span>`
          : nothing}
      </div>
      ${cr.prizes.length
        ? html`<ul class="cq-sea-prizes">
            ${cr.prizes.map(
              (p) =>
                html`<li>
                  <span class="cq-sea-prize-name"
                    >${p.name} <small class="cq-muted">${s.nations[p.flag]?.adjective ?? ""} ${p.kind}</small></span
                  >
                  <span class="cq-chip ${p.status === "retaken" ? "bad" : p.status === "sold" ? "good" : ""}"
                    >${p.status === "at sea" ? "a prize crew aboard" : p.status === "home" ? (p.how === "plunder" ? "her plunder aboard" : "in port") : p.status}</span
                  >
                  <span class="cq-sea-prize-val"
                    >${p.sold !== undefined ? `fetched ${r1(p.sold)}` : `≈ ${p.value}`}${cr.flag === "privateer" && !p.lawful ? " · to be restored" : ""}</span
                  >
                </li>`,
            )}
          </ul>`
        : html`<p class="cq-muted small">No prizes yet.</p>`}
      <p class="small">
        Your share so far, if it sells as hoped: <b>${so}</b>; the whole cruise
        should bring you about <b>${x.value}</b> (up to ${x.hi}).
        ${term("prize-court", "The prize court")}: ${Math.round(CRUISE.court * 100)}
        in a hundred in fees, then ${cr.flag === "privateer"
          ? "half to her owners and half to her company by their parts"
          : "a fence pays (best at a haven), shared by the pirates' articles"}.
      </p>
      ${cr.log.length
        ? html`<details class="cq-more" open>
            <summary>Her log</summary>
            <ol class="cq-sea-log">
              ${cr.log.slice(-8).map(
                (l) =>
                  html`<li>
                    <span class="cq-muted">${shortDate(l.day)}</span> ${l.text}
                  </li>`,
              )}
            </ol>
          </details>`
        : nothing}
      <div class="cq-btnrow">
        ${cr.phase === "fitting"
          ? action(
              "Take your name off her articles",
              { ok: true },
              () => void ui.cmd({ k: "sea", act: "unsign" }),
              "small quiet",
            )
          : nothing}
        ${captain && (cr.phase === "hunting" || cr.phase === "out")
          ? action(
              "Put about for home",
              cr.encounter ? { ok: false, why: "Settle the matter in hand first" } : { ok: true },
              () => void ui.cmd({ k: "sea", act: "home" }),
              "small",
            )
          : nothing}
        ${haven && (cr.phase === "hunting" || cr.phase === "out" || cr.phase === "home") && haven.p !== cr.port
          ? action(
              `Make for ${haven.name} to sell`,
              cr.encounter ? { ok: false, why: "Settle the matter in hand first" } : { ok: true },
              () => void ui.cmd({ k: "sea", act: "haven" }),
              "small",
              `A pirates' haven pays ${Math.round(CRUISE.fence.haven * 100)} in a hundred of a prize's worth; a smuggler on the quiet ${Math.round(CRUISE.fence.quay * 100)}`,
            )
          : nothing}
      </div>
    </div>`,
  );
}

function shortDate(day: number): string {
  const d = dateOf(day);
  return `${d.day} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.month]}`;
}

// ---------------------------------------------------------------- your voyage

function voyageCard(ui: GameUi, v: Voyage): TemplateResult {
  const s = ui.s;
  const def = VOYAGE_DEFS[v.kind];
  const ship = v.kind === "merchant" || v.kind === "whaling";
  const status =
    v.phase === "out"
      ? html`outward, ${v.way?.path.length ? html`off ${provLink(ui, v.way.prov)}, making for ${provLink(ui, v.way.path[0])}` : "under way"}`
      : v.phase === "there"
        ? v.kind === "whaling"
          ? html`on the grounds off ${provLink(ui, v.to)}: she starts home on ${formatDate(v.sails)}`
          : html`at ${provLink(ui, v.to)}:
              ${ship ? "she sails for home" : "it starts back"} on
              <b>${formatDate(v.sails)}</b>.
              ${ship ? "Be aboard (here, not on the road), or she goes without you." : ""}`
        : html`homeward to ${provLink(ui, v.from)}`;
  return section(
    "Your voyage",
    html`<div class="cq-sea-card">
      <div class="cq-lv-boathead">
        ${ship ? boatGlyph("brig") : v.kind === "furs" ? boatGlyph("canoe") : surveyGlyph()}
        <div>
          <b>${ship ? `The ${v.ship}` : cap(v.ship)}</b>
          <span class="cq-muted small">${def.name} to ${ui.map.provinces[v.to]?.name ?? "far off"}</span>
        </div>
        ${v.stake ? html`<span class="cq-chip">${v.stake} ventured</span>` : nothing}
      </div>
      <p class="small">${status}.${v.kind === "whaling" && v.take ? ` The catch so far: about ${Math.round(v.take)} coins of oil and bone.` : ""}</p>
      ${v.log.length
        ? html`<ol class="cq-sea-log">
            ${v.log.slice(-5).map((l) => html`<li><span class="cq-muted">${shortDate(l.day)}</span> ${l.text}</li>`)}
          </ol>`
        : nothing}
      <p class="cq-muted small">
        Your wages go on as at your post.${s.day >= v.sails && v.phase === "there" ? " She's sailing now." : ""}
      </p>
    </div>`,
  );
}

/** A surveyor's compass and chain, for a survey party. */
function surveyGlyph(): TemplateResult {
  return html`<svg class="cq-lv-boat" viewBox="0 0 40 30" aria-hidden="true">
    <circle cx="20" cy="15" r="9" class="hull" fill="none" />
    <path d="M20 7l2 8-2 8-2-8z" class="sail" />
    <path d="M4 26h32" class="mast" stroke-dasharray="2 2" />
  </svg>`;
}

// ---------------------------------------------------------------- ships fitting out

function quaySection(ui: GameUi, offers: CruiseOffer[]): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const p = life.prov;
  const priv = privateersFitHere(s, ui.w, p);
  const pir = piratesFitHere(s, ui.w, p);
  const year = dateOf(s.day).year;
  const haven = havenIn(ui.map, p, year);
  return section(
    html`Ships fitting out${life.travel ? "" : html` at ${ui.map.provinces[p].name}`}`,
    offers.length
      ? html`${haven
            ? html`<p class="small cq-muted">
                ${haven.text} Pirates fit out here, and a fence pays well.
              </p>`
            : nothing}
          ${offers.map((o) => offerCard(ui, o))}`
      : howTo(
          life.travel
            ? "You're on the road: ships are fitted out at the quays."
            : `No ship is fitting out at ${ui.map.provinces[p].name} for a cruise.`,
          [
            html`<b>Privateers</b> fit out at the ports of a colony at war,
              under the governor's ${term("marque", "letter of marque")}, and
              take only the enemy's ships.${priv >= 0 ? "" : " Nobody here is at war just now."}`,
            html`<b>Pirates</b> fit out in the pirate years (1650 to 1730) in
              the islands, Florida and the Carolinas; best at a haven: Tortuga
              (to 1688), Port Royal (to 1691), Nassau (1713 to 1717).${pir ? " They do here." : ""}`,
            "A new lot comes each month. Seamen hear of them (a scene); anyone can sign as a hand with seamanship 2 or fighting 4.",
          ],
        ),
  );
}

function offerCard(ui: GameUi, o: CruiseOffer): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const gd = GROUND_BY_KEY.get(o.ground);
  const roles: CruiseRole[] = ["crew", "officer", "captain"];
  const checks = roles.map((r) => signCheck(s, ui.w, life, o, r));
  const fallback = roles[checks.findIndex((c) => c.ok)] ?? "crew";
  const role = rolePick.get(o.key) ?? fallback;
  const check = checks[roles.indexOf(role)];
  const v = offerOdds(s, ui.w, life, o, role);
  const pirate = o.flag === "pirate";
  return html`<div class="cq-sea-card ${pirate ? "pirate" : ""}">
    <div class="cq-lv-boathead">
      ${boatGlyph(o.kind)}
      <div>
        <b>The ${o.ship}</b>
        <span class="cq-muted small"
          >${BOATS[o.kind].name.toLowerCase()} of ${o.guns} guns ·
          ${pirate
            ? "pirates (no commission)"
            : `${s.nations[o.nation]?.adjective ?? ""} letter of marque`}
          · ${cap(o.cname)}</span
        >
      </div>
      <span class="cq-chip ${pirate ? "bad" : "good"}"
        >${pirate ? "Pirate" : "Privateer"}</span
      >
    </div>
    <p class="small">
      A cruise ${gd?.name ?? ""}: ${o.passage} days out, about ${o.hunt} on
      the ground, ${o.passage} home. Sails <b>${formatDate(o.sails)}</b>.
      ${o.aboard.length
        ? html`Players aboard: ${o.aboard.map((r) => ROLE_NAMES[o.flag][r].toLowerCase()).join(", ")}.`
        : nothing}
      ${gd ? html`<span class="cq-muted">${gd.text}</span>` : nothing}
    </p>
    <div class="cq-sea-pick">
      ${seg(
        ui,
        "Berth",
        roles.map((r, i) => ({
          v: r,
          text: ROLE_NAMES[o.flag][r],
          title: checks[i].ok ? "" : (checks[i] as { why: string }).why,
        })),
        role,
        (r) => rolePick.set(o.key, r),
      )}
    </div>
    ${oddsPanel(v)}
    <div class="cq-btnrow">
      ${action(
        `Sign as ${ROLE_NAMES[o.flag][role].toLowerCase()}`,
        check,
        () => void ui.cmd({ k: "sea", act: "sign", key: o.key, name: role }),
        "small primary",
        pirate ? "Piracy: the law's heat with every prize, and a rope at the end of it" : undefined,
      )}
    </div>
  </div>`;
}

// ---------------------------------------------------------------- your own boat

function ownBoatSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  if (life.travel) return html``;
  const boats = boatsOf(life).filter(
    (b) => b.prov === life.prov && BOATS[b.kind].uses.includes("privateering"),
  );
  if (!boats.length) return html``;
  return section(
    "Your own boat on a cruise",
    html`${boats.map((b) => {
      const grounds = groundsFrom(s, ui.map, b.prov, b.kind);
      const key = `b:${b.id}`;
      const pirate = piratePick.get(b.id) ?? (!b.marque && privateersFitHere(s, ui.w, b.prov) < 0);
      const ground =
        groundPick.get(key) ??
        (bestGround(s, ui.w, b.kind, b.prov, b.marque?.nation ?? ui.me?.nation ?? -1) || grounds[0]?.g.key || "");
      const long = longPick.get(key) ?? false;
      const check = ownCruiseCheck(s, ui.w, life, b.id, ground, pirate);
      const gd = GROUND_BY_KEY.get(ground);
      const passage = grounds.find((x) => x.g.key === ground)?.days ?? 0;
      const outfit = ownOutfit(b.kind, pirate, long ? CRUISE.hunt.long : CRUISE.hunt.short, passage);
      const v = gd ? ownCruiseOdds(s, ui.w, life, b.id, ground, long, pirate) : null;
      const mq = marqueCheck(s, ui.w, life, b.id);
      const atWar = b.marque && enemiesOf(s, b.marque.nation).size > 0;
      return html`<div class="cq-sea-card">
        <div class="cq-lv-boathead">
          ${boatGlyph(b.kind)}
          <div>
            <b>The ${b.name}</b>
            <span class="cq-muted small"
              >${BOATS[b.kind].name.toLowerCase()} of ${BOATS[b.kind].guns}
              guns · hull ${Math.round(b.condition)}% · ${b.crew} of
              ${BOATS[b.kind].crew} hands</span
            >
          </div>
          <span class="cq-chip ${atWar ? "good" : ""}"
            >${atWar
              ? `${s.nations[b.marque!.nation]?.adjective ?? ""} letter of marque`
              : "No commission"}</span
          >
        </div>
        ${!atWar
          ? html`<div class="cq-btnrow">
              ${action(
                html`Take out a letter of marque${price(marqueFee(b.kind), { have: life.purse })}`,
                mq,
                () => void ui.cmd({ k: "sea", act: "marque", id: b.id }),
                "small",
                "From the governor of a colony at war: she may take the enemy's ships as prizes while it lasts",
              )}
            </div>`
          : nothing}
        <div class="cq-sea-pick">
          ${seg(
            ui,
            "Hunting ground",
            grounds.map((x) => ({
              v: x.g.key,
              text: cap(x.g.name.replace(/^the /, "")),
              title: `${x.days} days' sail. ${x.g.text}`,
            })),
            ground,
            (k) => groundPick.set(key, k),
          )}
          ${seg(
            ui,
            "Length",
            [
              { v: false, text: `Short (${CRUISE.hunt.short} days)` },
              { v: true, text: `Long (${CRUISE.hunt.long} days)` },
            ],
            long,
            (x) => longPick.set(key, x),
          )}
          ${seg(
            ui,
            "Flag",
            [
              { v: false, text: "Privateer" },
              { v: true, text: "On the account", title: "Piracy: any ship at all, and the law's heat with every prize" },
            ],
            pirate,
            (x) => piratePick.set(b.id, x),
          )}
        </div>
        ${v ? oddsPanel(v) : nothing}
        <div class="cq-btnrow">
          ${action(
            html`Fit her out and sail${price(outfit, { have: life.purse })}`,
            check,
            () =>
              void ui.cmd({
                k: "sea",
                act: "own",
                id: b.id,
                key: ground,
                arg: long ? 1 : 0,
                name: pirate ? "pirate" : "privateer",
              }),
            "small primary",
            "Victuals, powder and shot for her company; you command her, and sail with her on the map",
          )}
        </div>
        <p class="cq-muted small">
          Or stay ashore and send her privateering with a mate as her skipper
          (Estate › Boats): smaller prizes, and you don't sail.
        </p>
      </div>`;
    })}`,
  );
}

// ---------------------------------------------------------------- privateering companies

function companySection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const mine = companiesOf(s, life.c);
  const subs = [
    ...subsAt(s, life.prov),
    ...seaOf(s).subs.filter(
      (x) => x.status === "open" && x.prov !== life.prov && (x.by === life.c || x.asked.includes(life.c)),
    ),
  ];
  const nation = life.travel ? -1 : commissionAt(s, ui.w, life.prov);
  if (!mine.length && !subs.length && nation < 0) return html``;
  return section(
    html`Privateering companies`,
    html`${mine.map((f) => companyCard(ui, f))}
    ${subs.map((x) => subCard(ui, x))}
    ${nation >= 0 && !subs.some((x) => x.by === life.c) ? openCard(ui, nation) : nothing}`,
  );
}

function companyCard(ui: GameUi, f: Firm): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const x = f.sea!;
  const me = f.partners.find((p) => p.c === life.c)!;
  const managing = me.role === "managing";
  const cr = x.cruise >= 0 ? seaOf(s).cruises.find((c) => c.id === x.cruise) : undefined;
  const port = shipInPort(f);
  const key = `f:${f.id}`;
  const grounds = port ? groundsFrom(s, ui.map, x.at, x.kind) : [];
  const nation = x.commission?.nation ?? -1;
  const ground = groundPick.get(key) ?? (bestGround(s, ui.w, x.kind, x.at, nation) || grounds[0]?.g.key || "");
  const long = longPick.get(key) ?? false;
  const command = commandPick.get(f.id) ?? false;
  const passage = grounds.find((g) => g.g.key === ground)?.days ?? 0;
  const outfit = ownOutfit(x.kind, false, long ? CRUISE.hunt.long : CRUISE.hunt.short, passage);
  const check = cruiseCheck(s, ui.w, life, f, ground, command);
  const v =
    port && x.commission
      ? companyOdds(s, ui.w, { kind: x.kind, port: x.at, nation, hull: x.hull, long, share: me.share, stake: 0, ground, captain: command ? life : undefined })
      : null;
  return html`<div class="cq-sea-card company">
    <div class="cq-lv-boathead">
      ${boatGlyph(x.kind)}
      <div>
        <b>The ${x.ship}</b>
        <span class="cq-muted small"
          >${f.name} · ${BOATS[x.kind].name.toLowerCase()} of ${x.guns} guns ·
          your share ${me.share}% (${managing ? "managing owner" : "silent"})</span
        >
      </div>
      <span class="cq-chip ${x.lost ? "bad" : x.commission ? "good" : ""}"
        >${x.lost ? "Lost" : x.commission ? `${s.nations[nation]?.adjective ?? ""} commission` : "No commission"}</span
      >
    </div>
    <div class="cq-lv-gauges small">
      ${x.lost ? html`<span class="bad">${x.lost}</span>` : html`<span>Hull ${bar(x.hull / 100)} ${Math.round(x.hull)}%</span>`}
      <span>The chest ${r1(f.chest)}</span>
      <span>${x.cruises} cruise${x.cruises === 1 ? "" : "s"} · ${x.taken} prize${x.taken === 1 ? "" : "s"} · ${r1(x.fetched)} to the owners</span>
    </div>
    <p class="small">
      ${x.lost
        ? "She's gone. The company keeps its chest: buy another ship from it, or wind it up (Estate › Partnerships)."
        : cr
          ? html`${PHASE[cr.phase]}: ${cr.phase === "fitting" ? html`sails ${formatDate(cr.sails)} from ${provLink(ui, cr.port)} under ${cap(cr.cname)}; owners may sign aboard at the quay.` : html`a cruise ${GROUND_BY_KEY.get(cr.ground)?.name ?? ""} under ${cap(cr.cname)}, ${cr.prizes.length} prize${cr.prizes.length === 1 ? "" : "s"} so far.`}`
          : html`In port at ${provLink(ui, x.at)}. Her keep, ${BOATS[x.kind].upkeep} a month, comes from the chest (called from the owners by share when it's bare).`}
    </p>
    ${managing && port && x.commission
      ? html`<div class="cq-sea-pick">
            ${seg(
              ui,
              "Hunting ground",
              grounds.map((g) => ({ v: g.g.key, text: cap(g.g.name.replace(/^the /, "")), title: `${g.days} days' sail. ${g.g.text}` })),
              ground,
              (k) => groundPick.set(key, k),
            )}
            ${seg(ui, "Length", [{ v: false, text: `Short (${CRUISE.hunt.short} days)` }, { v: true, text: `Long (${CRUISE.hunt.long} days)` }], long, (b) => longPick.set(key, b))}
            ${seg(ui, "Command", [{ v: false, text: "A hired captain" }, { v: true, text: "Command her yourself" }], command, (b) => commandPick.set(f.id, b))}
          </div>
          ${v ? oddsPanel(v) : nothing}
          <div class="cq-btnrow">
            ${action(
              html`Send her on a cruise${price(outfit, { have: f.chest })}`,
              check,
              () => void ui.cmd({ k: "sea", act: "co-cruise", id: f.id, key: ground, arg: long ? 1 : 0, name: command ? "command" : "hire" }),
              "small primary",
              "Her victuals and powder, from the company's chest",
            )}
          </div>`
      : nothing}
    ${managing && x.lost
      ? html`<div class="cq-btnrow">
          ${COMPANY.kinds
            .filter((k) => boatyard(s, ui.w, f.prov).includes(k))
            .map((k) =>
              action(
                html`Buy a ${BOATS[k].name.toLowerCase()}${price(BOATS[k].price, { have: f.chest })}`,
                life.prov !== f.prov ? { ok: false, why: `Be at ${ui.map.provinces[f.prov].name}` } : f.chest >= BOATS[k].price ? { ok: true } : { ok: false, why: "The chest is short: call in capital" },
                () => void ui.cmd({ k: "sea", act: "co-ship", id: f.id, key: k }),
                "small",
                "From the company's chest",
                false,
              ),
            )}
        </div>`
      : nothing}
    ${managing && !x.lost && !x.commission && commissionAt(s, ui.w, f.prov) >= 0
      ? html`<div class="cq-btnrow">
          ${action(
            html`A new letter of marque${price(marqueFee(x.kind), { have: f.chest })}`,
            life.prov === f.prov ? { ok: true } : { ok: false, why: `Be at ${ui.map.provinces[f.prov].name}` },
            () => void ui.cmd({ k: "sea", act: "co-marque", id: f.id }),
            "small",
          )}
        </div>`
      : nothing}
    ${!managing
      ? html`<p class="cq-muted small">
          Her managing owner sends her cruising; you may sign aboard her at the
          quay when she fits out (above), as an officer or a hand.
        </p>`
      : nothing}
  </div>`;
}

function subCard(ui: GameUi, x: Subscription): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const mineSub = x.by === life.c;
  const need = subNeeded(s, ui.w, x);
  const cash = r1(x.stakes.filter((st) => st.boat === undefined).reduce((m, st) => m + st.coins, 0));
  const nation = s.provinces[x.prov].owner;
  const players = s.lives
    .filter((l) => !l.watching && l.c >= 0 && l.c !== life.c && !x.asked.includes(l.c) && !x.stakes.some((st) => st.c === l.c))
    .map((l) => s.chars[l.c])
    .filter(Boolean);
  const amt = joinPick.get(x.id) ?? 25;
  const share = (amt / (subTotal(x) + amt)) * 100;
  const v = mineSub ? null : companyOdds(s, ui.w, { kind: x.kind, port: x.prov, nation, share, stake: amt });
  const merchant = mineSub ? townMerchant(s, x) : undefined;
  return html`<div class="cq-sea-card company">
    <div class="cq-lv-boathead">
      ${boatGlyph(x.kind)}
      <div>
        <b>The ${x.shipName}</b>
        <span class="cq-muted small"
          >being got up by ${mineSub ? "you" : charName(s.chars[x.by])} at
          ${ui.map.provinces[x.prov].name} · ${BOATS[x.kind].name.toLowerCase()}
          of ${BOATS[x.kind].guns} guns${x.boat !== undefined ? " (put in by her owner)" : ` (${x.price} new)`}</span
        >
      </div>
      <span class="cq-chip">Open till ${formatDate(x.until)}</span>
    </div>
    <p class="small">
      In coin: <b>${cash}</b> of ${need} wanted (the ship${x.boat !== undefined ? "'s already put in" : ""}, her
      commission's fees and a first cruise's victuals).
      ${x.stakes
        .map((st) => `${lifeOfChar(s, st.c) === life ? "you" : charName(s.chars[st.c])} ${st.coins}`)
        .join(" · ")}
    </p>
    ${mineSub
      ? html`<div class="cq-btnrow">
          ${players.slice(0, 6).map((c) =>
            action(
              html`Ask ${c.first}`,
              { ok: true },
              () => void ui.cmd({ k: "sea", act: "co-ask", id: x.id, c: c.id }),
              "small quiet",
              "A letter asking them to take a share: they may put in from wherever they are",
            ),
          )}
          ${action(
            merchant ? html`${charName(merchant)} takes up the rest` : "The town's merchants take up the rest",
            merchant && cash < need ? { ok: true } : { ok: false, why: cash >= need ? "It has what it needs" : "No merchant here has money for it" },
            () => void ui.cmd({ k: "sea", act: "co-merchants", id: x.id }),
            "small",
            "A merchant of the town puts in what's wanting, for a silent share",
            false,
          )}
          ${action(
            "Sign the owners' articles",
            cash >= need ? { ok: true } : { ok: false, why: `${r1(need - cash)} more wanted` },
            () => void ui.cmd({ k: "sea", act: "co-sign", id: x.id }),
            "small primary",
            "The ship bought, her letter of marque taken, the company formed: shares by what each put in",
          )}
        </div>`
      : html`<div class="cq-sea-pick">
            ${seg(ui, "Put in", JOIN_SUMS.map((n) => ({ v: n, text: `${n}` })), amt, (n) => joinPick.set(x.id, n))}
          </div>
          ${v ? oddsPanel(v) : nothing}
          <div class="cq-btnrow">
            ${action(
              html`Take a share${price(amt, { have: life.purse })}`,
              joinCheck(s, ui.w, life, x, amt),
              () => void ui.cmd({ k: "sea", act: "co-join", id: x.id, arg: amt }),
              "small primary",
              "Given back if she never signs",
            )}
          </div>`}
  </div>`;
}

function openCard(ui: GameUi, nation: number): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const yard = COMPANY.kinds.filter((k) => boatyard(s, ui.w, life.prov).includes(k));
  const own = boatsOf(life).filter((b) => b.prov === life.prov && BOATS[b.kind].uses.includes("privateering"));
  const ships = [
    ...yard.map((k) => ({ v: `k:${k}`, text: html`${BOATS[k].name} ${price(BOATS[k].price)}`, kind: k as BoatKind, boat: undefined as number | undefined })),
    ...own.map((b) => ({ v: `b:${b.id}`, text: html`The ${b.name} (yours)`, kind: b.kind, boat: b.id as number | undefined })),
  ];
  if (!ships.length) return html``;
  const pick = ships.find((x) => x.v === opening.ship) ?? ships[0];
  const stake = pick.boat !== undefined ? 0 : opening.stake;
  const check = openCheck(s, ui.w, life, { kind: pick.boat === undefined ? pick.kind : undefined, boat: pick.boat, stake });
  const total = pick.boat !== undefined ? BOATS[pick.kind].price : BOATS[pick.kind].price + marqueFee(pick.kind) + 15;
  const v = companyOdds(s, ui.w, { kind: pick.kind, port: life.prov, nation, share: Math.min(100, ((stake || BOATS[pick.kind].price * 0.6) / total) * 100), stake });
  const foes = [...enemiesOf(s, nation)].map((n) => s.nations[n].name).join(" and ");
  return html`<div class="cq-sea-card company open">
    <p class="small">
      <b>Get up a company.</b> ${s.nations[nation]?.name ?? "The colony"} is at
      war with ${foes}: the governor grants letters of marque here. Fit out a
      privateer with partners: other players (ask them, by letter) and the
      town's merchants. Each owner's share is what they put in; she cruises
      under a hired captain or one of you, and the owners have half of what
      the prize court condemns.
    </p>
    <div class="cq-sea-pick">
      ${seg(ui, "The ship", ships.map((x) => ({ v: x.v, text: x.text })), pick.v, (v2) => (opening.ship = v2))}
      ${pick.boat === undefined
        ? seg(ui, "Your stake", OPEN_STAKES.map((n) => ({ v: n, text: `${n}` })), opening.stake, (n) => (opening.stake = n))
        : nothing}
    </div>
    <label class="cq-sea-name small"
      >Her name
      <input
        type="text"
        maxlength="30"
        .value=${opening.name}
        placeholder="Tartar"
        @input=${(e: Event) => (opening.name = (e.target as HTMLInputElement).value)}
    /></label>
    ${v ? oddsPanel(v, { title: `One cruise: the owners' half, your part of it as things stand` }) : nothing}
    <div class="cq-btnrow">
      ${action(
        pick.boat !== undefined
          ? "Get up a company with her"
          : html`Get up a company${price(stake, { have: life.purse })}`,
        check,
        () =>
          void ui.cmd({
            k: "sea",
            act: "co-open",
            key: pick.boat === undefined ? pick.kind : undefined,
            id: pick.boat,
            arg: stake,
            name: opening.name || undefined,
          }),
        "small primary",
        `Open for ${COMPANY.openDays} days; given back if it never signs`,
      )}
    </div>
    <p class="cq-muted small">${priceWords(subNeededFor(ui, pick.kind, pick.boat))} in coin to sign: the ship${pick.boat !== undefined ? " is yours already" : ""}, her commission, a first cruise.</p>
  </div>`;
}

function subNeededFor(ui: GameUi, kind: BoatKind, boat?: number): number {
  const life = ui.life!;
  return subNeeded(ui.s, ui.w, {
    id: -1,
    by: life.c,
    prov: life.prov,
    name: "",
    kind,
    price: BOATS[kind].price,
    ...(boat !== undefined ? { boat } : {}),
    shipName: "",
    stakes: [],
    asked: [],
    opened: ui.s.day,
    until: ui.s.day,
    status: "open",
  });
}

// ---------------------------------------------------------------- the pardon

function pardonSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const open = pardonOpen(s);
  const pirate = life.job?.kind === "pirate" || (life.cooldowns["sea:pirate"] ?? 0) > 0;
  if (!open || !pirate) return html``;
  return section(
    "The King's pardon",
    html`<p class="small">${open.text}</p>
      <div class="cq-btnrow">
        ${action(
          "Surrender and take the pardon",
          pardonCheck(s, ui.w, life),
          () => void ui.cmd({ k: "sea", act: "pardon" }),
          "small primary",
          "Your piracy forgiven: the law's heat cleared. Taken and broken, you hang.",
        )}
      </div>`,
  );
}

// ---------------------------------------------------------------- the hurricanes

const POINTS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/** "west-north-west" for a heading, to the nearest of sixteen points. */
export function compass(dir: number): string {
  const i = Math.round((((dir % 360) + 360) % 360) / 22.5) % 16;
  if (i % 2 === 0) return POINTS[i / 2];
  const a = POINTS[((i - 1) / 2) % 8];
  const b = POINTS[((i + 1) / 2) % 8];
  // north-north-east, east-north-east...
  const main = a.includes("-") ? b : a;
  const side = a.includes("-") ? a : b;
  return `${main}-${side}`;
}

/** "a gale", "a hurricane", "a great hurricane". */
export function forceWords(force: number): string {
  return force < 1.5
    ? "a tropical gale"
    : force < 2.5
      ? "a hurricane"
      : force < 3.5
        ? "a strong hurricane"
        : force < 4.5
          ? "a great hurricane"
          : "one of the greatest storms";
}

/** The province nearest a point (for "off Santo Domingo"). */
export function nearestProv(ui: GameUi, lat: number, lon: number): number {
  let best = -1;
  let bestD = Infinity;
  ui.map.provinces.forEach((d, p) => {
    if (d.closed) return;
    const k = (d.lat - lat) ** 2 + ((d.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (k < bestD) {
      bestD = k;
      best = p;
    }
  });
  return best;
}

function stormSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const month = dateOf(s.day).month;
  const live = seaOf(s).storms.filter((x: Storm) => x.ended === undefined && x.force >= 1);
  const season = month >= 5 && month <= 10;
  if (!live.length && !season) return html``;
  return section(
    html`Hurricanes`,
    html`${live.length
      ? html`<ul class="cq-sea-storms">
          ${live.map((st) => {
            const p = nearestProv(ui, st.lat, st.lon);
            return html`<li>
              <b>${cap(stormName(st))}</b>, ${forceWords(st.force)}, near
              ${provLink(ui, p)}: moving ${compass(st.dir)} at about
              ${st.km} km a day.
            </li>`;
          })}
        </ul>`
      : html`<p class="cq-muted small">No storm abroad just now.</p>`}
    <p class="cq-muted small">
      The season runs June to November, worst in August and September. They
      come out of the tropical Atlantic and the Caribbean, run west and
      north-west, and most turn north and north-east; some go on into the
      Gulf, a few up the coast. A day or two ahead come the signs: a long
      swell, a falling glass, a red sky. Batten down, or run for a harbour.
    </p>`,
  );
}
