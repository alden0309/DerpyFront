// TOWNS (r17): Society › Town. The town you're in: what its body has before
// it (each proposal with who sits, how each leans and why, the chance it
// carries, and your vote), a work to put or petition for (with the odds as
// they'd stand and the cost on the button), what's carried and building
// (the subscription, with its sums on the buttons, and the work's
// progress), what stands and what lies in ruins, who's lately come or gone,
// and the town's record. Every figure is the engine's own (WorksCore.ts):
// the odds shown are the odds the sitting rolls.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import { isNativeChar, placesIn } from "../../engine/LifeQueries";
import { PLACES } from "../../engine/LifeRules";
import { chanceWords } from "../../engine/Odds";
import { officeName } from "../../engine/Offices";
import { settlers } from "../../engine/Queries";
import {
  arrivalsAt,
  headsOf,
  householdRoom,
  townsOf,
} from "../../engine/TownsCore";
import type {
  Character,
  Life,
  TownRuin,
  TownWork,
  TownWorkKey,
} from "../../engine/Types";
import {
  bodyOf,
  carryChance,
  isMember,
  type Lean,
  leansOn,
  levyFor,
  membersOf,
  type Motion,
  PLEDGES,
  progressOf,
  proposeCheck,
  stillWanted,
  subscribeCheck,
  subscribed,
  SUBSCRIPTIONS,
  TOWN_WORKS,
  voteCheck,
  workCost,
  workName,
  worksFor,
  yearOfDay,
} from "../../engine/WorksCore";
import { action, bar, charLink, GameUi, more, section } from "./Context";
import { howTo, pageHead } from "./Nav";
import { coins, price } from "./Price";
import { term, termMark } from "./Terms";

const lc = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const pct = (p: number) => `${Math.round(p * 100)}%`;

/** The work chosen to put, and the pledge with it (this page only). */
let chosen: TownWorkKey | null = null;
let pledge = 0;

function motionFor(
  ui: GameUi,
  life: Life,
  key: TownWorkKey,
  coinsDown: number,
): Motion {
  const s = ui.s;
  const p = life.prov;
  const cost = workCost(s, p, key);
  return {
    p,
    key,
    repair: cost.repair,
    by: life.c,
    petition: !isMember(s, p, life),
    levy: levyFor(s, p, cost.cost),
    pledge: coinsDown,
    seed: s.day,
  };
}

function workMotion(work: TownWork): Motion {
  return {
    p: work.p,
    key: work.key,
    repair: work.repair,
    by: work.by,
    petition: work.petition,
    levy: work.levy,
    pledge: work.pledge,
    seed: work.id,
  };
}

/** Someone's place on the body: "Justice of the peace", "Of the town". */
function seatOf(ui: GameUi, c: Character): string {
  const s = ui.s;
  const o = (s.society?.offices[ui.life!.prov] ?? []).find(
    (x) => x.holder === c.id,
  );
  if (o) return officeName(s, o);
  return isNativeChar(s, c) ? "An elder of the town" : "A freeholder";
}

/** "likely aye, 4 in 5" for a member, with their reasons on a line. */
function leanRow(ui: GameUi, l: Lean, life: Life): TemplateResult {
  const s = ui.s;
  const c = s.chars[l.c];
  if (!c) return html``;
  const you = l.c === life.c;
  const side = l.player
    ? (l.cast ?? 0) > 0
      ? html`<span class="cq-chip good">aye</span>`
      : (l.cast ?? 0) < 0
        ? html`<span class="cq-chip bad">no</span>`
        : html`<span class="cq-chip">not voted</span>`
    : html`<span
        class="cq-chip ${l.p >= 0.6 ? "good" : l.p <= 0.4 ? "bad" : ""}"
        title=${`An aye ${pct(l.p)}`}
        >${l.p >= 0.5 ? "likely aye" : "likely no"},
        ${chanceWords(l.p >= 0.5 ? l.p : 1 - l.p)}</span
      >`;
  const why = l.lines
    .slice(0, 2)
    .map((x) => `${x.why} (${x.v > 0 ? "+" : "−"}${Math.abs(x.v)})`)
    .join("; ");
  return html`<li class="cq-town-member">
    <span class="cq-town-member-who"
      >${you ? html`<b>You</b>` : charLink(ui, c, false)}
      <span class="cq-muted small">${seatOf(ui, c)}</span></span
    >
    ${side}
    ${why
      ? html`<span class="cq-muted small cq-town-why">${why}</span>`
      : nothing}
  </li>`;
}

/** The chance a motion carries, and what each way comes to, from the sitting's own numbers. */
function oddsBlock(
  ui: GameUi,
  p: number,
  key: TownWorkKey,
  odds: number,
  levy: number,
  coinsDown: number,
): TemplateResult {
  const s = ui.s;
  const body = bodyOf(s, p, key);
  const name = lc(workName(s, p, key));
  return html`<div class="cq-odds-panel cq-town-odds">
    <p class="cq-odds-head">
      <b>When ${body.name} sits</b
      ><span>More ayes than noes carries it; a tie throws it out.</span>
    </p>
    <ul class="cq-odds-rows">
      <li>
        <span class="cq-odds-chance" title=${pct(odds)}
          >${chanceWords(odds)}</span
        >
        <span class="cq-odds-what"
          >Carried: ${levy} by ${body.levy} (the town grows a little restless),
          the rest by
          ${term("subscription", "subscription")}${coinsDown
            ? html`, your ${coins(coinsDown)} paid then`
            : nothing};
          then ${name} is built.</span
        >
      </li>
      <li class="bad">
        <span class="cq-odds-chance" title=${pct(1 - odds)}
          >${chanceWords(1 - odds)}</span
        >
        <span class="cq-odds-what"
          >Thrown out: nothing paid, and not again for half a year.</span
        >
      </li>
    </ul>
  </div>`;
}

// ---------------------------------------------------------------- the page

export function townPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const p = life.prov;
  const town = ui.map.provinces[p]?.name ?? "the town";
  const head = pageHead(
    "The town",
    html`Who's lately come to ${town}, what stands and what lies in
    ${term("ruins", "ruins")}, and its public works:
    ${term("townbody", "the town's body")} votes them, a ${term("levy", "levy")}
    and a ${term("subscription", "subscription")} pay for them.`,
  );
  if (life.travel)
    return html`${head}
      <p class="cq-empty">
        On the road. A town's business shows when you're there.
      </p>`;
  const pr = s.provinces[p];
  if (!pr || pr.owner < 0)
    return html`${head}
      <p class="cq-empty">
        Open country: no town, and nobody to vote anything.
      </p>`;
  return html`${head} ${bodySection(ui, life)} ${proposeSection(ui, life)}
  ${buildingSection(ui, life)} ${placesSection(ui, p)} ${cameSection(ui, p)}
  ${recordSection(ui, p)}`;
}

function bodySection(ui: GameUi, life: Life): TemplateResult {
  const s = ui.s;
  const p = life.prov;
  const body = bodyOf(s, p);
  const members = membersOf(s, p);
  const mine = isMember(s, p, life);
  const open = townsOf(s).works.filter(
    (x) => x.p === p && x.stage === "proposed",
  );
  return section(
    html`Before ${body.name} ${termMark("townbody")}`,
    html`<p class="small cq-pad">
        ${cap(body.name)}: ${body.who}. ${members.length} sit now.
        ${mine
          ? html`<b>You sit on it</b>: you put works to it and vote.`
          : html`You don't sit on it: you can petition it (a county office gives
            you a seat: Society › Office).`}
        It sits on the first of the month.
      </p>
      ${open.length
        ? html`<div class="cq-town-cards">
            ${open.map((w) => proposalCard(ui, life, w))}
          </div>`
        : html`<p class="cq-muted small cq-pad">
            Nothing before ${body.name} just now.
          </p>`}`,
  );
}

function proposalCard(ui: GameUi, life: Life, work: TownWork): TemplateResult {
  const s = ui.s;
  const leans = leansOn(s, workMotion(work), work.cast);
  const odds = carryChance(leans);
  const by = s.chars[work.by];
  const vote = voteCheck(s, life, work);
  const mine = isMember(s, work.p, life);
  const cast = work.cast[life.c] ?? 0;
  return html`<article class="cq-town-card">
    <header>
      <b>${workName(s, work.p, work.key)}</b>
      ${work.repair ? html`<span class="cq-chip gold">repair</span>` : nothing}
      <span class="cq-muted small"
        >${work.petition ? "petitioned for" : "brought"} by
        ${work.by === life.c ? "you" : charLink(ui, by, false)}; sits on
        ${formatDate(work.sits)}</span
      >
    </header>
    <p class="small">
      ${TOWN_WORKS[work.key].text} ${coins(work.cost)} coins:
      ${coins(work.levy)} by ${bodyOf(s, work.p, work.key).levy}, the rest by
      subscription${work.pledge
        ? html` (${coins(work.pledge)} pledged by its mover)`
        : nothing}.
    </p>
    ${oddsBlock(
      ui,
      work.p,
      work.key,
      odds,
      work.levy,
      work.by === life.c ? work.pledge : 0,
    )}
    ${more(
      html`How the members lean (${leans.length})`,
      html`<ul class="cq-town-members">
        ${leans.map((l) => leanRow(ui, l, life))}
      </ul>`,
      false,
    )}
    <div class="cq-btnrow">
      ${mine
        ? html`${action(
            html`Vote aye${cast > 0 ? " ✓" : ""}`,
            vote,
            () => void ui.cmd({ k: "towns", act: "vote", id: work.id, v: 1 }),
            `small ${cast > 0 ? "primary" : ""}`,
          )}
          ${action(
            html`Vote no${cast < 0 ? " ✓" : ""}`,
            vote,
            () => void ui.cmd({ k: "towns", act: "vote", id: work.id, v: -1 }),
            `small ${cast < 0 ? "primary" : ""}`,
            undefined,
            false,
          )}`
        : html`<span class="cq-muted small"
            >Members vote; you'll hear how it went.</span
          >`}
      ${work.by === life.c
        ? action(
            "Withdraw it",
            { ok: true },
            () => void ui.cmd({ k: "towns", act: "withdraw", id: work.id }),
            "small",
          )
        : nothing}
    </div>
  </article>`;
}

function proposeSection(ui: GameUi, life: Life): TemplateResult {
  const s = ui.s;
  const p = life.prov;
  const mine = isMember(s, p, life);
  const body = bodyOf(s, p, chosen ?? undefined);
  const list = worksFor(s, ui.w, p);
  if (chosen && !list.some((x) => x.key === chosen)) chosen = null;
  const row = (key: TownWorkKey, ok: boolean, why: string) => {
    const def = TOWN_WORKS[key];
    const cost = workCost(s, p, key);
    return html`<li class="cq-town-work ${chosen === key ? "on" : ""}">
      <button
        class="cq-town-pick"
        ?disabled=${!ok}
        aria-pressed=${chosen === key}
        @click=${() => {
          chosen = chosen === key ? null : key;
          pledge = 0;
          ui.redraw();
        }}
      >
        <span class="cq-town-work-name"
          >${workName(s, p, key)}${cost.repair
            ? html` <span class="cq-chip gold">repair</span>`
            : nothing}</span
        >
        <span class="cq-town-work-cost"
          >${coins(cost.cost)} coins · ${cost.months}
          month${cost.months === 1 ? "" : "s"}</span
        >
        <span class="cq-muted small cq-town-work-does"
          >${ok ? def.does : why}</span
        >
      </button>
    </li>`;
  };
  const pick = chosen;
  let panel: TemplateResult | typeof nothing = nothing;
  if (pick) {
    const check = proposeCheck(s, ui.w, life, pick, pledge);
    const m = motionFor(ui, life, pick, pledge);
    const cast: Record<number, number> = mine ? { [life.c]: 1 } : {};
    const odds = carryChance(leansOn(s, m, cast));
    const cost = workCost(s, p, pick);
    panel = html`<div class="cq-town-panel">
      <p class="small">
        <b>${workName(s, p, pick)}</b>${cost.repair
          ? " (a repair of what was ruined: half the cost)"
          : ""}:
        ${TOWN_WORKS[pick].text}
      </p>
      <p class="small">
        Put your own money down with it? It's paid only if it carries, and
        members think the better of it.
      </p>
      <div class="cq-btnrow cq-town-pledges" role="group" aria-label="Pledge">
        ${PLEDGES.map(
          (c) =>
            html`<button
              class="cq-btn small ${pledge === c ? "primary" : ""}"
              aria-pressed=${pledge === c}
              ?disabled=${c > life.purse}
              @click=${() => {
                pledge = c;
                ui.redraw();
              }}
            >
              ${c ? price(c, { have: life.purse }) : "Nothing"}
            </button>`,
        )}
      </div>
      ${oddsBlock(ui, p, pick, odds, m.levy, pledge)}
      <div class="cq-btnrow">
        ${action(
          html`${mine
            ? `Put it to ${body.name}`
            : `Petition ${body.name}`}${pledge
            ? price(pledge, {
                have: life.purse,
                note: "Paid only if it carries",
              })
            : nothing}`,
          check.ok ? { ok: true } : { ok: false, why: check.why },
          () => {
            const k = pick;
            const c = pledge;
            chosen = null;
            pledge = 0;
            void ui.cmd({ k: "towns", act: "propose", key: k, coins: c });
          },
          "small primary",
        )}
      </div>
    </div>`;
  }
  return section(
    mine ? html`Put a work to ${body.name}` : html`Petition ${body.name}`,
    html`<ul class="cq-town-works">
        ${list.map((x) => row(x.key, x.check.ok, x.check.why))}
      </ul>
      ${panel}`,
  );
}

function buildingSection(ui: GameUi, life: Life): TemplateResult {
  const s = ui.s;
  const p = life.prov;
  const works = townsOf(s).works.filter(
    (x) => x.p === p && (x.stage === "carried" || x.stage === "building"),
  );
  if (!works.length) return html``;
  return section(
    "Carried, and building",
    html`<div class="cq-town-cards">
      ${works.map((w) =>
        w.stage === "carried"
          ? subscriptionCard(ui, life, w)
          : buildingCard(ui, w),
      )}
    </div>`,
  );
}

function subscriptionCard(
  ui: GameUi,
  life: Life,
  work: TownWork,
): TemplateResult {
  const s = ui.s;
  const want = stillWanted(work);
  const raised = work.levy + subscribed(work);
  const givers = Object.entries(work.subs)
    .map(([c, v]) => ({ c: s.chars[Number(c)], v }))
    .filter((x) => x.c)
    .sort((a, b) => b.v - a.v)
    .slice(0, 5);
  const amounts = [...SUBSCRIPTIONS.filter((c) => c < want), want];
  return html`<article class="cq-town-card">
    <header>
      <b>${workName(s, work.p, work.key)}</b>
      <span class="cq-chip good">carried ${work.ayes} to ${work.noes}</span>
      <span class="cq-muted small"
        >the ${term("subscription", "subscription")} is open until
        ${formatDate(work.until ?? s.day)}</span
      >
    </header>
    <p class="small">
      ${coins(raised)} of ${coins(work.cost)} raised (${coins(work.levy)} by
      ${bodyOf(s, work.p, work.key).levy}); <b>${coins(want)} still wanted</b>.
      If it isn't subscribed by then, a second levy raises the rest.
    </p>
    ${bar(raised / Math.max(1, work.cost), "cq-town-bar")}
    ${givers.length
      ? html`<p class="cq-muted small">
          Subscribed:
          ${givers.map(
            (x, i) =>
              html`${i ? ", " : ""}${x.c!.id === life.c
                ? "you"
                : charLink(ui, x.c, false)}
              ${coins(x.v)}`,
          )}
        </p>`
      : nothing}
    <div class="cq-btnrow">
      ${amounts.map((c, i) => {
        const check = subscribeCheck(s, life, work, c);
        return action(
          html`${i === amounts.length - 1 && amounts.length > 1
            ? "The rest"
            : "Subscribe"}${price(c, { have: life.purse })}`,
          check.ok ? { ok: true } : { ok: false, why: check.why },
          () =>
            void ui.cmd({
              k: "towns",
              act: "subscribe",
              id: work.id,
              coins: c,
            }),
          "small",
          undefined,
          i === 0,
        );
      })}
    </div>
  </article>`;
}

function buildingCard(ui: GameUi, work: TownWork): TemplateResult {
  const s = ui.s;
  const f = progressOf(work, s.day);
  return html`<article class="cq-town-card">
    <header>
      <b>${workName(s, work.p, work.key)}</b>
      <span class="cq-chip">building</span>
      <span class="cq-muted small"
        >begun ${formatDate(work.begun ?? s.day)}; finished about
        ${formatDate(work.done ?? s.day)}</span
      >
    </header>
    ${bar(f, "cq-town-bar")}
    <p class="cq-muted small">
      ${Math.round(f * 100)}% done. ${TOWN_WORKS[work.key].does}.
    </p>
  </article>`;
}

/** "burned by the Muscogee, 1721". */
function ruinWords(ui: GameUi, r: TownRuin): string {
  const by = ui.s.nations[r.by];
  return `${r.how === "burned" ? "burned" : "left to ruin"}${by ? ` by the ${by.kind === "native" ? by.name : by.adjective}` : ""}, ${yearOfDay(r.day)}`;
}

function placesSection(ui: GameUi, p: number): TemplateResult {
  const s = ui.s;
  const native = s.nations[s.provinces[p].owner]?.kind === "native";
  const places = placesIn(s, ui.w, p).filter((x) => x !== "den");
  const ruins = (townsOf(s).ruins[p] ?? []).filter((r) => r.lvl > 0);
  const kept = townsOf(s).kept[p] ?? {};
  const keptKeys = Object.keys(kept) as TownWorkKey[];
  return section(
    "What stands, and what's in ruins",
    html`<p class="cq-place-list">
        ${places.map(
          (pl) =>
            html`<span class="cq-chip cq-place-chip"
              >${native && PLACES[pl].nativeName
                ? PLACES[pl].nativeName
                : PLACES[pl].name.replace(/^The /, "")}</span
            >`,
        )}
        ${keptKeys.map(
          (k) =>
            html`<span class="cq-chip cq-place-chip good"
              >${workName(s, p, k)}, ${yearOfDay(kept[k]!)}</span
            >`,
        )}
      </p>
      ${ruins.length
        ? html`<ul class="cq-town-ruins">
            ${ruins.map(
              (r) =>
                html`<li>
                  <b>${workName(s, p, r.key)}</b>
                  <span class="cq-chip bad">in ruins</span>
                  <span class="cq-muted small"
                    >${ruinWords(ui, r)}. ${term("ruins", "A repair")} by vote
                    costs ${coins(workCost(s, p, r.key).cost)}.</span
                  >
                </li>`,
            )}
          </ul>`
        : nothing}`,
  );
}

function cameSection(ui: GameUi, p: number): TemplateResult {
  const s = ui.s;
  const list = arrivalsAt(s, p);
  const room = householdRoom(s, p);
  const heads = headsOf(s, p).length;
  return section(
    html`Lately come ${termMark("newcomers")}`,
    html`<p class="cq-muted small cq-pad">
        ${Math.round(settlers(s.provinces[p]))} settlers; ${heads}
        household${heads === 1 ? "" : "s"} besides the town's posts (room for
        ${room} as it stands). Newcomers come by ship and road as the town
        grows.
      </p>
      ${list.length
        ? html`<ul class="cq-town-came">
            ${list.map(
              (a) =>
                html`<li class=${a.gone ? "gone" : ""}>
                  <span class="cq-log-date">${formatDate(a.day)}</span>
                  <span
                    >${a.text}
                    ${!a.gone && s.chars[a.c]?.alive
                      ? charLink(ui, s.chars[a.c], true)
                      : nothing}</span
                  >
                </li>`,
            )}
          </ul>`
        : howTo("Nobody new lately.", [
            "Ships and the road bring families, single men and women, widows and servants as the town grows.",
            "A town that's had nobody to marry for a year or two draws someone.",
          ])}`,
  );
}

function recordSection(ui: GameUi, p: number): TemplateResult {
  const s = ui.s;
  const past = townsOf(s)
    .past.filter((x) => x.p === p)
    .slice()
    .reverse();
  if (!past.length) return html``;
  const word: Record<string, string> = {
    done: "built",
    lost: "thrown out",
    lapsed: "lapsed",
  };
  return section(
    "The town's record",
    html`<ul class="cq-town-record">
      ${past.map(
        (w) =>
          html`<li>
            <span class="cq-log-date">${formatDate(w.done ?? w.sits)}</span>
            <b>${workName(s, w.p, w.key)}</b>${w.repair ? " (repaired)" : ""}:
            ${word[w.stage] ?? w.stage}${w.ayes !== undefined
              ? `, ${w.ayes} to ${w.noes}`
              : ""}${w.stage === "lost" && w.votes
              ? html`<span class="cq-muted small">
                  (${w.votes
                    .filter((v) => v.v < 0 && v.why)
                    .slice(0, 2)
                    .map((v) => lc(v.why))
                    .join("; ")})</span
                >`
              : nothing}
          </li>`,
      )}
    </ul>`,
  );
}

/** For the Here panel: a line when the town has ruins, and the way to the page. */
export function townRuinsNote(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  if (!life || life.travel) return nothing;
  const p = life.prov;
  const ruins = (townsOf(s).ruins[p] ?? []).filter((r) => r.lvl > 0);
  if (!ruins.length) return nothing;
  const r = ruins[0];
  return html`<div class="cq-callout cq-town-note">
    <p class="small">
      ${workName(s, p, r.key)} here lies in ruins (${ruinWords(ui, r)}).
      ${cap(bodyOf(s, p, r.key).name)} can vote to repair it.
    </p>
    <button
      class="cq-btn small"
      @click=${() => ui.open({ k: "tab", tab: "society", sub: "town" })}
    >
      The town
    </button>
  </div>`;
}

/** A newcomer's card line ("A cooper, lately come from Bristol"). */
export function cameWords(ui: GameUi, c: Character): string | null {
  const s = ui.s;
  const k = c.came;
  if (k?.as) {
    const lately = s.day - k.day < 3 * 365;
    const from =
      k.how === "ship" ||
      k.how === "road" ||
      k.how === "kin" ||
      k.how === "visit"
        ? lately
          ? `, lately come from ${k.from}`
          : `, come from ${k.from}`
        : k.how === "marry"
          ? `, married in from ${k.from}`
          : "";
    return `${cap(k.as)}${from}`;
  }
  // Their family's: a newcomer's wife or child.
  const head =
    [s.chars[c.father], s.chars[c.mother], s.chars[c.spouse]].find(
      (x) => x?.came?.as,
    ) ?? undefined;
  if (!head?.came?.as || /^the |'s /.test(head.came.as)) return null;
  const as = head.came.as.replace(/^an? /, "");
  if (head.id === c.spouse)
    return `${c.female ? "Wife" : "Husband"} of the ${as}`;
  return `${c.female ? "Daughter" : "Son"} of the ${as}`;
}

/** Whether a page mark is due: a vote of yours waiting. */
export function townMarks(ui: GameUi): number {
  const s = ui.s;
  const life = ui.life;
  if (!life || life.travel) return 0;
  return townsOf(s).works.filter(
    (w) =>
      w.p === life.prov &&
      w.stage === "proposed" &&
      w.cast[life.c] === undefined &&
      isMember(s, life.prov, life),
  ).length;
}
