// GOV (r21): Work › Expeditions. Get one up in a few clicks: what kind
// (discovery, a river, trade, an outpost, a mission, a raid, a port), where
// (the places it could go, nearest first, with the days), who leads (you,
// one of your people, a man of the town who knows the country, or for a
// governor someone of the court), how many hands and which of your people,
// and who pays (your purse, a grant asked of the governor, or for a
// governor the treasury). Before you set out: the odds at the far end, the
// cost on the button, the days, and whether your work will wait for you.
// Then the party travels on the map with you in it (or without you, under
// the man you hired), and its scenes come to whoever leads it. Every figure
// comes from engine/ExpedCore.ts, the same reckoning the far end rolls.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import {
  canPlan,
  costOf,
  draftOf,
  type ExpedDraft,
  expedOdds,
  expedOf,
  expedWords,
  hirelings,
  hirelingWords,
  KIND_KEYS,
  KINDS,
  leaderLevel,
  menOf,
  myExped,
  myForming,
  PARTY,
  startFor,
  targetsFor,
  workChance,
} from "../../engine/ExpedCore";
import {
  askCheck,
  askMost,
  governorFor,
  grantOdds,
} from "../../engine/ExpedGrant";
import {
  costNow,
  courtLeaders,
  dueWords,
  goCheck,
  governs,
  inviteCheck,
  planCheck,
} from "../../engine/Expeditions";
import { peopleOf } from "../../engine/Followers";
import { tripLeave } from "../../engine/Leave";
import { lifeOfSeat, meOf } from "../../engine/LifeQueries";
import { SKILL_NAMES } from "../../engine/LifeRules";
import { chanceWords, type OddsView } from "../../engine/Odds";
import { charName } from "../../engine/Queries";
import type { Expedition, ExpedKind, Life } from "../../engine/Types";
import { nationName, TERRAIN_NAMES } from "../Text";
import { num } from "../Tip";
import {
  action,
  breakdownTip,
  charLink,
  GameUi,
  more,
  provLink,
  section,
} from "./Context";
import { howTo, pageHead } from "./Nav";
import { coins, price } from "./Price";
import { term } from "./Terms";

/** The planner's choices, kept while you look about. */
const draft = {
  kind: "discover" as ExpedKind,
  p: -1,
  leader: -1,
  hands: KINDS.discover.hands,
  people: [] as number[],
  stake: PARTY.stake,
  treasury: false,
};

const pct = (p: number) => `${Math.round(p * 100)}%`;
const place = (ui: GameUi, p: number) => ui.map.provinces[p]?.name ?? "?";
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const STAGE: Record<Expedition["stage"], string> = {
  forming: "getting up",
  out: "on the way there",
  there: "at work there",
  back: "on the way home",
};

// ---------------------------------------------------------------- the page

export function expeditionsPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const mine = myExped(s, life.seat);
  const forming = myForming(s, life.seat);
  return html`${pageHead(
    "Expeditions",
    html`Into country your colony doesn't know, to a native town to trade or
    preach, to raise an outpost, map a river or found a port, or a raid. Lead
    one yourself, take ${term("hands", "hands")} and your own people, hire a man
    who knows the country to go for you, ask other players along, or ask the
    governor for a ${term("grant", "grant")}. The party travels on the map.`,
  )}
  ${askedSection(ui)}
  ${mine && mine.stage !== "forming"
    ? underWay(ui, mine)
    : forming
      ? formingCard(ui, forming)
      : mine
        ? joinedCard(ui, mine)
        : planner(ui)}
  ${grantsToAnswer(ui)} ${colonySection(ui)}`;
}

// ---------------------------------------------------------------- the planner

/** The draft as the engine reckons it. */
function draftNow(ui: GameUi): ExpedDraft | null {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const from = startFor(s, life);
  if (from < 0) return null;
  return {
    kind: draft.kind,
    n: me.nation,
    from,
    target: draft.p,
    leader: draft.leader >= 0 ? draft.leader : me.id,
    hands: draft.hands,
    people: draft.people,
    members: 0,
    stake: draft.stake,
    by: life.seat,
  };
}

function planner(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const ok = canPlan(s, life);
  if (!ok.ok) return html`<p class="cq-callout">${ok.why}</p>`;
  const from = startFor(s, life);
  if (from < 0)
    return howTo("An expedition sets out from a town of your own colony.", [
      "Go to one of your colony's towns (any will do; the nearer the place you're going, the shorter the way).",
      "Then come back here: choose what kind, where, who leads and who goes.",
    ]);
  const gov = governs(s, life);
  if (draft.treasury && gov !== me.nation) draft.treasury = false;
  const targets = targetsFor(s, ui.w, draft.kind, me.nation, from, 14);
  if (!targets.some((t) => t.p === draft.p)) draft.p = targets[0]?.p ?? -1;
  const d = draftNow(ui);
  const hired =
    d && d.leader !== me.id && !peopleOf(life).some((f) => f.c === d.leader);
  return html`${section(
    "1. What kind",
    html`<div class="cq-exp-kinds" role="radiogroup" aria-label="What kind">
        ${KIND_KEYS.map((k) => {
          const def = KINDS[k];
          const on = draft.kind === k;
          return html`<button
            class="cq-exp-kind ${on ? "on" : ""}"
            role="radio"
            aria-checked=${on}
            @click=${() => {
              draft.kind = k;
              draft.hands = def.hands;
              draft.p = -1;
              ui.redraw();
            }}
          >
            <b>${def.name}</b>
            <span class="small">${def.text}</span>
            ${def.treasury
              ? html`<span class="cq-chip">the colony's charge</span>`
              : nothing}
          </button>`;
        })}
      </div>
      <p class="small cq-exp-kind-text">${KINDS[draft.kind].text}</p>
      <p class="small cq-muted">${KINDS[draft.kind].gives}</p>`,
  )}
  ${section(
    "2. Where",
    targets.length
      ? html`<ul class="cq-exp-sites">
          ${targets.map((t) => {
            const def = ui.map.provinces[t.p];
            const owner = s.provinces[t.p].owner;
            const on = draft.p === t.p;
            return html`<li class=${on ? "on" : ""}>
              <label class="cq-exp-site">
                <input
                  type="radio"
                  name="exp-site"
                  .checked=${on}
                  @change=${() => {
                    draft.p = t.p;
                    ui.redraw();
                  }}
                />
                <b>${def.name}</b>
                <span class="cq-muted small"
                  >${TERRAIN_NAMES[def.terrain] ?? def.terrain} ·
                  ${t.km.toLocaleString("en-US")} km · about ${t.days} days
                  there${owner >= 0
                    ? html` · the ${nationName(s.nations[owner].name)}'s`
                    : ""}</span
                >
              </label>
              <button
                class="cq-btn quiet small"
                @click=${() => ui.focusProv(t.p)}
              >
                Map
              </button>
            </li>`;
          })}
        </ul>`
      : html`<p class="cq-empty">
          Nowhere within ${PARTY.range.toLocaleString("en-US")} km of
          ${place(ui, from)} for ${KINDS[draft.kind].name.toLowerCase()} just
          now.
        </p>`,
  )}
  ${d && d.target >= 0 ? partyPicker(ui, d, gov === me.nation) : nothing}
  ${d && d.target >= 0 ? goPanel(ui, d, !!hired) : nothing}`;
}

/** Who leads, and who goes. */
function partyPicker(
  ui: GameUi,
  d: ExpedDraft,
  governor: boolean,
): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const sk = KINDS[d.kind].skill;
  const skName = SKILL_NAMES[sk].toLowerCase();
  const hire = hirelings(s, life, d.kind, 8);
  const court =
    governor && draft.treasury ? courtLeaders(s, me.nation).slice(0, 6) : [];
  const own = peopleOf(life).filter((f) => !f.task && f.c !== d.leader);
  const pick = (c: number) => {
    draft.leader = c === me.id ? -1 : c;
    draft.people = draft.people.filter(
      (id) => peopleOf(life).find((f) => f.id === id)?.c !== c,
    );
    ui.redraw();
  };
  const row = (
    c: number,
    label: TemplateResult | string,
    skill: number,
    fee: number,
    note: string,
  ) =>
    html`<li class=${d.leader === c ? "on" : ""}>
      <label class="cq-exp-site">
        <input
          type="radio"
          name="exp-lead"
          .checked=${d.leader === c}
          @change=${() => pick(c)}
        />
        <b>${label}</b>
        <span class="cq-muted small"
          >${skName} ${skill}${note ? ` · ${note}` : ""}</span
        >
      </label>
      ${fee ? price(fee, { have: life.purse }) : nothing}
    </li>`;
  return html`${section(
    "3. Who leads",
    html`<ul class="cq-exp-sites">
        ${row(
          me.id,
          "You",
          leaderLevel(s, me, sk),
          0,
          "you go, and the scenes on the way are yours",
        )}
        ${hire.map((h) =>
          row(
            h.c.id,
            charName(h.c),
            h.skill,
            h.fee,
            h.yours
              ? "one of your people"
              : `${hirelingWords(h.c)}: goes for you, for a fee`,
          ),
        )}
        ${court.map((c) =>
          row(
            c.id,
            charName(c),
            leaderLevel(s, c, sk),
            0,
            "of the court, at the colony's charge",
          ),
        )}
      </ul>
      <p class="cq-muted small">
        The work at the far end tests the leader's ${skName}. A man you hire
        decides for himself on the way; you're told what came of it.
      </p>`,
  )}
  ${section(
    "4. The party",
    html`<div class="cq-lever">
        <cq-range
          label="Hands hired for the trip"
          .min=${0}
          .max=${PARTY.maxHands}
          .step=${1}
          .value=${draft.hands}
          .format=${(v: number) =>
            `${v} ${d.kind === "raid" ? "rangers" : "hands"} (${Math.round(v * (d.kind === "raid" ? PARTY.ranger : PARTY.hand) * 10) / 10} coins)`}
          @cq-change=${(e: CustomEvent<number>) => {
            draft.hands = e.detail;
            ui.redraw();
          }}
        ></cq-range>
        <p class="cq-muted small">
          ${KINDS[d.kind].minMen > 1
            ? `${KINDS[d.kind].name} needs ${KINDS[d.kind].minMen} men at least. `
            : ""}${d.kind === "raid" ||
          d.kind === "outpost" ||
          d.kind === "port"
            ? "More men help (a level for each six beyond six); "
            : d.kind === "trade" || d.kind === "mission"
              ? "A big armed party puts people off (beyond twelve); "
              : "Porters and canoemen help a little (six or more); "}each
          eats ${PARTY.food} a day there and back.
        </p>
      </div>
      ${own.length
        ? html`<p class="small">Your own people who go:</p>
            <div class="cq-exp-people">
              ${own.map((f) => {
                const on = draft.people.includes(f.id);
                return html`<label class="cq-check small">
                  <input
                    type="checkbox"
                    .checked=${on}
                    @change=${() => {
                      draft.people = on
                        ? draft.people.filter((x) => x !== f.id)
                        : [...draft.people, f.id];
                      ui.redraw();
                    }}
                  />
                  ${charName(s.chars[f.c])}
                  <span class="cq-muted">(${f.kind})</span>
                </label>`;
              })}
            </div>
            <p class="cq-muted small">
              The best of them at the work helps (a third of what they know
              beyond the leader); a guide, a sword or an interpreter is worth
              taking. Their wages go on as usual.
            </p>`
        : nothing}
      ${d.kind === "trade"
        ? html`<div class="cq-lever">
            <cq-range
              label="Trade goods"
              .min=${PARTY.stakeMin}
              .max=${PARTY.stakeMax}
              .step=${5}
              .value=${draft.stake}
              .format=${(v: number) =>
                `${v} coins of cloth, kettles and knives`}
              @cq-change=${(e: CustomEvent<number>) => {
                draft.stake = e.detail;
                ui.redraw();
              }}
            ></cq-range>
          </div>`
        : nothing}
      ${governor
        ? html`<label class="cq-check">
            <input
              type="checkbox"
              .checked=${draft.treasury}
              @change=${() => {
                draft.treasury = !draft.treasury;
                ui.redraw();
              }}
            />
            At the treasury's charge (the colony's expedition: it holds
            ${Math.floor(ui.s.nations[me.nation].gold)} gold)
          </label>`
        : nothing}`,
  )}`;
}

/** The odds, the cost and the days, and the buttons. */
function goPanel(ui: GameUi, d: ExpedDraft, hired: boolean): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const check = planCheck(s, ui.w, life, d, draft.treasury);
  const v = expedOdds(s, ui.w, d, hired, check);
  const cost = costOf(s, ui.map, d, hired);
  const leave =
    d.leader === ui.me!.id
      ? tripLeave(
          s,
          ui.w,
          life,
          d.target,
          cost.days + Math.ceil(KINDS[d.kind].work / 2),
        )
      : null;
  const payCheck = draft.treasury
    ? s.nations[d.n].gold >= cost.total
      ? check
      : {
          ok: false as const,
          why: `The treasury holds ${Math.floor(s.nations[d.n].gold)} gold.`,
        }
    : life.purse >= cost.total
      ? check
      : check.ok
        ? {
            ok: false as const,
            why: "Not enough coins (or ask the governor for a grant: get it up first).",
          }
        : check;
  const params = {
    kind: d.kind,
    p: d.target,
    leader: draft.leader,
    hands: draft.hands,
    people: draft.people,
    stake: draft.stake,
    treasury: draft.treasury,
  };
  return section(
    "5. The odds, and the cost",
    html`${tripPanel(v)} ${costLine(ui, cost)}
      ${leave
        ? html`<p class="cq-callout small">
            ${leave.text}${leave.kind === "job"
              ? html` Ask leave first (Work › Your work): granted
                ${leave.odds ? chanceWords(leave.odds.p) : ""}.`
              : nothing}
          </p>`
        : nothing}
      <div class="cq-btnrow">
        ${action(
          html`Set out
          now${draft.treasury
            ? html`<span class="cq-chip"
                >${cost.total} gold from the treasury</span
              >`
            : price(cost.total, { have: life.purse })}`,
          payCheck,
          () => void ui.cmd({ k: "exped", act: "go", ...params }),
          "primary",
        )}
        ${action(
          "Get it up first (ask others along, or a grant)",
          check,
          () => void ui.cmd({ k: "exped", act: "plan", ...params }),
          "quiet small",
          undefined,
          false,
        )}
      </div>`,
  );
}

const signed = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${coins(Math.abs(v))}`;

/**
 * The odds of one expedition, reckoned once (not by the month, as a boat's
 * work is): each way the far end can go with its chance and what it brings
 * back, then what's expected back against what it costs, the dangers, and
 * what changes the odds. The same classes as the ledger's odds panel.
 */
function tripPanel(v: OddsView): TemplateResult {
  const max = Math.max(0.0001, ...v.outcomes.map((x) => x.p));
  const coinsBack = v.outcomes.some((x) => x.hi > 0);
  const days = v.days
    ? v.days[0] === v.days[1]
      ? `${v.days[0]} days`
      : `${v.days[0]} to ${v.days[1]} days`
    : "";
  const head = coinsBack
    ? html`≈${coins(v.expected)} back against ${coins(v.costNow)} spent:
        <b class="cq-odds-net ${v.net >= 0 ? "good" : "bad"}"
          >${signed(v.net)} on the whole trip</b
        >, and the renown (${days}).`
    : html`No coins back: renown, favour and what it does there, for
      ${coins(v.costNow)} spent (${days}).`;
  return html`<div class="cq-odds-panel">
    <p class="cq-odds-head"><b>${v.title}</b><span>${head}</span></p>
    <ul class="cq-odds-rows">
      ${v.outcomes
        .filter((x) => x.p > 0)
        .map(
          (x) =>
            html`<li class=${x.bad ? "bad" : ""}>
              <span class="cq-odds-chance" title=${pct(x.p)}
                >${chanceWords(x.p)}</span
              >
              <span class="cq-odds-what"
                >${x.label}
                <span class="cq-odds-bar"
                  ><span style="width:${Math.round((x.p / max) * 100)}%"></span
                ></span>
              </span>
              <span class="cq-odds-amt"
                >${coinsBack
                  ? x.hi > 0
                    ? `${coins(x.lo)} back`
                    : "nothing back"
                  : nothing}</span
              >
            </li>`,
        )}
    </ul>
    ${v.risks.some((r) => r.p > 0)
      ? html`<ul class="cq-odds-risks">
          ${v.risks
            .filter((r) => r.p > 0)
            .map(
              (r) =>
                html`<li title=${r.note ?? ""}>
                  <b>${chanceWords(r.p)}</b>: ${r.label}
                </li>`,
            )}
        </ul>`
      : nothing}
    <p class="cq-muted small">
      As things stand when it sets out. Men or days lost on the way (into
      winter) make the far end harder; there, whoever leads may find an easier
      way at it, or a harder one that pays more.
    </p>
    ${v.factors.length
      ? html`<details class="cq-more">
          <summary>What changes the odds</summary>
          <ul class="cq-odds-factors">
            ${v.factors.map((f) => html`<li>${f}</li>`)}
          </ul>
        </details>`
      : nothing}
    ${!v.ok && v.why ? html`<p class="cq-odds-why">${v.why}</p>` : nothing}
  </div>`;
}

function costLine(ui: GameUi, c: ReturnType<typeof costOf>): TemplateResult {
  const parts: string[] = [`fitting out ${c.outfit}`];
  if (c.hands) parts.push(`hands ${c.hands}`);
  parts.push(`food ${c.food}`);
  if (c.fee) parts.push(`the leader's fee ${c.fee}`);
  if (c.stake) parts.push(`trade goods ${c.stake}`);
  return html`<p class="small">
    <b>${c.total} coins</b>: ${parts.join(" · ")}. About ${c.days} days there,
    the work, and as many back.
  </p>`;
}

// ---------------------------------------------------------------- getting one up

function formingCard(ui: GameUi, x: Expedition): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const d = draftOf(x);
  const hired =
    x.leader !== me.id &&
    !lifeOfSeat(s, x.lseat ?? "") &&
    !peopleOf(life).some((f) => f.c === x.leader);
  const v = expedOdds(s, ui.w, d, hired);
  const cost = costNow(s, ui.w, life, x);
  const go = goCheck(s, ui.w, life, x);
  const mineToPay =
    x.grant === undefined && x.treasury > 0
      ? 0
      : Math.max(0, cost - x.treasury);
  const others = s.lives.filter(
    (l) =>
      l.c >= 0 &&
      !l.watching &&
      l.seat !== life.seat &&
      !x.members.some((m) => m.seat === l.seat) &&
      !x.asked.includes(l.seat),
  );
  return html`<div class="cq-callout lit">
      <p>
        Getting up <b>${expedWords(ui.map, x)}</b>, from
        ${provLink(ui, x.from)}. ${charLink(ui, s.chars[x.leader])} leads it;
        ${menOf(d)} men.
      </p>
      <button class="cq-btn quiet small" @click=${() => ui.focusProv(x.target)}>
        Show it on the map
      </button>
    </div>
    ${section(
      "Others along",
      html`${x.members.length || x.asked.length
          ? html`<ul class="cq-list small">
              ${x.members.map(
                (m) =>
                  html`<li>
                    ${charLink(ui, s.chars[m.c])}
                    <span class="cq-chip good">coming</span>
                  </li>`,
              )}
              ${x.asked.map((seat) => {
                const l = lifeOfSeat(s, seat);
                return html`<li>
                  ${charLink(ui, l ? s.chars[l.c] : undefined)}
                  <span class="cq-chip">asked</span>
                  <button
                    class="cq-btn quiet small"
                    @click=${() =>
                      void ui.cmd({ k: "exped", act: "uninvite", seat })}
                  >
                    Ask no more
                  </button>
                </li>`;
              })}
            </ul>`
          : html`<p class="cq-muted small">Nobody yet.</p>`}
        ${others.length
          ? html`<div class="cq-btnrow">
              ${others.map((l) =>
                action(
                  `Ask ${charName(meOf(s, l))} along`,
                  inviteCheck(s, life, l),
                  () =>
                    void ui.cmd({ k: "exped", act: "invite", seat: l.seat }),
                  "small",
                  undefined,
                  false,
                ),
              )}
            </div>`
          : nothing}
        <p class="cq-muted small">
          They're asked in a scene. Those who come must be at
          ${place(ui, x.from)} when it sets out; they share what it brings and
          half the renown.
        </p>`,
    )}
    ${grantSection(ui, x)}
    ${section(
      "The odds, and the cost",
      html`${tripPanel(v)} ${costLine(ui, costOf(s, ui.map, d, hired))}`,
    )}
    <div class="cq-btnrow end">
      ${action(
        html`Set
        out${x.grant === undefined && x.treasury > 0
          ? html`<span class="cq-chip">${cost} gold from the treasury</span>`
          : price(mineToPay, { have: life.purse })}`,
        go,
        () => void ui.cmd({ k: "exped", act: "go" }),
        "primary big",
      )}
      <button
        class="cq-btn quiet small"
        @click=${() =>
          confirm("Give it up?") && void ui.cmd({ k: "exped", act: "cancel" })}
      >
        Give it up
      </button>
    </div>`;
}

/** A grant from the governor: its odds before you ask, or how it stands. */
function grantSection(
  ui: GameUi,
  x: Expedition,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const gov = governorFor(s, x.n);
  if (!gov || gov.c === me.id) return nothing;
  const ask = expedOf(s).asks.find((a) => a.x === x.id && a.stage === "asked");
  if (x.grant !== undefined)
    return section(
      "A grant",
      html`<p class="small good">
        The governor granted ${x.treasury} gold toward it.
      </p>`,
    );
  if (ask)
    return section(
      "A grant",
      html`<p class="small">
        You've asked ${charLink(ui, s.chars[gov.c])} for ${ask.gold}
        gold${gov.life
          ? ": the governor is a player, and will answer for himself."
          : `: the answer comes about ${formatDate(ask.answer)}.`}
      </p>`,
    );
  const most = askMost(s, ui.w, life);
  const capital = s.nations[x.n].capital;
  const byLetter = life.prov !== capital || !!life.travel;
  const o = grantOdds(s, ui.w, life, x, most, byLetter);
  return section(
    "A grant",
    html`<p class="small">
        Ask ${charLink(ui, s.chars[gov.c])} for ${most} gold from the treasury
        (the whole
        cost)${byLetter
          ? html`, by letter (better in person at ${provLink(ui, capital)})`
          : html`, in person`}:
        ${gov.life
          ? "a player governs, and decides for himself."
          : html`granted
            ${num(chanceWords(o.total), () =>
              breakdownTip(
                "Would the governor grant it?",
                o,
                (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)} in 100`,
                [`In all: ${pct(o.total)}.`],
              ),
            )}.`}
        A grant is his leave too.
      </p>
      ${action(
        "Ask for a grant",
        askCheck(s, life, most),
        () => void ui.cmd({ k: "exped", act: "ask", gold: most }),
        "small",
      )}`,
  );
}

// ---------------------------------------------------------------- under way

function underWay(ui: GameUi, x: Expedition): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const with_ = life.travel?.exped === x.id;
  const ch = workChance(s, ui.w, draftOf(x), x.arrive);
  const players = [
    ...(x.lseat ? [x.lseat] : []),
    ...x.members.map((m) => m.seat),
  ]
    .map((seat) => lifeOfSeat(s, seat))
    .filter((l): l is Life => !!l && l.c >= 0);
  return html`<div class="cq-callout lit cq-exp-card">
    <p>
      <b>${cap(expedWords(ui.map, x))}</b>: ${STAGE[x.stage]}, ${dueWords(x)}.
    </p>
    <p class="small">
      Led by ${charLink(ui, s.chars[x.leader])}; ${x.men}
      men${players.length
        ? html`, with
          ${players.map(
            (l, i) => html`${i ? ", " : ""}${charLink(ui, s.chars[l.c])}`,
          )}`
        : nothing}.
      ${x.lost ? `${x.lost} days lost on the way.` : ""}
      ${x.result
        ? html`<span
            class="cq-chip ${x.result === "won"
              ? "good"
              : x.result === "failed"
                ? "bad"
                : ""}"
            >${x.result === "won"
              ? "it went well"
              : x.result === "half"
                ? "a poor showing"
                : x.result === "turned"
                  ? "turned back"
                  : "it failed"}</span
          >`
        : html`At the far end:
          ${num(chanceWords(ch.p), () =>
            breakdownTip(
              "The odds at the far end, as the party stands",
              ch.dc,
              undefined,
              [
                ...ch.skill.parts.map((p) => `${p.label}: ${p.value}`),
                `${ch.skill.total} against ${ch.dc.total}: ${pct(ch.p)}.`,
              ],
            ),
          )}
          it goes well.`}
    </p>
    ${x.note ? html`<p class="small">${x.note}</p>` : nothing}
    <div class="cq-btnrow">
      <button class="cq-btn quiet small" @click=${() => ui.focusProv(x.target)}>
        Show it on the map
      </button>
      ${with_ && x.lseat !== life.seat
        ? html`<button
            class="cq-btn small"
            @click=${() => void ui.cmd({ k: "halt" })}
          >
            Leave it at the next stop
          </button>`
        : nothing}
    </div>
  </div>`;
}

function joinedCard(ui: GameUi, x: Expedition): TemplateResult {
  const s = ui.s;
  return html`<div class="cq-callout">
    <p>
      You'll go with <b>${expedWords(ui.map, x)}</b>, led by
      ${charLink(ui, s.chars[x.leader])}: be at ${provLink(ui, x.from)} when it
      sets out.
    </p>
    <button
      class="cq-btn quiet small"
      @click=${() => void ui.cmd({ k: "exped", act: "leave" })}
    >
      I won't go after all
    </button>
  </div>`;
}

// ---------------------------------------------------------------- asked, and grants to answer

function askedSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const asks = expedOf(s).list.filter(
    (x) => x.stage === "forming" && x.asked.includes(life.seat),
  );
  if (!asks.length) return nothing;
  return section(
    "Asked along",
    html`<ul class="cq-list">
      ${asks.map(
        (x) =>
          html`<li>
            ${charLink(ui, s.chars[lifeOfSeat(s, x.by)?.c ?? -1])} asks you on
            <b>${expedWords(ui.map, x)}</b>, from ${provLink(ui, x.from)}.
            <button
              class="cq-btn small"
              @click=${() =>
                void ui.cmd({ k: "exped", act: "answer", id: x.id, yes: true })}
            >
              I'll come
            </button>
            <button
              class="cq-btn quiet small"
              @click=${() =>
                void ui.cmd({
                  k: "exped",
                  act: "answer",
                  id: x.id,
                  yes: false,
                })}
            >
              Decline
            </button>
          </li>`,
      )}
    </ul>`,
  );
}

function grantsToAnswer(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const n = governs(s, life);
  if (n < 0) return nothing;
  const asks = expedOf(s).asks.filter((a) => a.n === n && a.stage === "asked");
  if (!asks.length) return nothing;
  return section(
    "Petitions for grants",
    html`<ul class="cq-list">
      ${asks.map((a) => {
        const x = expedOf(s).list.find((y) => y.id === a.x);
        return html`<li>
          ${charLink(ui, s.chars[a.c])} asks ${a.gold} gold toward
          ${x ? expedWords(ui.map, x) : "an expedition"}.
          ${action(
            html`Grant it all<span class="cq-chip">${a.gold} gold</span>`,
            s.nations[n].gold >= a.gold
              ? { ok: true }
              : { ok: false, why: "The treasury can't." },
            () =>
              void ui.cmd({ k: "exped", act: "grant", id: a.id, give: "all" }),
            "small",
          )}
          <button
            class="cq-btn small"
            @click=${() =>
              void ui.cmd({ k: "exped", act: "grant", id: a.id, give: "half" })}
          >
            Half
          </button>
          <button
            class="cq-btn quiet small"
            @click=${() =>
              void ui.cmd({ k: "exped", act: "grant", id: a.id, give: "none" })}
          >
            Refuse
          </button>
        </li>`;
      })}
    </ul>`,
  );
}

// ---------------------------------------------------------------- the colony's

function colonySection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const me = ui.me!;
  const st = expedOf(s);
  const out = st.list.filter((x) => x.n === me.nation && x.stage !== "forming");
  const past = st.past
    .filter((x) => x.n === me.nation)
    .slice(-8)
    .reverse();
  if (!out.length && !past.length) return nothing;
  return section(
    "Your colony's expeditions",
    html`${out.length
      ? html`<ul class="cq-list small">
          ${out.map(
            (x) =>
              html`<li>
                ${cap(expedWords(ui.map, x))}: ${STAGE[x.stage]}
                (${charLink(ui, s.chars[x.leader], false)}, ${x.men} men).
              </li>`,
          )}
        </ul>`
      : nothing}
    ${past.length
      ? more(
          "Lately",
          html`<ul class="cq-list small">
            ${past.map(
              (x) =>
                html`<li>
                  ${formatDate(x.end)}: ${KINDS[x.kind].name.toLowerCase()} to
                  ${place(ui, x.target)} under ${charName(s.chars[x.leader])}:
                  ${x.result === "won"
                    ? "it went well"
                    : x.result === "half"
                      ? "a poor showing"
                      : x.result === "turned"
                        ? "turned back"
                        : "it failed"}.
                  <span class="cq-muted">${x.note}</span>
                </li>`,
            )}
          </ul>`,
        )
      : nothing}`,
  );
}

/** For Here: a line pointing to the page when an expedition is yours or asks for you. */
export function expedCallout(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  if (!life) return nothing;
  const x = myExped(s, life.seat);
  const asked = expedOf(s).list.some(
    (y) => y.stage === "forming" && y.asked.includes(life.seat),
  );
  if (!x && !asked) return nothing;
  return html`<button
    class="cq-callout lit cq-link-block"
    @click=${() => ui.open({ k: "tab", tab: "work", sub: "expeditions" })}
  >
    ${x
      ? html`${cap(expedWords(ui.map, x))}: ${STAGE[x.stage]}.`
      : "You're asked along on an expedition."}
    <span class="cq-muted small">Work › Expeditions</span>
  </button>`;
}
