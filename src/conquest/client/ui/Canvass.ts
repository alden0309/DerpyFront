// POLLS (r16): the canvass on the office pages. Your standing at the poll
// you're in against the strongest rival (or, for the house, the challenger
// put up in your county), week by week; what moved it; both sides line by line;
// the money you can lay out on it, each with its cost on the button and what
// it does; and how your last poll went, and why. Renown and favour's curve
// for the Standing page's tooltips.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import {
  CANVASS_POINTS,
  canvassNow,
  canvassPoints,
  canvassValue,
  LINE_NAMES,
  npcPatron,
  patronsFor,
  patronView,
  POLL,
  pollStakes,
  pollTitle,
  sheriffOf,
  sheriffView,
  treatView,
  winChance,
  type Contender,
  type PollRef,
  type Standing,
} from "../../engine/Canvass";
import { actCheck, actOdds, ACTS } from "../../engine/LifeActs";
import type { Check } from "../../engine/LifeQueries";
import { chanceWords } from "../../engine/Odds";
import { charName } from "../../engine/Queries";
import { favourView, renownView, seatSlip } from "../../engine/Standing";
import {
  FAVOUR_CURVE,
  RENOWN_CURVE,
  settlesAt,
} from "../../engine/StandingCurve";
import type {
  Canvass,
  Life,
  PlaceKind,
  PollLine,
  PollResult,
} from "../../engine/Types";
import type { TipContent } from "../Tip";
import { num } from "../Tip";
import { action, charLink, GameUi, section } from "./Context";
import { price } from "./Price";

const sign = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 10) / 10)}`;

/** A standing's lines as a tooltip. */
function standingTip(title: string, st: Standing): TipContent {
  return {
    title,
    b: {
      total: st.total,
      parts: st.lines.map((l) => ({ label: l.label, value: l.v })),
    },
    notes: [
      `Renown counts ${POLL.renownPer} a point, ${POLL.renownCap} at most; canvassing and treating fade a little each week unless they're kept up. At the count each side has a little luck (± ${POLL.luck}).`,
    ],
  };
}

/** The week-by-week chart: you and the rival. */
function chart(cv: Canvass, rivalName: string): TemplateResult {
  const w = cv.weeks;
  if (w.length < 2)
    return html`<p class="cq-muted small">
      The canvass is written down week by week: come back in a week to see it
      move.
    </p>`;
  const vals = w.flatMap((x) => [x.me, x.them]);
  const lo = Math.min(...vals) - 2;
  const hi = Math.max(...vals) + 2;
  const W = 300;
  const H = 76;
  const x = (i: number) => 6 + (i * (W - 12)) / (w.length - 1);
  const y = (v: number) => H - 8 - ((v - lo) * (H - 16)) / Math.max(1, hi - lo);
  const path = (k: "me" | "them") =>
    w
      .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`)
      .join("");
  const last = w[w.length - 1];
  return html`<figure class="cq-canvass-chart">
    <svg
      viewBox="0 0 ${W} ${H}"
      preserveAspectRatio="none"
      role="img"
      aria-label="Your standing and ${rivalName}'s, week by week"
    >
      <path class="them" d=${path("them")}></path>
      <path class="me" d=${path("me")}></path>
      <circle class="me" cx=${x(w.length - 1)} cy=${y(last.me)} r="3"></circle>
      <circle
        class="them"
        cx=${x(w.length - 1)}
        cy=${y(last.them)}
        r="3"
      ></circle>
    </svg>
    <figcaption class="small">
      <span class="cq-key me">You</span>
      <span class="cq-key them">${rivalName}</span>
      <span class="cq-muted"
        >${w.length} weeks, from ${formatDate(w[0].d)}</span
      >
    </figcaption>
  </figure>`;
}

function lineList(lines: PollLine[]): TemplateResult {
  return html`<ul class="cq-canvass-lines small">
    ${lines.map(
      (l) =>
        html`<li>
          <span>${l.label}</span
          ><b class=${l.v > 0 ? "good" : l.v < 0 ? "bad" : ""}>${sign(l.v)}</b>
        </li>`,
    )}
  </ul>`;
}

/** The money you can lay out on the poll: each with its cost and what it does. */
function levers(ui: GameUi, ref: PollRef, cv: Canvass): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const native =
    s.nations[ref.kind === "local" ? ref.o.nation : ref.n]?.kind === "native";
  const tv = treatView(s, life);
  const sv = sheriffView(s, life);
  const sh = sheriffOf(s, cv.p);
  const pats = native ? [] : patronsFor(s, ref, life);
  const pick =
    patronPick[cv.id] ?? pats.find((x) => x.will)?.c.id ?? pats[0]?.c.id ?? -1;
  const pv = patronView(s, life, pick);
  const spent = Object.values(cv.spent).reduce((a, b) => a + b, 0);
  const boughtPatron = cv.patron >= 0 ? s.chars[cv.patron] : undefined;
  // Canvassing and broadsides: what each does to the canvass now.
  const pts = canvassPoints(s, life, ref);
  const gainOf = (p: number) =>
    Math.round((canvassValue(pts + p) - canvassValue(pts)) * 10) / 10;
  const can = actAt(ui, "canvass", ["tavern", "market", "councilfire"]);
  const canOdds = actOdds(s, life, "canvass");
  const bs = actAt(ui, "broadside", ["press"]);
  const bsCost = ACTS.find((x) => x.key === "broadside")?.cost ?? 2;
  return html`<div class="cq-canvass-levers">
    <div class="cq-canvass-lever">
      ${action(
        native ? "Talk with the town" : "Canvass the voters",
        can.check,
        () => void runAct(ui, can.place, "canvass"),
        "small",
      )}
      <span class="small"
        ><b class="good">+${gainOf(CANVASS_POINTS.pass)}</b> to your standing
        now if it goes
        well${canOdds !== null
          ? html` (${chanceWords(canOdds)}, on your persuasion)`
          : nothing},
        +${gainOf(CANVASS_POINTS.fail)} if not. Free; every two weeks, at a
        tavern or a market.</span
      >
    </div>
    ${native
      ? nothing
      : html`<div class="cq-canvass-lever">
          ${action(
            html`Print a broadside${price(bsCost, { have: life.purse })}`,
            bs.check,
            () => void runAct(ui, bs.place, "broadside"),
            "small",
          )}
          <span class="small"
            ><b class="good">+${gainOf(CANVASS_POINTS.broadside)}</b> to your
            standing now: your name and your promises on every tavern door. Once
            a month, at a press.</span
          >
        </div>`}
    <div class="cq-canvass-lever">
      ${action(
        html`${native ? "A feast for the town" : "Treat the voters"}${price(
          tv.cost,
          { have: life.purse },
        )}`,
        tv.ok ? { ok: true } : { ok: false, why: tv.why },
        () => void ui.cmd({ k: "polls", act: "treat" }),
        "small",
      )}
      <span class="small"
        ><b class="good">+${tv.gain}</b> to your standing now (less with each
        treat; it fades 1 in 20 a week). Once a week, in the county.</span
      >
    </div>
    ${native
      ? nothing
      : html`<div class="cq-canvass-lever">
          ${cv.sheriff >= 0 && sh?.id === cv.sheriff
            ? html`<span class="cq-chip good">The sheriff is yours</span>
                <span class="small"
                  >${charName(sh)} leans your way at the count
                  (+${POLL.sheriffBought}).</span
                >`
            : html`${action(
                  html`A present for the
                  sheriff${price(sv.cost, { have: life.purse })}`,
                  sv.ok ? { ok: true } : { ok: false, why: sv.why },
                  () => void ui.cmd({ k: "polls", act: "sheriff" }),
                  "small",
                )}
                <span class="small"
                  ><b class="good">+${POLL.sheriffBought}</b> at the count: he
                  opens and closes the poll to suit
                  you.${sh
                    ? html` ${chanceWords(sv.risk ?? 0.15)} he takes it amiss
                      (then he sends it back, and remembers).`
                    : nothing}</span
                >`}
        </div>`}
    ${native
      ? nothing
      : html`<div class="cq-canvass-lever">
          ${boughtPatron
            ? html`<span class="cq-chip good"
                  >${charName(boughtPatron)}'s interest</span
                >
                <span class="small"
                  >His tenants and friends vote as he does
                  (+${POLL.patronBought}).</span
                >`
            : pats.length
              ? html`<select
                    class="cq-office-pick"
                    aria-label="Whose interest"
                    @change=${(e: Event) => {
                      patronPick[cv.id] = Number(
                        (e.target as HTMLSelectElement).value,
                      );
                      ui.redraw();
                    }}
                  >
                    ${pats.map(
                      (x) =>
                        html`<option
                          value=${x.c.id}
                          ?selected=${x.c.id === pick}
                        >
                          ${charName(x.c)}${x.will ? "" : " (won't)"}
                        </option>`,
                    )}
                  </select>
                  ${action(
                    html`Buy his interest${price(pv.cost, { have: life.purse })}`,
                    pv.ok ? { ok: true } : { ok: false, why: pv.why },
                    () => void ui.cmd({ k: "polls", act: "patron", c: pick }),
                    "small",
                  )}
                  <span class="small"
                    ><b class="good">+${pv.gain}</b>: a great man's interest
                    (his tenants, his friends, his word).</span
                  >`
              : html`<span class="cq-muted small"
                  >No great man to ask for his interest.</span
                >`}
        </div>`}
    <p class="cq-muted small">
      Standing a round at the tavern helps the canvass too
      (+${CANVASS_POINTS.round} points). Canvassing counts up to
      ${POLL.canvassCap} and fades a tenth a week, so the last few months count
      most.
      ${spent ? html`Laid out on this poll so far: ${spent} coins.` : nothing}
    </p>
  </div>`;
}

/** Where an act can be done here (the first such place that will do), and if not, why. */
function actAt(
  ui: GameUi,
  key: string,
  places: PlaceKind[],
): { place: PlaceKind; check: Check } {
  const s = ui.s;
  const life = ui.life!;
  let first: { place: PlaceKind; check: Check } | null = null;
  for (const place of places) {
    const check = actCheck(s, ui.w, life, place, key);
    if (check.ok) return { place, check };
    if (!first && check.why !== "There's no such place here.")
      first = { place, check };
  }
  return (
    first ?? {
      place: places[0],
      check: {
        ok: false,
        why:
          key === "broadside"
            ? "There's no press here."
            : "There's nowhere here to canvass: a tavern or a market.",
      },
    }
  );
}

/** Run an act, then show what came of it (as Here does). */
async function runAct(ui: GameUi, place: PlaceKind, act: string) {
  if (await ui.cmd({ k: "act", place, act })) ui.modal({ k: "outcome" });
}

const patronPick: Record<number, number> = {};

function rivalLine(
  ui: GameUi,
  ref: PollRef,
  rival: Contender | null,
): TemplateResult {
  const s = ui.s;
  if (!rival) return html`unopposed, so far`;
  const c = s.chars[rival.c];
  // The house: the man put up against you in your county, if there is one.
  const put =
    ref.kind === "assembly" &&
    !!s.polities[ref.n]?.candidates.some((x) => x.c === rival.c) &&
    c?.home === ui.life?.home;
  const pat = put ? npcPatron(s, ref, rival.c) : -1;
  if (put)
    return html`${charLink(ui, c, false)}, put up against you in the
    county${pat >= 0
      ? html`, with ${charName(s.chars[pat])}'s interest`
      : nothing},
    at about
    ${num(
      String(Math.round(rival.st.total)),
      () => standingTip(`${charName(c)}'s standing`, rival.st),
      "cq-opinion",
    )}`;
  return ref.kind === "assembly"
    ? html`the last of the ${s.polities[ref.n]?.seats ?? 6} seats goes at about
      ${num(
        String(Math.round(rival.st.total)),
        () => standingTip(`${charName(c)}'s standing`, rival.st),
        "cq-opinion",
      )}
      (${charLink(ui, c, false)})`
    : html`${charLink(ui, c, false)} at about
      ${num(
        String(Math.round(rival.st.total)),
        () => standingTip(`${charName(c)}'s standing`, rival.st),
        "cq-opinion",
      )}`;
}

/** The canvass section, for Society › Office (and Standing, for the house). */
export function canvassSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  if (!life || life.c < 0 || life.watching) return nothing;
  const now = canvassNow(s, life);
  const last = life.polls?.last;
  if (!now) return last ? lastResult(ui, last) : nothing;
  const cv = life.polls?.canvass;
  const { ref, me, rival } = now;
  const weeks = Math.max(0, Math.ceil((now.day - s.day) / 7));
  const rn = rival ? (s.chars[rival.c]?.first ?? "the rival") : "nobody";
  const ahead = rival ? me.total > rival.st.total : true;
  const stakes = pollStakes(ref);
  return html`${section(
    html`The canvass: ${pollTitle(s, ui.w, ref)}`,
    html`<p class="small">
        The count is on <b>${formatDate(now.day)}</b>${weeks
          ? html`, in ${weeks} week${weeks === 1 ? "" : "s"}`
          : html`, this month`}.
        ${life.campaign ||
        (ref.kind === "local" && ref.o.candidates.some((x) => x.c === life.c))
          ? "You're standing."
          : "You sit already: you stand again at the count."}
      </p>
      <p class="cq-canvass-head">
        You stand at
        ${num(
          String(Math.round(me.total)),
          () => standingTip("Your standing at the poll", me),
          `cq-opinion ${ahead ? "good" : "bad"}`,
        )};
        ${rivalLine(ui, ref, rival)}.
        <span
          class="cq-chip ${now.chance >= 0.65
            ? "good"
            : now.chance < 0.4
              ? "bad"
              : "gold"}"
          >${chanceWords(now.chance)} to win at the count</span
        >
      </p>
      ${cv ? chart(cv, rn) : nothing}
      ${cv?.moved.length
        ? html`<h4 class="cq-int-group">What moved it this week</h4>
            <ul class="cq-canvass-moved small">
              ${cv.moved.map(
                (m) =>
                  html`<li>
                    <b class=${m.v > 0 ? "good" : "bad"}>${sign(m.v)}</b>
                    ${m.label}
                  </li>`,
              )}
            </ul>`
        : nothing}
      <div class="cq-canvass-sides">
        <div>
          <h4 class="cq-int-group">Your standing</h4>
          ${lineList(me.lines)}
        </div>
        ${rival
          ? html`<div>
              <h4 class="cq-int-group">${charName(s.chars[rival.c])}</h4>
              ${lineList(rival.st.lines)}
            </div>`
          : nothing}
      </div>
      ${stakes < 1
        ? html`<p class="cq-muted small">
            The county's people fight a ${stakes < 0.6 ? "lesser" : "great"}
            office less hard than a seat in the house: their canvass, treating
            and patrons count ${Math.round(stakes * 100)} in 100 of what they
            would.
          </p>`
        : nothing}
      <h4 class="cq-int-group">Money for the poll</h4>
      ${cv ? levers(ui, ref, cv) : nothing}`,
  )}
  ${last ? lastResult(ui, last) : nothing}`;
}

function lastResult(ui: GameUi, r: PollResult): TemplateResult {
  const s = ui.s;
  const rival = s.chars[r.rival];
  return html`<p class="cq-muted small cq-pad">
    Your last poll, ${formatDate(r.day)}: ${r.title},
    <b class=${r.won ? "good" : "bad"}>${r.won ? "won" : "lost"}</b>
    ${r.me} to ${r.them}${rival ? html` (${charName(rival)})` : nothing}.
    ${r.why.length ? html`Why: ${r.why.join("; ")}.` : nothing}
  </p>`;
}

/** A short line for an office row: your standing there and the strongest rival. */
export function pollChip(
  ui: GameUi,
  me: Standing,
  rival: Contender | null,
): TemplateResult {
  const s = ui.s;
  const chance = rival ? winChance(me.total - rival.st.total) : 1;
  return html`Your standing
  ${num(
    String(Math.round(me.total)),
    () => standingTip("Your standing at the poll", me),
    `cq-opinion ${rival && me.total <= rival.st.total ? "bad" : "good"}`,
  )}
  ${rival
    ? html`against ${charLink(ui, s.chars[rival.c], false)} (about
      ${num(
        String(Math.round(rival.st.total)),
        () => standingTip(`${charName(s.chars[rival.c])}'s standing`, rival.st),
        "cq-opinion",
      )}):
      ${chanceWords(chance)} to win as it stands`
    : html`(unopposed, so far)`}.`;
}

// ---------------------------------------------------------------- renown and favour on their curve

/** The curve, said plainly for a tooltip: what a gain counts for now and what a month takes. */
export function curveNotes(life: Life, which: "renown" | "favour"): string[] {
  const v = which === "renown" ? renownView(life) : favourView(life);
  const c = which === "renown" ? RENOWN_CURVE : FAVOUR_CURVE;
  const pct = Math.round(v.factor * 100);
  const out = [
    v.value <= c.knee
      ? `Up to ${c.knee} every point gained counts in full.`
      : `Above ${c.knee} each gain counts for less: at ${Math.round(v.value)} a point gained counts ${pct} in 100.`,
    `It fades by about ${Math.round(v.fade * 10) / 10} a month at ${Math.round(v.value)}${v.value > c.knee ? " (faster the higher it stands)" : ""}.`,
    which === "renown"
      ? `A steady 2 a month settles about ${settlesAt(c, 2)}; 4 a month, about ${settlesAt(c, 4)}.`
      : `A steady 2 a month settles about ${settlesAt(c, 2)}; it never passes ${c.max}.`,
  ];
  if (which === "favour")
    out.push(
      `In the same seat a year with nothing delivered (a law, a work, a power or a measure carried), it slips: ${seatSlip(1)}, then ${seatSlip(2)}, ${seatSlip(3)}, up to ${seatSlip(9)} a year.`,
    );
  return out;
}

export const renownLabel = (v: number) => LINE_NAMES.name + ` ${v}`;
