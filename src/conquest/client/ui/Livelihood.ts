// LIFE (r11): the panels for work that runs itself, the trades and how to
// get into them, the law and the underworld, your people, your company,
// your boats and contracts. The Here page shows what each place offers
// (people for hire at the tavern, the boatyard at the docks, contracts,
// the den's business, the watch-house); Affairs keeps the ledger of them.

import { html, nothing, TemplateResult } from "lit";
import {
  boatPrice,
  boatRoute,
  BOATS,
  boatsOf,
  boatyard,
  buyCheck,
  CREW_WAGE,
  repairCost,
  sailCheck,
  sellPrice,
  USE_NAMES,
  USE_TEXT,
  usedBoats,
} from "../../engine/Boats";
import { formatDate } from "../../engine/Calendar";
import {
  CONTRACT_NAMES,
  MAX_CONTRACTS,
  offeredHere,
  takeCheck,
} from "../../engine/Contracts";
import {
  arrestCheck,
  CRIME_ACTS,
  crimeActCheck,
  crimeActOdds,
} from "../../engine/Crime";
import {
  heatOf,
  isLawman,
  knowsDen,
  lawAt,
  notorietyOf,
  watchStrength,
} from "../../engine/CrimeQueries";
import {
  candidatesAt,
  COMPANY_BOUNTY,
  COMPANY_PAY,
  FOLLOWER_KINDS,
  followerCap,
  followerCost,
  followerDoing,
  followerSkill,
  followerTitle,
  hireCheck,
  peopleOf,
  promoteCheck,
  raiseCheck,
  recruitCheck,
  strengthOf,
} from "../../engine/Followers";
import { JOB_GROUPS, type JobGroup } from "../../engine/JobsData";
import { isChildLife, lifeOfChar } from "../../engine/LifeQueries";
import { JOBS, SKILL_NAMES } from "../../engine/LifeRules";
import { charName } from "../../engine/Queries";
import {
  EFFORT_ORDER,
  effortOf,
  EFFORTS,
  jobGate,
  takeUpCheck,
  takeUpLabel,
  takeUpsAt,
  tradesFor,
} from "../../engine/Trades";
import type {
  BoatUse,
  Character,
  JobKind,
  Life,
  PlaceKind,
} from "../../engine/Types";
import { play } from "../Sound";
import {
  action,
  bar,
  charLink,
  GameUi,
  odds,
  provLink,
  section,
} from "./Context";

/** Run a command that tells a story, then show the scene of it. */
async function scene(
  ui: GameUi,
  c: Parameters<GameUi["cmd"]>[0],
): Promise<void> {
  if (await ui.cmd(c)) ui.modal({ k: "outcome" });
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------- work runs itself

/** How hard you go at your work: four ways, one line on what each means. */
export function effortPicker(ui: GameUi): TemplateResult {
  const life = ui.life!;
  const now = effortOf(life);
  const e = EFFORTS[now];
  return html`<div
      class="cq-lv-effort"
      role="radiogroup"
      aria-label="How hard you work"
    >
      ${EFFORT_ORDER.map(
        (k) =>
          html`<button
            role="radio"
            aria-checked=${k === now}
            class=${k === now ? "on" : ""}
            title=${EFFORTS[k].text}
            @click=${() => k !== now && void ui.cmd({ k: "effort", v: k })}
          >
            ${EFFORTS[k].name}
          </button>`,
      )}
    </div>
    <p class="cq-lv-effort-text small">
      ${e.text}
      <span class="cq-lv-effort-facts"
        >pay ×${e.day} · skill
        ×${e.xp}${e.stress
          ? ` · stress ${e.stress > 0 ? "+" : "−"}${Math.round(Math.abs(e.stress) * 24)}/month`
          : ""}${e.health ? " · health suffers" : ""}</span
      >
    </p>`;
}

/** The lines under your work: it runs itself; how the law sees a crooked trade. */
export function workNotes(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const job = life.job;
  if (!job) return html``;
  const def = JOBS[job.kind];
  const nation = lawAt(s, life.prov);
  return html`${effortPicker(ui)}
    <p class="cq-muted small cq-lv-runs">
      Your days at your post are worked for you (Sundays off): no need to keep
      this page open. Every few weeks a matter at work comes to you as a letter.
    </p>
    ${def.crime
      ? html`<p class="small cq-lv-crimeline">
          <span>Notoriety <b>${Math.floor(notorietyOf(life))}</b></span>
          <span
            >The law here:
            ${heatBadge(heatOf(life, nation))}${watchLine(ui, life.prov)}</span
          >
        </p>`
      : nothing}
    ${def.law
      ? html`<p class="small cq-lv-crimeline">
          <span>Rogues taken up <b>${life.crime?.arrests ?? 0}</b></span>
          <span>Bribes taken <b>${life.crime?.bribes ?? 0}</b></span>
        </p>`
      : nothing}`;
}

function watchLine(ui: GameUi, p: number): TemplateResult {
  const w = watchStrength(ui.s, ui.w, p);
  return html` · the watch is
    <b title=${w.parts.map((x) => `${x.label}: ${x.value}`).join("\n")}
      >${w.total >= 45 ? "sharp" : w.total >= 25 ? "awake" : "sleepy"}</b
    >`;
}

function heatBadge(heat: number): TemplateResult {
  const cls = heat >= 45 ? "hot" : heat >= 20 ? "warm" : "cool";
  const word =
    heat >= 45
      ? "wanted"
      : heat >= 20
        ? "looking for you"
        : heat >= 2
          ? "faintly curious"
          : "nothing on you";
  return html`<span
    class="cq-lv-heat ${cls}"
    title="Heat ${Math.round(heat)} of 100"
    >${word}</span
  >`;
}

/** Trades you can set up in here on your own (shown in "Work to be had"). */
export function takeUpRows(
  ui: GameUi,
  p: number,
  area: PlaceKind,
): TemplateResult[] {
  const s = ui.s;
  const life = ui.life!;
  if (isChildLife(s, life)) return [];
  return takeUpsAt(s, ui.w, life, area).map((k) => {
    const check = takeUpCheck(s, ui.w, life, k, area);
    const def = JOBS[k];
    return html`<li>
      <span class="cq-lv-mono" aria-hidden="true"
        >${def.crime ? "☠" : def.law ? "⚖" : "✦"}</span
      >
      <span class="cq-folk-text">
        <b>${def.ranks[0].title}, on your own account</b>
        <span class="cq-muted small"
          >${def.ranks[0].wage} a month at first, up to
          ${def.ranks[def.ranks.length - 1].title.toLowerCase()}${def.crime
            ? "; draws the law's heat"
            : ""}</span
        >
      </span>
      ${life.job?.kind === k
        ? html`<span class="cq-chip good">yours</span>`
        : html`<button
            class="cq-btn small cq-ask ${check.ok ? "primary" : ""}"
            ?disabled=${!check.ok}
            title=${check.ok ? def.text : check.why}
            @click=${() => scene(ui, { k: "takeup", job: k, place: area })}
          >
            ${takeUpLabel(k)}
          </button>`}
      ${!check.ok
        ? html`<span class="cq-why cq-lv-why">${check.why}</span>`
        : nothing}
    </li>`;
  });
}

// ---------------------------------------------------------------- every trade

let tradeGroup: JobGroup | "all" = "all";

/** Every trade your people follow, how to get into it, and what it's good for. */
export function tradesPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  if (!life || !ui.me) return html`<p class="cq-empty">You're watching.</p>`;
  const all = tradesFor(s, ui.w, life);
  const groups = JOB_GROUPS.filter((g) => all.some((t) => t.group === g.id));
  const list =
    tradeGroup === "all" ? all : all.filter((t) => t.group === tradeGroup);
  return html`<header class="cq-panel-head">
      <h2 class="cq-h1">Every trade</h2>
      <p class="cq-muted small">
        Where each line of work is done, who takes people on (or whether you can
        set up on your own), the ladder, what it asks and what it's good for. Go
        to the place in a town that has it and ask, or take it up yourself.
      </p>
    </header>
    <nav class="cq-lv-chips" aria-label="Kinds of work">
      ${[{ id: "all" as const, name: "All" }, ...groups].map(
        (g) =>
          html`<button
            class=${tradeGroup === g.id ? "on" : ""}
            aria-pressed=${tradeGroup === g.id}
            @click=${() => {
              tradeGroup = g.id;
              ui.redraw();
            }}
          >
            ${g.name}
          </button>`,
      )}
    </nav>
    <ul class="cq-lv-trades">
      ${list.map((t) => {
        const def = JOBS[t.kind];
        const yours = life.job?.kind === t.kind;
        return html`<li class="${t.open ? "" : "shut"} ${yours ? "yours" : ""}">
          <div class="cq-lv-trade-head">
            <b>${def.name}</b>
            ${yours
              ? html`<span class="cq-chip good">your trade</span>`
              : nothing}
            ${def.crime
              ? html`<span class="cq-chip bad">crooked</span>`
              : nothing}
            ${def.law ? html`<span class="cq-chip">the law</span>` : nothing}
          </div>
          <p class="small">${def.good ?? def.text}</p>
          <ol class="cq-lv-rungs" aria-label="The ladder">
            ${def.ranks.map(
              (r, i) =>
                html`<li
                  class=${yours && life.job!.rank === i
                    ? "now"
                    : yours && life.job!.rank > i
                      ? "past"
                      : ""}
                  title=${`${r.wage} a month${r.months ? `, after ${r.months} months` : ""}${r.skill ? `, ${SKILL_NAMES[def.main].toLowerCase()} ${r.skill}` : ""}${r.notoriety ? `, notoriety ${r.notoriety}` : ""}${r.buy ? `, or buy it: ${r.buy.cost}` : ""}${r.commission ? ", by commission" : ""}`}
                >
                  ${r.title} <span class="cq-muted">${r.wage}</span>
                </li>`,
            )}
          </ol>
          <p class="small cq-muted">
            At ${t.where}.
            ${t.hiredBy.length
              ? html`Taken on by the ${t.hiredBy.join(" or the ")}.`
              : nothing}
            ${t.selfStart ? html`<b>Or set up on your own.</b>` : nothing}
            Skills: ${SKILL_NAMES[def.main].toLowerCase()} and
            ${SKILL_NAMES[def.second].toLowerCase()}.
          </p>
          ${t.blocked
            ? html`<p class="small cq-lv-blocked">${t.blocked}</p>`
            : nothing}
        </li>`;
      })}
    </ul>`;
}

/** A link to the list of every trade. */
export function tradesLink(ui: GameUi): TemplateResult {
  return html`<button
    class="cq-link cq-lv-tradeslink"
    @click=${() => ui.open({ k: "life", page: "trades" })}
  >
    Every trade, and how to get into it ›
  </button>`;
}

// ---------------------------------------------------------------- what a place offers

/** Everything round 11 adds to a place: the law, people for hire, contracts, boats. */
export function placeBlocks(
  ui: GameUi,
  p: number,
  area: PlaceKind,
): TemplateResult {
  const life = ui.life!;
  if (life.travel) return html``;
  return html`${crimeBlock(ui, p, area)} ${hireBlock(ui, p, area)}
  ${contractsBlock(ui, p, area)} ${boatyardBlock(ui, p, area)}`;
}

function crimeBlock(ui: GameUi, p: number, area: PlaceKind): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const acts = CRIME_ACTS.filter((a) => a.places.includes(area));
  const shown = acts
    .map((a) => ({ a, check: crimeActCheck(s, ui.w, life, area, a.key) }))
    .filter(
      ({ a, check }) =>
        check.ok ||
        !/^(Only for|You're not in|Not from a cell|Not your people)/.test(
          check.why,
        ) ||
        (a.jailed && life.crime?.jail),
    );
  const wanted =
    area === "gaol" && isLawman(life)
      ? s.lives.filter(
          (l) =>
            l !== life &&
            l.c >= 0 &&
            !l.watching &&
            arrestCheck(s, life, l.c).ok,
        )
      : [];
  if (!shown.length && !wanted.length) return html``;
  return html`<h4 class="cq-area-h">
      ${area === "den"
        ? "The den's business"
        : area === "gaol"
          ? "The law"
          : "On the quiet"}
    </h4>
    ${area === "den" || area === "gaol"
      ? html`<p class="small cq-lv-crimeline">
          <span>Your notoriety <b>${Math.floor(notorietyOf(life))}</b></span>
          <span
            >The law here:
            ${heatBadge(heatOf(life, lawAt(s, p)))}${watchLine(ui, p)}</span
          >
        </p>`
      : nothing}
    <div class="cq-acts">
      ${shown.map(({ a, check }) => {
        const o = crimeActOdds(s, life, a.key);
        const cost = a.cost?.(s, life) ?? 0;
        return html`<button
          class="cq-act-btn ${a.jailed ? "lit" : ""} ${check.ok
            ? ""
            : "has-why"}"
          ?disabled=${!check.ok}
          title=${check.ok ? a.text : `${check.why} ${a.text}`}
          @click=${() => scene(ui, { k: a.law ? "law" : "crime", act: a.key })}
        >
          <span class="cq-act-label">${a.label}${cost ? ` (${cost})` : ""}</span
          >${odds(o)}
          <span class="cq-act-why">${check.ok ? "" : check.why}</span>
        </button>`;
      })}
    </div>
    ${wanted.length
      ? html`<p class="small">Wanted here:</p>
          <ul class="cq-lv-list">
            ${wanted.map(
              (l) =>
                html`<li>
                  ${charLink(ui, s.chars[l.c])}
                  <span class="cq-muted small"
                    >${heatBadge(heatOf(l, lawAt(s, p)))}</span
                  >
                  <button
                    class="cq-btn small rough"
                    @click=${() =>
                      scene(ui, { k: "law", act: "arrest", c: l.c })}
                  >
                    Arrest
                  </button>
                </li>`,
            )}
          </ul>`
      : nothing}`;
}

function initials(first: string, family: string): string {
  return `${first[0] ?? ""}${family.replace(/^of the /, "")[0] ?? ""}`;
}

function hireBlock(ui: GameUi, p: number, area: PlaceKind): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  if (isChildLife(s, life)) return html``;
  if (area === "den" && !knowsDen(life, p)) return html``;
  const list = candidatesAt(s, ui.w, life, p, area).filter(
    (c) =>
      !life.cooldowns[
        `people:hired:${p}:${Math.floor(s.day / 30)}:${area}:${c.slot}`
      ],
  );
  if (!list.length) return html``;
  const check = hireCheck(s, ui.w, life, area);
  return html`<h4 class="cq-area-h">
      People for hire
      <span class="cq-muted small"
        >${peopleOf(life).length} of ${followerCap(s, life)} in your
        service</span
      >
    </h4>
    <ul class="cq-lv-list cq-lv-hire">
      ${list.map((c) => {
        const def = FOLLOWER_KINDS[c.kind];
        return html`<li>
          <span class="cq-lv-mono ${c.kind}" aria-hidden="true"
            >${initials(c.first, c.family)}</span
          >
          <span class="cq-folk-text">
            <b>${c.first} ${c.family}, ${def.ranks[0].toLowerCase()}</b>
            <span class="cq-muted small"
              >${c.age}, ${c.note}; ${SKILL_NAMES[def.skill].toLowerCase()}
              ${c.skill};
              ${c.kind === "rogue"
                ? `${Math.round(c.share * 100)}% of the take`
                : `${c.wage} a month`}</span
            >
          </span>
          <button
            class="cq-btn small cq-ask ${check.ok ? "primary" : ""}"
            ?disabled=${!check.ok}
            title=${check.ok ? def.text : check.why}
            @click=${() => scene(ui, { k: "people", act: "hire", arg: c.slot })}
          >
            Hire
          </button>
        </li>`;
      })}
    </ul>
    ${!check.ok ? html`<p class="cq-why small">${check.why}</p>` : nothing}`;
}

function contractsBlock(
  ui: GameUi,
  p: number,
  area: PlaceKind,
): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  if (isChildLife(s, life)) return html``;
  const offers = offeredHere(s, ui.w, life, area);
  if (!offers.length) return html``;
  const mine = strengthOf(s, life);
  return html`<h4 class="cq-area-h">
      Contracts
      <span class="cq-muted small">your strength ${mine}</span>
    </h4>
    <ul class="cq-lv-list cq-lv-contracts">
      ${offers.map((c) => {
        const check = takeCheck(s, ui.w, life, c);
        return html`<li>
          <span class="cq-lv-mono contract" aria-hidden="true">✠</span>
          <span class="cq-folk-text">
            <b>${c.title}</b>
            <span class="cq-muted small"
              >${CONTRACT_NAMES[c.kind]} at ${ui.map.provinces[c.target].name}:
              ${c.pay} coins${c.foe ? `, opposition about ${c.foe}` : ""},
              within ${Math.round((c.due - s.day) / 30)} months. ${c.text}</span
            >
          </span>
          <button
            class="cq-btn small cq-ask ${check.ok ? "primary" : ""}"
            ?disabled=${!check.ok}
            title=${check.ok ? "Take it on" : check.why}
            @click=${() => scene(ui, { k: "contract", act: "take", id: c.id })}
          >
            Take it
          </button>
        </li>`;
      })}
    </ul>`;
}

function boatyardBlock(ui: GameUi, p: number, area: PlaceKind): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  if (area !== "docks" && !(area === "village" && ui.map.provinces[p].coastal))
    return html``;
  const kinds = boatyard(s, ui.w, p);
  const used = area === "docks" ? usedBoats(s, ui.w, p) : [];
  const here = boatsOf(life).filter(
    (b) => b.prov === p && life.travel?.boat !== b.id,
  );
  if (!kinds.length && !here.length) return html``;
  return html`${here.map((b) => boatCard(ui, b.id, true))}
  ${kinds.length
    ? html`<h4 class="cq-area-h">The boatyard</h4>
        <ul class="cq-lv-list cq-lv-boats">
          ${kinds.map((k) => {
            const def = BOATS[k];
            const price = boatPrice(s, life, k);
            const check = buyCheck(s, ui.w, life, k, price);
            return html`<li>
              ${boatGlyph(k)}
              <span class="cq-folk-text">
                <b>A ${def.name.toLowerCase()}, new</b>
                <span class="cq-muted small"
                  >${def.loads} loads, ${def.berths} berths,
                  ${def.crew
                    ? `${plural(def.crew, "hand")} to sail`
                    : "no crew"},
                  ${def.speed > 1
                    ? "quick"
                    : def.speed < 1
                      ? "slow"
                      : "steady"};
                  keep
                  ${Math.round((def.upkeep + def.crew * CREW_WAGE) * 10) / 10} a
                  month with her crew. ${def.text}</span
                >
              </span>
              <button
                class="cq-btn small cq-ask ${check.ok ? "primary" : ""}"
                ?disabled=${!check.ok}
                title=${check.ok ? "" : check.why}
                @click=${() =>
                  scene(ui, { k: "boat", act: "buy", kind: k, arg: -1 })}
              >
                Buy ${price}
              </button>
            </li>`;
          })}
          ${used.map((u) => {
            const check = buyCheck(s, ui.w, life, u.kind, u.price);
            return html`<li>
              ${boatGlyph(u.kind)}
              <span class="cq-folk-text">
                <b
                  >The ${u.name}, a second-hand
                  ${BOATS[u.kind].name.toLowerCase()}</b
                >
                <span class="cq-muted small"
                  >${u.condition}% sound; ${u.quirk}.</span
                >
              </span>
              <button
                class="cq-btn small cq-ask ${check.ok ? "primary" : ""}"
                ?disabled=${!check.ok}
                title=${check.ok ? "" : check.why}
                @click=${() =>
                  scene(ui, {
                    k: "boat",
                    act: "buy",
                    kind: u.kind,
                    arg: u.slot,
                  })}
              >
                Buy ${u.price}
              </button>
            </li>`;
          })}
        </ul>`
    : nothing}`;
}

/** A small drawn hull for a kind of boat (one mast, two, three). */
export function boatGlyph(kind: string): TemplateResult {
  const masts =
    kind === "ship"
      ? 3
      : kind === "brig" || kind === "schooner"
        ? 2
        : kind === "canoe"
          ? 0
          : 1;
  return html`<svg class="cq-lv-boat" viewBox="0 0 40 30" aria-hidden="true">
    <path d="M3 20h34l-5 6H9z" class="hull" />
    ${[...Array(masts).keys()].map((i) => {
      const x = masts === 1 ? 20 : 12 + i * (16 / Math.max(1, masts - 1));
      return html`<path d="M${x} 20V4" class="mast" /><path
          d="M${x} 6q6 6 0 12z"
          class="sail"
        />`;
    })}
    ${masts === 0 ? html`<path d="M14 14l12 -4" class="mast" />` : nothing}
  </svg>`;
}

/** One of your boats: where she lies, her crew, her work; managed when you're aboard. */
function boatCard(ui: GameUi, id: number, here: boolean): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const b = boatsOf(life).find((x) => x.id === id);
  if (!b) return html``;
  const def = BOATS[b.kind];
  const atHand = here && !life.travel && b.prov === life.prov;
  const mates = peopleOf(life).filter(
    (f) =>
      f.kind === "mate" &&
      (!f.task || (f.task.kind === "boat" && f.task.boat === b.id)),
  );
  const skipper = peopleOf(life).find(
    (f) => f.task?.kind === "boat" && f.task.boat === b.id,
  );
  const monthly = Math.round((def.upkeep + b.crew * CREW_WAGE) * 10) / 10;
  return html`<div class="cq-lv-boatcard">
    <div class="cq-lv-boathead">
      ${boatGlyph(b.kind)}
      <div>
        <b>The ${b.name}</b>
        <span class="cq-muted small">
          ${def.name.toLowerCase()} at
          ${here ? "this port" : provLink(ui, b.prov)}${b.quirk
            ? `, ${b.quirk}`
            : ""}</span
        >
      </div>
      <span class="cq-chip ${b.use === "idle" ? "" : "good"}"
        >${USE_NAMES[b.use]}</span
      >
    </div>
    <div class="cq-lv-gauges small">
      <span>Sound ${bar(b.condition / 100)} ${Math.round(b.condition)}%</span>
      <span
        >Crew ${b.crew} of
        ${def.crew}${b.crew < def.crew
          ? html` <b class="bad">short-handed</b>`
          : nothing}</span
      >
      <span>Spirits ${bar(b.morale / 100)}</span>
      <span>${monthly} a month</span>
    </div>
    ${atHand
      ? html`<div class="cq-btnrow">
          ${def.crew
            ? html`${action(
                b.crew < def.crew
                  ? `Sign on ${def.crew - b.crew} hands (${def.crew - b.crew})`
                  : "Sign on one more",
                { ok: true },
                () =>
                  void ui.cmd({
                    k: "boat",
                    act: "crew",
                    id: b.id,
                    arg: b.crew < def.crew ? def.crew : b.crew + 1,
                  }),
                "small",
              )}
              ${b.crew > 0
                ? action(
                    "Pay one off",
                    { ok: true },
                    () =>
                      void ui.cmd({
                        k: "boat",
                        act: "crew",
                        id: b.id,
                        arg: b.crew - 1,
                      }),
                    "small quiet",
                  )
                : nothing}`
            : nothing}
          ${b.condition < 98
            ? action(
                `Repair (${repairCost(b)})`,
                life.purse >= repairCost(b)
                  ? { ok: true }
                  : { ok: false, why: `${repairCost(b)} coins` },
                () => void ui.cmd({ k: "boat", act: "repair", id: b.id }),
                "small",
              )
            : nothing}
          ${action(
            `Sell (${sellPrice(b)})`,
            { ok: true },
            () => {
              if (confirm(`Sell the ${b.name} for ${sellPrice(b)} coins?`))
                void ui.cmd({ k: "boat", act: "sell", id: b.id });
            },
            "small quiet",
          )}
        </div>`
      : nothing}
    <div class="cq-lv-uses" role="radiogroup" aria-label="What she's used for">
      ${def.uses.map(
        (u: BoatUse) =>
          html`<button
            role="radio"
            aria-checked=${b.use === u}
            class=${b.use === u ? "on" : ""}
            title=${USE_TEXT[u]}
            @click=${() =>
              b.use !== u &&
              void ui.cmd({ k: "boat", act: "use", id: b.id, use: u })}
          >
            ${USE_NAMES[u]}
          </button>`,
      )}
    </div>
    <p class="cq-muted small">
      ${USE_TEXT[b.use]}
      ${b.use !== "idle"
        ? skipper
          ? html`${charLink(ui, s.chars[skipper.c], false)} skippers her while
            you're elsewhere.`
          : "She only works while you're in port with her, unless a mate of yours skippers her."
        : ""}
      She stays where she lies: sail in her from here (the road there, from any
      coastal province's page or the map).
    </p>
    ${atHand && mates.length && b.use !== "idle"
      ? html`<div class="cq-btnrow">
          ${skipper
            ? action(
                "Take her command back",
                { ok: true },
                () =>
                  void ui.cmd({ k: "boat", act: "skipper", id: b.id, arg: -1 }),
                "small quiet",
              )
            : mates.map((f) =>
                action(
                  `Give ${s.chars[f.c]?.first ?? "them"} the command`,
                  { ok: true },
                  () =>
                    void ui.cmd({
                      k: "boat",
                      act: "skipper",
                      id: b.id,
                      arg: f.id,
                    }),
                  "small",
                ),
              )}
        </div>`
      : nothing}
  </div>`;
}

// ---------------------------------------------------------------- travel in your own boat

/** "Sail in your own boat" choices for the road to a province. */
export function ownBoatWays(ui: GameUi, p: number): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  if (!life || life.watching || life.travel) return html``;
  const here = boatsOf(life).filter((b) => b.prov === life.prov);
  if (!here.length) return html``;
  return html`${here.map((b) => {
    const check = sailCheck(s, ui.map, life, b, p);
    const route = check.ok ? boatRoute(ui.map, life.prov, p, b.kind) : null;
    return html`<div class="cq-travel-way">
      <span
        ><b>In the ${b.name}</b>:
        ${route
          ? `about ${Math.ceil(route.days)} days, no fare (her crew's wages and keep only); she'll lie at ${ui.map.provinces[p].name}.`
          : check.ok
            ? ""
            : check.why}</span
      >
      ${action(
        "Set sail",
        check,
        async () => {
          if (await ui.cmd({ k: "sail", to: p, boat: b.id })) {
            play("paper");
            ui.open({ k: "tab", tab: "here" });
          }
        },
        "small",
        undefined,
        false,
      )}
    </div>`;
  })}`;
}

// ---------------------------------------------------------------- in the gaol

export function jailCallout(ui: GameUi): TemplateResult {
  const life = ui.life;
  const j = life?.crime?.jail;
  if (!life || !j) return html``;
  const left = Math.max(0, j.until - ui.s.day);
  return html`<div class="cq-callout cq-lv-jail">
    <p>
      <b>In the gaol at ${ui.map.provinces[j.p].name}</b>, charged with
      ${j.charge}.
      ${j.trial
        ? html`The quarter sessions sit in about ${plural(left, "day")}.`
        : html`Free on ${formatDate(j.until)}.`}
      You can't travel or work; the gaoler can be bribed, and walls can be
      climbed.
    </p>
  </div>`;
}

// ---------------------------------------------------------------- the people page (Affairs)

/** Your people, your company, your boats, your contracts and the law: for Affairs. */
export function affairsSections(ui: GameUi): TemplateResult {
  return html`${peopleSection(ui)} ${companySection(ui)} ${boatsSection(ui)}
  ${contractsSection(ui)} ${lawSection(ui)}`;
}

function peopleSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  if (isChildLife(s, life)) return html``;
  const list = peopleOf(life);
  const cap = followerCap(s, life);
  const wages = list.reduce((m, f) => m + f.wage, 0);
  const band = list.filter((f) => f.kind === "rogue" && !f.task);
  return section(
    html`Your people
      <span class="cq-muted small"
        >${list.length} of
        ${cap}${wages ? `, ${Math.round(wages * 10) / 10} a month` : ""}</span
      >`,
    html`${list.length
      ? html`<ul class="cq-lv-people">
          ${list.map((f) => {
            const c = s.chars[f.c];
            const def = FOLLOWER_KINDS[f.kind];
            const promo = promoteCheck(s, f);
            const lowLoyal = f.loyalty < 25;
            return html`<li>
              <div class="cq-lv-person">
                <span class="cq-lv-mono ${f.kind}" aria-hidden="true"
                  >${c ? initials(c.first, c.family) : "?"}</span
                >
                <span class="cq-folk-text">
                  <span
                    >${charLink(ui, c, false)}
                    <span class="cq-muted small"
                      >${followerTitle(f)}</span
                    ></span
                  >
                  <span class="cq-muted small"
                    >${followerDoing(ui, f, s.day)}; ${followerCost(f)};
                    ${SKILL_NAMES[def.skill].toLowerCase()}
                    ${followerSkill(s, f)}${f.deeds
                      ? `; ${plural(f.deeds, "deed")}`
                      : ""}${f.owed
                      ? html`;
                          <b class="bad">owed ${plural(f.owed, "month")}</b>`
                      : ""}</span
                  >
                </span>
                <span
                  class="cq-lv-loyal ${lowLoyal ? "bad" : ""}"
                  title="Loyalty ${Math.round(
                    f.loyalty,
                  )}: below 20 they may leave (or worse)"
                  >${bar(f.loyalty / 100)}</span
                >
              </div>
              <div class="cq-btnrow">
                ${f.kind === "clerk" && !f.task
                  ? [10, 25, 50, 100].map((n) =>
                      action(
                        `Trade with ${n}`,
                        life.purse >= n
                          ? { ok: true }
                          : { ok: false, why: `${n} coins` },
                        () =>
                          void ui.cmd({
                            k: "people",
                            act: "trade-again",
                            id: f.id,
                            arg: n,
                          }),
                        "small",
                        "They trade with your stake and go again when they're back",
                        false,
                      ),
                    )
                  : nothing}
                ${f.task &&
                f.task.kind !== "boat" &&
                !(f.task.kind === "trade" && !f.task.repeat)
                  ? action(
                      f.task.kind === "trade" ? "Don't go again" : "Recall",
                      { ok: true },
                      () =>
                        void ui.cmd({ k: "people", act: "recall", id: f.id }),
                      "small quiet",
                    )
                  : nothing}
                ${action(
                  "A bonus",
                  { ok: true },
                  () => void ui.cmd({ k: "people", act: "bonus", id: f.id }),
                  "small quiet",
                  "A coin or two over their wages: loyalty",
                )}
                ${promo.ok
                  ? action(
                      `Make ${def.ranks[f.rank + 1]?.toLowerCase()}`,
                      promo,
                      () =>
                        void ui.cmd({ k: "people", act: "promote", id: f.id }),
                      "small primary",
                    )
                  : nothing}
                ${action(
                  "Let go",
                  { ok: true },
                  () => {
                    if (confirm(`Let ${charName(c)} go?`))
                      void ui.cmd({ k: "people", act: "dismiss", id: f.id });
                  },
                  "small quiet",
                )}
              </div>
            </li>`;
          })}
        </ul>`
      : html`<p class="cq-muted small">
          Nobody in your service yet. Hire clerks at the market, hands at the
          tavern, swords at the tavern or the fort, mates at the docks, guides
          in the woods, rogues at the den; or take a friend into your service
          from their page.
        </p>`}
    ${band.length
      ? html`<p class="small">Your band (${band.length} free):</p>
          <div class="cq-btnrow">
            ${(["robbery", "smuggling", "protection"] as const).map((what) =>
              action(
                what === "robbery"
                  ? "Send them robbing"
                  : what === "smuggling"
                    ? "A smuggling run"
                    : "Protection money",
                what === "smuggling" && !ui.map.provinces[life.prov].coastal
                  ? { ok: false, why: "From the coast" }
                  : { ok: true },
                () => void ui.cmd({ k: "people", act: "job", kind: what }),
                "small",
                "Ten to twenty days: a take shared out, and heat drawn on you",
                false,
              ),
            )}
          </div>`
      : nothing}`,
  );
}

function companySection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const co = life.company;
  if (!co) {
    const check = raiseCheck(s, life);
    if (!check.ok && /^Only a/.test(check.why)) return html``;
    return section(
      "A company of your own",
      html`<p class="small">
          Raise twenty men on your bounty (${20 * COMPANY_BOUNTY} coins), pay
          them every month, drill them, and lead them: on contracts, or in
          wartime into the field as an army of your nation.
        </p>
        <div class="cq-btnrow">
          ${action(
            "Raise a company",
            check,
            () => scene(ui, { k: "people", act: "raise" }),
            "small primary",
          )}
        </div>`,
    );
  }
  const army =
    co.army >= 0 ? s.armies.find((a) => a.id === co.army) : undefined;
  const pay = Math.round(co.men * COMPANY_PAY[co.kind] * 10) / 10;
  return section(
    html`${co.name}
      <span class="cq-muted small"
        >${co.men} men,
        ${co.inPay ? "in the colony's pay" : `${pay} a month`}</span
      >`,
    html`<div class="cq-lv-gauges small">
        <span>Drill ${bar(co.drill)}</span>
        <span>Spirits ${bar(co.morale)}</span>
        <span
          >${army
            ? html`In the field at ${provLink(ui, army.prov)}`
            : "In quarters"}</span
        >
        ${co.owed
          ? html`<b class="bad">Unpaid ${plural(co.owed, "month")}</b>`
          : nothing}
      </div>
      <div class="cq-btnrow">
        ${army
          ? html`${action(
              "Their army",
              { ok: true },
              () => ui.open({ k: "army", id: army.id }),
              "small primary",
            )}
            ${action(
              "Stand them down",
              army.depart >= 0
                ? { ok: false, why: "Halt them first" }
                : { ok: true },
              () => void ui.cmd({ k: "people", act: "standdown" }),
              "small",
            )}`
          : html`${action(
              "Take the field",
              { ok: true },
              () => scene(ui, { k: "people", act: "field" }),
              "small primary",
              "March as an army of your nation: with a war on, they fight and besiege",
            )}
            ${action(
              `Twenty more men (${20 * COMPANY_BOUNTY})`,
              life.purse >= 20 * COMPANY_BOUNTY
                ? { ok: true }
                : { ok: false, why: `${20 * COMPANY_BOUNTY} coins` },
              () => void ui.cmd({ k: "people", act: "men" }),
              "small",
            )}
            ${action(
              "Pay them off",
              { ok: true },
              () => {
                if (confirm(`Disband ${co.name}?`))
                  void ui.cmd({ k: "people", act: "disband" });
              },
              "small quiet",
            )}`}
      </div>
      <p class="cq-muted small">
        In quarters they drill (officers among your people drill them faster)
        and count towards your strength on contracts. Unpaid, they desert. In
        the field while your nation is at war, the colony pays them and you an
        allowance, and a won battle brings spoils.
      </p>`,
  );
}

function boatsSection(ui: GameUi): TemplateResult {
  const life = ui.life!;
  const list = boatsOf(life);
  if (!list.length) return html``;
  return section(
    html`Your boats <span class="cq-muted small">${list.length}</span>`,
    html`${list.map((b) =>
      boatCard(ui, b.id, b.prov === life.prov && !life.travel),
    )}`,
  );
}

function contractsSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const all = life.contracts ?? [];
  const taken = all.filter((c) => c.status === "taken");
  const past = all
    .filter((c) => c.status !== "taken" && c.status !== "offered")
    .slice(-3)
    .reverse();
  if (!taken.length && !past.length) return html``;
  return section(
    html`Contracts
      <span class="cq-muted small">${taken.length} of ${MAX_CONTRACTS}</span>`,
    html`<ul class="cq-lv-list cq-lv-contracts">
        ${taken.map(
          (c) =>
            html`<li>
              <span class="cq-lv-mono contract" aria-hidden="true">✠</span>
              <span class="cq-folk-text">
                <b>${c.title}</b>
                <span class="cq-muted small"
                  >${c.kind === "guard" && (c.stay ?? 0) > 0
                    ? `${plural(c.stay ?? 0, "day")} to stand at `
                    : "At "}${provLink(ui, c.target)}
                  by ${formatDate(c.due)}: ${c.pay}
                  coins${c.foe
                    ? `, opposition about ${c.foe} (your strength ${strengthOf(s, life)})`
                    : ""}.</span
                >
              </span>
              ${action(
                "Give up",
                { ok: true },
                () => {
                  if (confirm(`Give up "${c.title}"? It costs you renown.`))
                    void ui.cmd({ k: "contract", act: "drop", id: c.id });
                },
                "small quiet",
              )}
            </li>`,
        )}
        ${past.map(
          (c) =>
            html`<li class="past">
              <span class="cq-lv-mono contract" aria-hidden="true"
                >${c.status === "done" ? "✓" : "✗"}</span
              >
              <span class="cq-folk-text"
                ><span class="small"
                  >${c.title}: ${c.status === "done" ? "done" : "failed"}</span
                ></span
              >
            </li>`,
        )}
      </ul>
      <p class="cq-muted small">
        Contracts are offered at taverns, the governor's house and the
        watch-house. Get there in time; the fight weighs your strength (you,
        your people with you, your company) against theirs.
      </p>`,
  );
}

function lawSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const c = life.crime;
  const lawman = isLawman(life);
  if (!c && !lawman) return html``;
  const heats = Object.entries(c?.heat ?? {})
    .map(([n, v]) => ({ n: Number(n), v }))
    .filter((x) => x.v >= 1)
    .sort((a, b) => b.v - a.v);
  return section(
    lawman ? "The law" : "The law and the underworld",
    html`<div class="cq-lv-gauges small">
        <span
          title="How well the underworld knows you: it opens the den, better rungs on the crooked ladders, and the band's respect; honest folk think less of you"
          >Notoriety ${bar((c?.notoriety ?? 0) / 100)}
          ${Math.floor(c?.notoriety ?? 0)}</span
        >
        ${c?.branded ? html`<b class="bad">Branded on the thumb</b>` : nothing}
        ${lawman
          ? html`<span>Rogues taken up <b>${c?.arrests ?? 0}</b></span
              ><span>Bribes <b>${c?.bribes ?? 0}</b></span>`
          : nothing}
      </div>
      ${heats.length
        ? html`<ul class="cq-lv-list">
              ${heats.map(
                (h) =>
                  html`<li>
                    <span class="cq-folk-text"
                      ><span class="small"
                        >The law of ${s.nations[h.n]?.name ?? "somewhere"}:
                        ${heatBadge(h.v)}</span
                      ></span
                    >
                    <span class="cq-lv-heatbar">${bar(h.v / 100, "heat")}</span>
                  </li>`,
              )}
            </ul>
            <p class="cq-muted small">
              Heat cools by about a third a month while you lie low. Above 45
              you're wanted: the watch may take you any day in their towns, and
              lawmen (players too) can arrest you. Lie low at the den, buy
              papers, or make amends at the watch-house.
            </p>`
        : html`<p class="cq-muted small">Nobody's looking for you.</p>`}
      ${c?.record.length
        ? html`<p class="small">Your record:</p>
            <ul class="cq-lv-record small">
              ${c.record.map(
                (r) =>
                  html`<li>
                    ${formatDate(r.day)}: ${r.crime} at
                    ${ui.map.provinces[r.p]?.name}. ${r.sentence}.
                  </li>`,
              )}
            </ul>`
        : nothing}`,
  );
}

// ---------------------------------------------------------------- someone's page

/** On someone's page: take them into your service, or (lawmen) arrest them. */
export function personR11(ui: GameUi, c: Character): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  if (!life || life.c < 0 || life.watching) return html``;
  const f = peopleOf(life).find((x) => x.c === c.id);
  if (f)
    return section(
      "In your service",
      html`<p class="small">
        ${followerTitle(f)}; ${followerDoing(ui, f, s.day)}; ${followerCost(f)};
        loyalty ${Math.round(f.loyalty)}.
      </p>`,
    );
  const other = lifeOfChar(s, c.id);
  if (other) {
    const check = arrestCheck(s, life, c.id);
    if (!isLawman(life)) return html``;
    return section(
      "The law",
      html`${action(
        "Arrest them",
        check,
        () => scene(ui, { k: "law", act: "arrest", c: c.id }),
        "small rough",
      )}`,
    );
  }
  const check = recruitCheck(s, life, c);
  if (
    !check.ok &&
    /^(Not them|A child|They serve|They have a post|Family)/.test(check.why)
  )
    return html``;
  return section(
    "Into your service",
    html`<p class="cq-muted small">
        Friends and folk without a post may follow you for wages: as a clerk, a
        hand, a sword, a mate, a guide, a rogue or an officer, by what they're
        best at.
      </p>
      ${action(
        "Ask them to join you",
        check,
        () => scene(ui, { k: "people", act: "recruit", c: c.id }),
        "small",
      )}`,
  );
}

/** A small badge for the banner: trouble with the law, unpaid people. */
export function needsAttention(life: Life): boolean {
  return (
    !!life.crime?.jail ||
    (life.people ?? []).some((f) => (f.owed ?? 0) > 0 || f.loyalty < 20) ||
    (life.boats ?? []).some((b) => (b.owed ?? 0) > 0)
  );
}

/** The skill a trade's gate wants, shown with its level. */
export function gateLine(ui: GameUi, kind: JobKind): string | null {
  const life = ui.life;
  if (!life) return null;
  const g = jobGate(ui.s, ui.w, life, kind);
  return g.ok ? null : g.why;
}
