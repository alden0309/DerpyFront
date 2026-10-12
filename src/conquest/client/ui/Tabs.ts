// The tabs' pages (r11 wave 2). Each tab has the same pages every time; a
// page with nothing to show yet says what it's for, how to get there, and
// gives a button to start. Work, Estate and Society are what "Affairs" was,
// split by subject; the People, Work and Estate pages also list what every
// place in town offers (who hires, who's for hire, contracts, boats), so you
// needn't click through the places to find them.

import { html, nothing, TemplateResult } from "lit";
import { areaName, areasOf } from "../../engine/Areas";
import { BOATS, boatyard } from "../../engine/Boats";
import { CONTRACT_PLACES } from "../../engine/Contracts";
import { heatOf, isLawman, knowsDen, lawAt } from "../../engine/CrimeQueries";
import { raiseCheck } from "../../engine/Followers";
import { interactionView } from "../../engine/Interactions";
import {
  hasPlace,
  isChildLife,
  lifeIsNative,
  startRank,
} from "../../engine/LifeQueries";
import { JOBS, LAND_GRANT, LAND_LOT } from "../../engine/LifeRules";
import { localOfficesOf, officeTitle } from "../../engine/Offices";
import { charName } from "../../engine/Queries";
import { takeUpCheck, takeUpLabel, takeUpsAt } from "../../engine/Trades";
import type { JobKind, PlaceKind } from "../../engine/Types";
import { employersIn } from "../../engine/Work";
import { placeIcon } from "../Icons";
import {
  ambitionSection,
  armySection,
  causeSection,
  europeSection,
  governingSection,
  propertySection,
  purseSection,
  standingSection,
  WHERE_TO_SPEND,
  workSection,
} from "./Affairs";
import { businessPage, startBizButton } from "./Business"; // BUSINESS (r15)
import { councilPage } from "./Chamber"; // POWER (r12)
import {
  accuseSection,
  foundingPage,
  officesPage,
  subordinatesSection,
} from "./Civic";
import { GameUi, section, token, type Tab } from "./Context";
import { familyTreeSection } from "./FamilyTree"; // HOME (r12)
import { pressPage } from "./Gazette"; // POWER (r12)
import { verdictChip } from "./Here";
import { housesSection } from "./Home"; // HOME (r12)
import { journalTab } from "./Journal";
import { acresSection, ledgerPage } from "./Ledger"; // LEDGER (r15)
import {
  atPlace,
  boatsSection,
  boatyardPart,
  companySection,
  contractsPart,
  contractsSection,
  crimePart,
  hirePart,
  jailCallout,
  lawSection,
  peopleSection,
  tradesPage,
  type PlacePart,
} from "./Livelihood";
import { howTo, pageHead } from "./Nav";
import { partnersPage } from "./Partners"; // PARTNERS (r13)
import { schoolingSection } from "./Schooling"; // EDU (r13)
import { seaPage } from "./SeaPage"; // SEA (r15)
import {
  familySection,
  goodsSection,
  livingSection,
  tiesSection,
  youTab,
} from "./Sheet";
import {
  constituteCallout,
  gatheringsPage,
  heartSection,
  lettersPage,
  tonguesSection,
} from "./Society";
import { term, termMark } from "./Terms";
import { peopleTab } from "./World";
import { fogOfUi } from "./WorldUi";

/** The page of a tab (for the tabs that have pages). */
export function tabPage(ui: GameUi, tab: Tab, sub: string): TemplateResult {
  const life = ui.life;
  if (!life || !ui.me)
    return tab === "journal"
      ? journalTab(ui, sub)
      : tab === "people"
        ? peopleTab(ui)
        : html`<p class="cq-empty">
            You're watching. Take over someone, or begin a new life (Here).
          </p>`;
  switch (tab) {
    case "you":
      return youPage(ui, sub);
    case "people":
      return sub === "yours" ? yourPeoplePage(ui) : peopleTab(ui);
    case "work":
      return workPage(ui, sub);
    case "estate":
      return estatePage(ui, sub);
    case "society":
      return societyPage(ui, sub);
    case "journal":
      return journalTab(ui, sub);
    default:
      return html``;
  }
}

const townName = (ui: GameUi) => ui.map.provinces[ui.life!.prov]?.name ?? "";

/** "the tavern", "the governor's house". */
const placeWord = (ui: GameUi, a: PlaceKind) =>
  areaName(ui.s, ui.life!.prov, a).replace(/^The /, "the ");

/** A place's parts, for every place in town that has one. */
function townParts(
  ui: GameUi,
  make: (ui: GameUi, p: number, a: PlaceKind) => PlacePart | null,
  only?: PlaceKind[],
): { a: PlaceKind; part: PlacePart }[] {
  const life = ui.life!;
  if (life.travel) return [];
  const out: { a: PlaceKind; part: PlacePart }[] = [];
  for (const a of areasOf(ui.s, ui.w, life.prov, life)) {
    if (only && !only.includes(a)) continue;
    const part = make(ui, life.prov, a);
    if (part) out.push({ a, part });
  }
  return out;
}

function partList(
  ui: GameUi,
  parts: { a: PlaceKind; part: PlacePart }[],
): TemplateResult {
  return html`${parts.map(
    ({ a, part }) =>
      html`<h4 class="cq-area-h cq-at-place">
          ${placeIcon(a)} At ${placeWord(ui, a)}
          ${part.note && part.key !== "hire"
            ? html`<span class="cq-muted small">${part.note}</span>`
            : nothing}
        </h4>
        ${part.body}`,
  )}`;
}

// ---------------------------------------------------------------- You

function youPage(ui: GameUi, sub: string): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  switch (sub) {
    case "ambition": {
      const amb = ambitionSection(ui);
      return html`${pageHead(
        "Ambition",
        "Something you've set your heart on. It gives a life its shape; getting there is worth renown and peace of mind.",
      )}
      ${amb === nothing
        ? html`<p class="cq-empty">
            At sixteen you can set your heart on something.
          </p>`
        : amb}`;
    }
    case "family": {
      const spouse = s.chars[me.spouse];
      return html`${pageHead(
        "Family",
        "Your husband or wife, your children and your heir, your line, and the people who matter to you.",
      )}
      ${familyTreeSection(ui)} ${schoolingSection(ui)} ${familySection(ui, me)}
      ${heartSection(ui)} ${tiesSection(ui)}
      ${!spouse?.alive && !isChildLife(s, life)
        ? section(
            "Marrying",
            howTo(
              "You're unmarried. To marry:",
              [
                html`Meet people: the church's <i>Seek a match</i> (or the
                  council fire) introduces the unmarried of the parish.`,
                html`<i>Court</i> someone who likes you (their card), until they
                  love you.`,
                html`<i>Propose</i>. Or write a proposal of marriage by letter,
                  if they're far off.`,
              ],
              undefined,
              true,
            ),
          )
        : nothing}`;
    }
    case "tongues":
      return html`${pageHead(
        "Tongues",
        "What you speak and how well. With no tongue in common you talk by signs, and most things can't be said.",
      )}
      ${tonguesSection(ui)}`;
    default:
      return youTab(ui);
  }
}

// ---------------------------------------------------------------- People › Your people

function yourPeoplePage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const company = companySection(ui);
  const raise = raiseCheck(s, life);
  const hire = townParts(ui, hirePart);
  return html`${pageHead(
    "Your people",
    html`Clerks, hands, swords, mates, guides, rogues and officers in your
    service, for wages (rogues for a share). Each is a real person with a
    ${term("loyalty", "loyalty")} of their own.`,
  )}
  ${isChildLife(s, life)
    ? html`<p class="cq-empty">Not until you're sixteen.</p>`
    : html`${peopleSection(ui)}
      ${!life.company && !raise.ok && /^Only a/.test(raise.why)
        ? section(
            "A company of your own",
            howTo(
              "Twenty men on your bounty (40 coins), paid monthly, drilled in quarters, and led on contracts or into the field in wartime. Who may raise one:",
              [
                "a militia captain, an army captain or a war leader;",
                html`or anyone with ${term("renown")} 40 (you have
                ${Math.round(life.renown)}).`,
              ],
            ),
          )
        : company}
      ${section(
        html`For hire in ${townName(ui)}`,
        hire.length
          ? partList(ui, hire)
          : howTo(
              life.travel
                ? "Nobody's for hire on the road."
                : `Nobody's for hire in ${townName(ui)} just now.`,
              [
                "Clerks and factors at the market and the docks; hands at the tavern, the fields and the docks; swords at the tavern and the fort; mates at the docks; guides at a village, the woods or the tavern; officers at the fort and the tavern; rogues at the den.",
                "A new lot comes each month. Or ask a friend, or anyone without a post, to join you: their card, Into your service.",
              ],
            ),
      )}`}`;
}

// ---------------------------------------------------------------- Work

function workPage(ui: GameUi, sub: string): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  switch (sub) {
    case "find":
      return findWorkPage(ui);
    case "contracts": {
      const offers = townParts(ui, contractsPart, CONTRACT_PLACES);
      const taken = contractsSection(ui);
      return html`${pageHead(
        "Contracts",
        html`Escorts, outlaw hunts, guard duty, raids, exploring, finding
        someone, rewards for a wanted man: a fee for a job, two at a time. A
        fight weighs your ${term("strength")} against theirs.`,
      )}
      ${taken}
      ${section(
        html`Offered in ${townName(ui)}`,
        offers.length
          ? partList(ui, offers)
          : howTo(`No contracts on offer in ${townName(ui)} just now.`, [
              "They're posted at the tavern, the governor's house, the watch-house and the council fire, a few each month.",
              "Get to the place before the date. Pay comes on success; a contract let lapse costs a little renown.",
            ]),
      )}`;
    }
    case "law":
      return lawPage(ui);
    case "sea": // SEA (r15)
      return seaPage(ui);
    default: {
      const army = armySection(ui);
      return html`${pageHead(
        "Your work",
        "Your place, how hard you go at it, and the ladder above you. Your days at your post are worked for you; wages come at the month's end.",
      )}
      ${jailCallout(ui)} ${workSection(ui)}
      ${army === nothing && !isChildLife(s, life) && !lifeIsNative(s, life)
        ? html`<p class="cq-muted small cq-pad">
            The army and the militia take recruits at the fort (and the militia
            at the tavern): see Find work.
          </p>`
        : army}`;
    }
  }
}

/** Everyone who takes people on in this town, and what you could start yourself. */
function findWorkPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const p = life.prov;
  const child = isChildLife(s, life);
  const bosses = life.travel || child ? [] : employersIn(s, ui.w, p);
  // Trades you could set up on your own here, each once.
  const own: { k: JobKind; a: PlaceKind }[] = [];
  if (!life.travel && !child)
    for (const a of areasOf(s, ui.w, p, life))
      for (const k of takeUpsAt(s, ui.w, life, a))
        if (!own.some((x) => x.k === k)) own.push({ k, a });
  const byPlace = new Map<PlaceKind, typeof bosses>();
  for (const b of bosses)
    byPlace.set(b.place, [...(byPlace.get(b.place) ?? []), b]);
  // BUSINESS (r15): "A business of your own", before every trade.
  return html`${pageHead(
    "Find work",
    html`Who takes people on in ${townName(ui)}, what you could set up on your
    own here, and below, every trade in the Americas and how to get into it.`,
  )}
  ${child
    ? html`<p class="cq-empty">
        At sixteen the trades open to you. Until then, learn what you can.
      </p>`
    : life.travel
      ? html`<p class="cq-empty">On the road: look again when you arrive.</p>`
      : html`${life.job
          ? html`<p class="cq-callout small">
              You hold one job at a time: to take another, hand in your notice
              first (Your work).
            </p>`
          : nothing}
        ${section(
          html`Who hires in ${townName(ui)}`,
          bosses.length
            ? html`${[...byPlace].map(
                ([a, list]) =>
                  html`<h4 class="cq-area-h cq-at-place">
                      ${placeIcon(a)} At ${placeWord(ui, a)}
                    </h4>
                    <ul class="cq-hiring cq-find-list">
                      ${list.flatMap(({ c, jobs }) =>
                        jobs.map((k, i) => {
                          const v = interactionView(
                            s,
                            ui.w,
                            life,
                            c.id,
                            "work",
                            i,
                          );
                          const r = JOBS[k].ranks[0];
                          const mine =
                            life.job?.kind === k && life.job.employer === c.id;
                          return html`<li>
                            ${token(ui, c, "small")}
                            <span class="cq-folk-text">
                              <b
                                >${JOBS[k].ranks[startRank(s, life, k)]
                                  .title}</b
                              >
                              <span class="cq-muted small"
                                >${charName(c)} takes people on; ${r.wage} a
                                month, up to
                                ${JOBS[k].ranks[
                                  JOBS[k].ranks.length - 1
                                ].title.toLowerCase()}</span
                              >
                              ${!v.check.ok &&
                              !(life.job && /already/.test(v.check.why))
                                ? html`<span class="cq-why"
                                    >${v.check.why}</span
                                  >`
                                : nothing}
                            </span>
                            ${mine
                              ? html`<span class="cq-chip good">yours</span>`
                              : html`<button
                                  class="cq-btn small cq-ask ${v.will
                                    ? "primary"
                                    : ""}"
                                  ?disabled=${!v.check.ok}
                                  title=${v.check.ok
                                    ? JOBS[k].text
                                    : v.check.why}
                                  @click=${() =>
                                    ui.modal({
                                      k: "interact",
                                      c: c.id,
                                      act: "work",
                                      arg: i,
                                    })}
                                >
                                  Ask ${verdictChip(v)}
                                </button>`}
                          </li>`;
                        }),
                      )}
                    </ul>`,
              )}`
            : html`<p class="cq-muted small">
                Nobody takes people on here. A bigger town has more masters.
              </p>`,
        )}
        ${own.length
          ? section(
              "On your own account",
              html`<ul class="cq-hiring cq-find-list">
                ${own.map(({ k, a }) => {
                  const check = takeUpCheck(s, ui.w, life, k, a);
                  const def = JOBS[k];
                  return html`<li>
                    <span class="cq-lv-mono" aria-hidden="true"
                      >${def.crime ? "☠" : def.law ? "⚖" : "✦"}</span
                    >
                    <span class="cq-folk-text">
                      <b>${def.ranks[0].title}</b>
                      <span class="cq-muted small"
                        >at ${placeWord(ui, a)}; ${def.ranks[0].wage} a month at
                        first, up to
                        ${def.ranks[
                          def.ranks.length - 1
                        ].title.toLowerCase()}${def.crime
                          ? "; draws the law's heat"
                          : ""}</span
                      >
                      ${!check.ok && !(life.job && /already/.test(check.why))
                        ? html`<span class="cq-why">${check.why}</span>`
                        : nothing}
                    </span>
                    ${life.job?.kind === k
                      ? html`<span class="cq-chip good">yours</span>`
                      : html`<button
                          class="cq-btn small cq-ask ${check.ok
                            ? "primary"
                            : ""}"
                          ?disabled=${!check.ok}
                          title=${check.ok ? def.text : check.why}
                          @click=${() =>
                            atPlace(ui, a, { k: "takeup", job: k, place: a })}
                        >
                          ${takeUpLabel(k)}
                        </button>`}
                  </li>`;
                })}
              </ul>`,
            )
          : nothing}`}
  ${child || life.travel
    ? nothing
    : section(
        "A business of your own",
        html`<p class="small">
            A shop, an inn, a forge, a mill, a store, a ship, a farm: set one up
            here of any trade the town has the place for, alone or with a
            partner, and see its months one by one before you pay. Or a trading
            company for particular goods.
          </p>
          <div class="cq-btnrow">${startBizButton(ui)}</div>`,
      )}
  ${section("Every trade", tradesPage(ui, false))}`;
}

function lawPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const p = life.prov;
  const record = lawSection(ui);
  const nation = lawAt(s, p);
  const hasDen = !life.travel && hasPlace(s, ui.w, p, "den");
  const parts = townParts(ui, crimePart, ["den", "gaol", "tavern", "market"]);
  return html`${pageHead(
    "The law",
    html`The watch, the gaol and the courts, and the underworld beneath them.
    The law of each nation keeps its own ${term("heat")} on you; the underworld
    knows you by your ${term("notoriety")}.`,
  )}
  ${jailCallout(ui)}
  ${!life.crime && !isLawman(life)
    ? howTo(
        html`You're on the right side of the
        law${heatOf(life, nation) > 0 ? ", mostly" : ""}.`,
        [
          html`Crooked trades (thieving, fencing, smuggling, the highway,
          coining, piracy) pay, and draw ${term("heat")}. Each crooked day may
          bring the watch's hand on your collar: go quietly, bribe them, run, or
          fight.`,
          "Taken up, you wait in the gaol for the quarter sessions, then plead. Sentences run from a fine to the pillory, the whip, transportation for seven years, or (for the hanging matters, or with a record) the rope.",
          html`The den is in towns of 900 or more, capitals and busy ports. It's
            hidden until you find it: <i>Listen for the underworld</i> at the
            tavern.`,
          "Or serve the law: the watch and the thief-takers take rogues for wages and rewards.",
        ],
      )
    : record}
  ${life.travel
    ? nothing
    : section(
        html`In ${townName(ui)}`,
        html`<p class="small">
            ${hasDen
              ? knowsDen(life, p)
                ? "You know where the den is."
                : "There's a den here somewhere; you don't know where."
              : "Too small a town for a den."}
            ${hasPlace(s, ui.w, p, "gaol")
              ? "The watch-house keeps the gaol."
              : "No watch-house here."}
          </p>
          ${parts.length ? partList(ui, parts) : nothing}`,
      )}`;
}

// ---------------------------------------------------------------- Estate

function estatePage(ui: GameUi, sub: string): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const child = isChildLife(s, life);
  switch (sub) {
    case "house": {
      const native = lifeIsNative(s, life);
      return html`${pageHead(
        "House & land",
        "A house of your own eases the mind and lifts your station; land pays rent and gives you a vote; a business pays its takings.",
      )}
      ${child
        ? html`<p class="cq-empty">Not until you're sixteen.</p>`
        : html`${housesSection(ui)} ${acresSection(ui)} ${propertySection(ui)}
          ${section(
            "Where to buy",
            html`<ul class="cq-where-list small">
              <li>
                <b>${native ? "A lodge" : "A house"}</b>: at Home (Here › your
                lodgings or your house), where you can buy any size
                outright${native ? "" : " or rent one by the month"}; or with
                the button above, or at the market or a village. It stands in
                the ${native ? "village" : "town"} you're in; a better one
                replaces it for half the old one's worth. Rooms, furniture,
                servants and lodgers are added at Home.
              </li>
              ${native
                ? html`<li>
                    <b>Land</b> isn't bought and sold among your people.
                  </li>`
                : html`<li>
                      <b>Ten acres</b> (${LAND_LOT.cost} coins, up to
                      ${LAND_LOT.max * 10} acres in a town): here, or at the
                      fields. Let to tenants for rent every month.
                    </li>
                    <li>
                      <b>A land grant</b> (${LAND_GRANT.lots * 10} acres for
                      ${LAND_GRANT.fee} in fees): petition at the governor's
                      house, if the governor thinks well of you.
                    </li>
                    <li>
                      <b>A freehold of your own</b> makes a farmer a yeoman: the
                      fields (Buy a freehold), or your farm's next rung.
                    </li>`}
              <li>
                <b>A business</b>: start one here of any trade the town has the
                place for (Estate › Business, or the market), alone or with a
                partner. It also comes with the higher rungs of many trades (a
                shop, a press, a mill, a tavern): see Work. Or go into
                partnership: Estate › Partnerships.
              </li>
            </ul>`,
          )}`}`;
    }
    case "ledger": // LEDGER (r15)
      return ledgerPage(ui);
    case "boats":
      return boatsPage(ui);
    case "business": // BUSINESS (r15)
      return businessPage(ui);
    case "partners": // PARTNERS (r13)
      return partnersPage(ui);
    case "goods":
      return html`${pageHead(
        "Goods",
        "What you're carrying to sell, and what you owe. Goods and wares together count against the 20 loads you can carry (more in your own boat's hold).",
      )}
      ${goodsSection(ui)}
      ${Object.values(life.goods).some((v) => (v ?? 0) > 0) ||
      Object.values(life.wares ?? {}).some((v) => (v ?? 0) > 0) ||
      life.debts.some((d) => d.amount > 0)
        ? nothing
        : html`<p class="cq-empty">
            You carry nothing to sell, and owe nobody.
          </p>`}
      ${section(
        "Buying and selling",
        html`<p class="small">
            Every town's market (and its docks, and a native village) buys and
            sells. Each load you buy makes the next dearer here, and each you
            sell makes the next cheaper; prices drift back over two or three
            months. Buy where a good is made, sell where it's wanted.
          </p>
          ${marketHere(ui)}`,
      )}`;
    default:
      return html`${pageHead(
        "Purse",
        html`What comes in and goes out each month, how you live, what you keep
        and what's out working for you. Point at any figure for how it's made.`,
      )}
      ${child ? nothing : livingSection(ui)} ${purseSection(ui)}
      ${child
        ? nothing
        : section(
            "What money buys, and where",
            html`<dl class="cq-where-spend">
              ${WHERE_TO_SPEND.map(
                ([w, what]) =>
                  html`<dt>${w}</dt>
                    <dd>${what}</dd>`,
              )}
              <dt>The docks' boatyard</dt>
              <dd>a boat of your own (Estate › Boats)</dd>
              <dt>The tavern, the market, the fort, the den</dt>
              <dd>people in your service (People › Your people)</dd>
              <dt>Anywhere you're settled</dt>
              <dd>a house, ten acres (Estate › House & land)</dd>
            </dl>`,
          )}`;
  }
}

/** A button to the market, if you're where there is one. */
function marketHere(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  if (life.travel) return html``;
  const p = life.prov;
  const owner = s.provinces[p].owner;
  const native = owner >= 0 && s.nations[owner]?.kind === "native";
  const at = (["market", "docks", "village"] as PlaceKind[]).find(
    (a) => hasPlace(s, ui.w, p, a) && (a !== "village" || native),
  );
  if (!at)
    return html`<p class="cq-muted small">
      There's no market in ${townName(ui)}.
    </p>`;
  return html`<div class="cq-btnrow">
    <button
      class="cq-btn small primary"
      @click=${async () => {
        if (life.area !== at) await ui.cmd({ k: "enter", area: at });
        ui.modal({ k: "trade" });
      }}
    >
      Buy and sell at ${placeWord(ui, at)}
    </button>
  </div>`;
}

/** Your boats, the yard here, and where boats are to be had. */
function boatsPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const mine = boatsSection(ui);
  const yard = townParts(ui, boatyardPart, ["docks", "village"]);
  const has = (life.boats ?? []).length > 0;
  return html`${pageHead(
    "Boats",
    "A boat of your own carries you (and your goods and people) along the coast for no fare, and can earn while she lies in port. She stays where you leave her.",
  )}
  ${has
    ? mine
    : howTo("You have no boat.", [
        html`Boats are bought at a port's docks, at <i>The boatyard</i>: a canoe
          (${BOATS.canoe.price}), a shallop (${BOATS.shallop.price}) or a sloop
          (${BOATS.sloop.price}) at any docks; a schooner
          (${BOATS.schooner.price}) at a port; a brig (${BOATS.brig.price}) or a
          ship (${BOATS.ship.price}) at a great port. Second-hand ones are
          cheaper.`,
        "Native villages on the shore sell canoes.",
        "Bigger boats need a crew, paid monthly. A mate in your service can skipper her while you're ashore.",
      ])}
  ${yard.length
    ? section(html`For sale in ${townName(ui)}`, partList(ui, yard))
    : life.travel || isChildLife(s, life)
      ? nothing
      : html`<p class="cq-muted small cq-pad">
          No boats for sale in ${townName(ui)}.${nearestYard(ui)}
        </p>`}
  ${has
    ? html`<p class="cq-muted small cq-pad">
        To sail in her: open any coastal province (click it on the map), and
        choose her under <i>The road there</i>.
      </p>`
    : nothing}`;
}

/** " The nearest boatyard you know of is at X." */
function nearestYard(ui: GameUi): string {
  const life = ui.life!;
  const fog = fogOfUi(ui);
  const seen = new Set<number>([life.prov]);
  let edge = [life.prov];
  for (let hop = 0; hop < 6 && edge.length; hop++) {
    const next: number[] = [];
    for (const p of edge)
      for (const [q] of ui.map.provinces[p]?.nb ?? []) {
        if (seen.has(q)) continue;
        seen.add(q);
        if (fog && !fog.known.has(q)) continue;
        if (boatyard(ui.s, ui.w, q).some((k) => k !== "canoe"))
          return ` The nearest boatyard you know of is at ${ui.map.provinces[q].name}.`;
        next.push(q);
      }
    edge = next;
  }
  return "";
}

// ---------------------------------------------------------------- Society

function societyPage(ui: GameUi, sub: string): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  switch (sub) {
    case "office": {
      const held = localOfficesOf(s, me.id);
      const gov = governingSection(ui);
      return html`${gov}
        ${held.length
          ? section(
              "Offices you hold",
              html`<ul class="cq-list">
                ${held.map(
                  (o) =>
                    html`<li>
                      <button
                        class="cq-link"
                        @click=${() => ui.open({ k: "offices", p: o.prov })}
                      >
                        ${officeTitle(s, ui.w, o)}
                      </button>
                      <span class="cq-muted small"
                        >its duty and its lever are on the county's page</span
                      >
                    </li>`,
                )}
              </ul>`,
            )
          : nothing}
        ${subordinatesSection(ui)}
        ${life.travel
          ? html`<p class="cq-empty">
              On the road. A town's offices show when you're there.
            </p>`
          : officesPage(ui, life.prov)}
        ${accuseSection(ui)}
        <p class="cq-muted small cq-pad">
          One office at a time: winning, being appointed or accepting another
          resigns this one. The governor's council and the assembly's bills are
          on Society › Council; the road to them on Society › Standing.
        </p>`;
    }
    case "council": // POWER (r12)
      return councilPage(ui);
    case "press": // POWER (r12)
      return pressPage(ui);
    case "letters":
      return lettersPage(ui);
    case "gatherings":
      return gatheringsPage(ui);
    case "causes":
      return html`${pageHead(
        "Causes",
        "Movements for reform, against the crown, or to drive the colonists out. Join one, found one, grow it, and call the rising.",
      )}
      ${causeSection(ui)}`;
    case "colony":
      return html`${constituteCallout(ui)} ${foundingPage(ui)}`;
    default: {
      const eu = europeSection(ui);
      return html`${pageHead(
        "Standing",
        lifeIsNative(s, life)
          ? html`Your ${term("renown")} and the elders'
            ${term("favour", "regard")}, the place you hold, and the road to the
            council fire and to leading your people.`
          : html`Your ${term("renown")} and ${term("favour")}, the offices you
            hold, and the road to the assembly, the council and the governor's
            chair.`,
      )}
      ${standingSection(ui)}
      ${section(
        html`Winning favour ${termMark("favour")}`,
        html`<ul class="cq-where-list small">
          ${lifeIsNative(s, life)
            ? html`<li>
                <b>Offer tobacco and gifts</b> at the council fire: 2 coins,
                once a month. It wins 2 regard, and the elders there remember
                it.
              </li>`
            : html`<li>
                <b>Write to the crown</b> at the governor's house or the docks:
                2 coins, once in 60 days, a test of your Letters. A good letter
                wins 6 favour, a poor one 1.
              </li>`}
          <li>
            Gifts to the town (Estate › House & land), a burgess's bill that
            passes, and some choices in letters and events.
          </li>
          <li>
            It fades by 2% a month. It counts half again as much as renown when
            a governor is chosen, and helps petitions, charters and
            appointments.
          </li>
        </ul>`,
      )}
      ${eu}`;
    }
  }
}
