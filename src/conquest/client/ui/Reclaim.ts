// WAR (r17): a town that changed hands, on its page (Here, or any
// province's): who holds it and since when, who wants it back and how much,
// its ferment and where it's heading (and why), a plot or a rising of its
// people with the odds of its first night, and what a player there can do:
// stir the town up, join the plot, lead it, or inform on it. And for the
// World tab and a nation's page: the claims abroad, and the towns in a
// ferment. Every figure comes from engine/ReclaimCore.ts, the reckoning the
// engine rolls from.

import { html, nothing, TemplateResult } from "lit";
import { dateOf, formatDate } from "../../engine/Calendar";
import { lifeOfChar } from "../../engine/LifeQueries";
import { chanceWords } from "../../engine/Odds";
import {
  INFORM,
  plotCheck,
  plotOf,
  STIR,
  STIR_RISK,
  stirOdds,
} from "../../engine/Reclaim";
import {
  CLAIM,
  claimEnds,
  claimLive,
  claimsOn,
  FERMENT,
  plotChance,
  reclaimOf,
  RISING,
  risingOdds,
  townRisingOf,
} from "../../engine/ReclaimCore";
import type { Claim, Movement, Yoke } from "../../engine/Types";
import { nationName } from "../Text";
import { num, plain } from "../Tip";
import {
  action,
  bar,
  breakdownTip,
  charLink,
  GameUi,
  more,
  nationLink,
  odds,
  provLink,
  section,
} from "./Context";
import { price } from "./Price";
import { term } from "./Terms";

const yr = (day: number) => dateOf(day).year;
const nameOf = (ui: GameUi, n: number) =>
  nationName(ui.s.nations[n]?.name ?? "someone");
const HOW: Record<string, string> = {
  treaty: "at a peace",
  rising: "when its people rose",
  mended: "by holding it, with nobody's leave",
};

/** A claim's strength in a word. */
function strength(v: number): string {
  return v >= 60
    ? "strong"
    : v >= CLAIM.war
      ? "worth a war"
      : v >= 15
        ? "fading"
        : "faint";
}

function claimTip(ui: GameUi, c: Claim) {
  const live = claimLive(ui.s, c);
  return breakdownTip(
    `${nameOf(ui, c.by)}'s claim on ${ui.map.provinces[c.p].name}`,
    {
      total: live.total,
      parts: [...c.parts.filter((x) => x.value), ...live.parts.slice(1)],
    },
    plain,
    [
      `Worth a war at ${CLAIM.war} (against another crown's colony, ${CLAIM.warPower}), when they're strong enough.`,
      `It holds ${CLAIM.holdYears} years, then fades to nothing by ${yr(claimEnds(c))}; each war for it that doesn't win it back halves it, and after ${CLAIM.maxTries} it's given up.`,
    ],
  );
}

function claimRow(ui: GameUi, c: Claim, withTown: boolean): TemplateResult {
  const live = claimLive(ui.s, c).total;
  return html`<li class="cq-claim">
    <span class="cq-claim-who">
      ${withTown ? html`${provLink(ui, c.p)}: ` : nothing}${nationLink(
        ui,
        c.by,
      )}
      <span class="cq-muted small"
        >wants it back: lost to ${nameOf(ui, c.from)}
        ${HOW[c.how] ?? "at a peace"} in
        ${yr(c.day)}${c.war !== undefined
          ? html`, <b class="bad">at war for it now</b>`
          : nothing}</span
      >
    </span>
    <span class="cq-claim-v">
      ${bar(live / 100, "invert")}
      ${num(Math.round(live), () => claimTip(ui, c), "cq-meter-n")}
      <span class="cq-chip ${live >= CLAIM.war ? "bad" : ""}"
        >${strength(live)}</span
      >
    </span>
  </li>`;
}

/** The odds of a plot's first night, as rolled. */
function nightPanel(ui: GameUi, m: Movement): TemplateResult {
  const o = risingOdds(ui.s, ui.w, m);
  const R = ui.s.nations[m.against];
  const rows: { label: string; p: number; bad?: boolean; note?: string }[] = [
    { label: "Found out before it begins", p: o.found, bad: true },
    {
      label: "Takes the town",
      p: o.seize,
      note: `${o.men} men against ${o.garrison ? `a garrison of ${o.garrison}` : "no garrison"}`,
    },
    { label: "Beaten in the streets", p: o.beaten, bad: true },
  ];
  const max = Math.max(...rows.map((r) => r.p), 0.01);
  return html`<div class="cq-odds-panel cq-war-odds">
    <p class="cq-odds-head"><b>If it rises: its first night</b></p>
    <ul class="cq-odds-rows">
      ${rows.map(
        (r) =>
          html`<li class=${r.bad ? "bad" : ""}>
            <span class="cq-odds-chance" title=${`${Math.round(r.p * 100)}%`}
              >${chanceWords(r.p)}</span
            >
            <span class="cq-odds-what"
              >${r.label}${r.note
                ? html` <small>(${r.note})</small>`
                : nothing}<span class="cq-odds-bar"
                ><span style="width:${Math.round((r.p / max) * 100)}%"></span
              ></span>
            </span>
          </li>`,
      )}
    </ul>
    <p class="cq-muted small">
      Found out or beaten, its ringleaders are taken and the town is cowed for
      ${FERMENT.cowedYears} years. Taking the town is half of it: it must hold
      it ${RISING.holdMonths} months against the
      ${R.adjective}${o.relief
        ? html`, and <b>${o.relief}</b> of their soldiers are within reach`
        : ", who have no soldiers near"}.
      ${num("What changes the odds", () => ({
        title: "Found out before it begins",
        b: {
          total: o.found * 100,
          parts: o.parts.map((x) => ({ ...x, value: x.value * 100 })),
        },
        fmt: (v: number) => `${Math.round(v)} in 100`,
        notes: [
          `In the streets its men fight the garrison, who count ${RISING.garrisonEdge} times as many: more sworn, support and arms put by mean more men; a garrison means fewer chances.`,
        ],
      }))}
    </p>
  </div>`;
}

function plotCard(ui: GameUi, y: Yoke, m: Movement): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const tr = townRisingOf(s, m);
  const here =
    !!life &&
    !life.watching &&
    !life.travel &&
    life.prov === y.p &&
    life.c >= 0;
  const sworn = !!life && (m.leader === life.c || m.members.includes(life.c));
  const why = life ? plotCheck(s, life, y) : "You're watching.";
  const leadWhy =
    why ??
    (m.status !== "brewing"
      ? "It has risen already"
      : m.leader === life?.c
        ? "You lead it"
        : lifeOfChar(s, m.leader)
          ? "Another player leads it"
          : (life?.renown ?? 0) < 10
            ? "They won't follow an unknown (renown 10)"
            : null);
  const aimWords =
    tr?.aim === "expel"
      ? `take ${ui.map.provinces[y.p].name} back for the ${nameOf(ui, tr.old).replace(/^The /, "")}`
      : tr?.aim === "free"
        ? `make ${ui.map.provinces[y.p].name} a free town`
        : `give ${ui.map.provinces[y.p].name} back to ${nameOf(ui, tr?.old ?? y.old)}`;
  return html`<article class="cq-cause ${m.status}">
    <h4 class="cq-cause-name">
      ${m.name}
      <span class="cq-chip ${m.status === "risen" ? "bad" : ""}"
        >${m.status === "risen" ? "in arms" : "a plot"}</span
      >
    </h4>
    <p class="small">
      They mean to rise against ${nationLink(ui, m.against)} and ${aimWords}.
      Led by ${charLink(ui, s.chars[m.leader])}; ${m.members.length} sworn
      besides.
      ${m.status === "brewing"
        ? html`Its day: about <b>${formatDate(m.due)}</b>.`
        : html`In arms since ${formatDate(m.rose)}: it wins if it still holds
          the town on ${formatDate(m.rose + RISING.holdMonths * 30)}.`}
    </p>
    <div class="cq-meter">
      <span class="cq-meter-label">Support</span>${bar(m.support / 100)}<span
        class="cq-meter-n"
        >${Math.round(m.support)}</span
      >
    </div>
    ${m.status === "brewing" ? nightPanel(ui, m) : nothing}
    ${here && m.status === "brewing"
      ? html`<div class="cq-btnrow">
            ${sworn
              ? html`<span class="cq-chip">You're sworn to it</span>`
              : action(
                  "Swear yourself to it",
                  why ? { ok: false, why } : { ok: true },
                  () => void ui.cmd({ k: "reclaim", act: "join" }),
                  "small primary",
                )}
            ${m.leader !== life?.c
              ? action(
                  "Lead it",
                  leadWhy ? { ok: false, why: leadWhy } : { ok: true },
                  () => void ui.cmd({ k: "reclaim", act: "lead" }),
                  "small",
                )
              : nothing}
            ${!sworn
              ? action(
                  html`Inform on it ${price(INFORM.reward, { gain: true })}`,
                  { ok: true },
                  () => {
                    if (
                      confirm(
                        `Lay an information against ${m.name}? Its ringleaders will be taken, and 1 in 3 its people learn who talked.`,
                      )
                    )
                      void ui.cmd({ k: "reclaim", act: "inform" });
                  },
                  "small quiet",
                )
              : nothing}
          </div>
          ${m.leader === life?.c && tr && tr.aim !== "expel"
            ? html`<div
                class="cq-seg"
                role="radiogroup"
                aria-label="What it's for"
              >
                ${(["restore", "free"] as const).map(
                  (a) =>
                    html`<button
                      role="radio"
                      aria-checked=${tr.aim === a}
                      @click=${() =>
                        void ui.cmd({ k: "reclaim", act: "aim", aim: a })}
                    >
                      ${a === "restore"
                        ? `Back to ${nameOf(ui, tr.old)}`
                        : "A free town"}
                    </button>`,
                )}
              </div>`
            : nothing}
          <p class="cq-muted small">
            ${m.leader === life?.c
              ? html`You call the rising from Society › Causes when it has
                support 40 and three sworn; if you don't, it rises on its day.`
              : html`Sworn, you rise with it. To grow it: meetings, pamphlets
                and arms (Society › Causes).`}
          </p>`
      : nothing}
  </article>`;
}

/** The town's page: who holds it, who wants it back, its ferment and its plot. */
export function townRuleBlock(
  ui: GameUi,
  p: number,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const R = reclaimOf(s);
  const y = R.yokes.find((x) => x.p === p);
  const claims = claimsOn(s, p).filter(
    (c) => claimLive(s, c).total >= CLAIM.minLive,
  );
  if (!y && !claims.length) return nothing;
  const pr = s.provinces[p];
  const since = R.held[p];
  const life = ui.life;
  const here =
    !!life && !life.watching && !life.travel && life.prov === p && life.c >= 0;
  const m = y ? plotOf(ui, y) : undefined;
  const ruling =
    !!life && pr.owner >= 0 && s.nations[pr.owner]?.ruler === life.c;
  const stirWait = life ? (life.cooldowns["reclaim:stir"] ?? 0) - s.day : 0;
  const stirCheck =
    !here || !y
      ? { ok: false as const, why: "Be in the town" }
      : ruling
        ? { ok: false as const, why: "Against your own rule?" }
        : stirWait > 0
          ? { ok: false as const, why: `Again in ${stirWait} days` }
          : { ok: true as const };
  const chance = plotChance(y?.ferment ?? 0);
  return section(
    y ? "Under foreign rule" : "Claims on it",
    html`<p class="small">
        Held by
        ${nationLink(ui, pr.owner)}${since !== undefined
          ? html` since ${yr(since)}`
          : nothing}${claims[0]
          ? html`, taken from ${nationLink(ui, claims[0].by)}
            ${HOW[claims[0].how] ?? "at a peace"}`
          : nothing}.
      </p>
      ${y
        ? html`<div class="cq-meter cq-war-ferment">
              <span class="cq-meter-label">${term("ferment")}</span>${bar(
                y.ferment / 100,
                y.ferment >= FERMENT.plot ? "" : "invert",
              )}<span class="cq-meter-n"
                >${num(Math.round(y.ferment), () =>
                  breakdownTip(
                    `Where ${ui.map.provinces[p].name}'s ferment is heading`,
                    { total: y.target, parts: y.parts },
                    plain,
                    [
                      `It moves about an eighth of the way there each month.`,
                      `A plot can form from ${FERMENT.plot}: a chance a month of 1 in 40 for each point above ${FERMENT.plotFrom}.`,
                    ],
                  ),
                )}</span
              >
            </div>
            <p class="cq-muted small">
              Heading for ${Math.round(y.target)}
              (${y.target >= y.ferment ? "rising" : "falling"}).
              ${m
                ? "A plot is afoot."
                : (y.rest ?? 0) > s.day
                  ? `No plot before ${yr(y.rest!)}: ${
                      (y.cowed ?? 0) > s.day
                        ? "the town is cowed"
                        : "the last came to nothing"
                    }.`
                  : chance > 0
                    ? html`A plot may form: <b>${chanceWords(chance)}</b> a
                        month.`
                    : `A plot can form from ${FERMENT.plot}.`}
            </p>`
        : nothing}
      ${claims.length
        ? html`<ul class="cq-claims">
            ${claims.map((c) => claimRow(ui, c, false))}
          </ul>`
        : nothing}
      ${y && m ? plotCard(ui, y, m) : nothing}
      ${y && here && !m
        ? html`<div class="cq-btnrow">
              ${action(
                html`Stir up the town ${odds(life ? stirOdds(s, life) : null)}`,
                stirCheck,
                () => void ui.cmd({ k: "reclaim", act: "stir" }),
                "small",
              )}
            </div>
            <p class="cq-muted small">
              Persuasion: +${FERMENT.stir} ferment (+${FERMENT.stirPoor} on a
              poor showing). ${chanceWords(STIR_RISK.pass)} you're informed upon
              (${chanceWords(STIR_RISK.fail)} if it goes badly). Once in
              ${STIR.days} days.
            </p>`
        : nothing}`,
  );
}

/** World tab: the claims abroad, and the towns in a ferment. */
export function claimsWorldSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const R = reclaimOf(s);
  const claims = R.claims
    .map((c) => ({ c, v: claimLive(s, c).total }))
    .filter((x) => x.v >= CLAIM.minLive)
    .sort((a, b) => b.v - a.v);
  const yokes = [...R.yokes].sort((a, b) => b.ferment - a.ferment);
  const top = claims.slice(0, 8);
  const rest = claims.slice(8);
  return section(
    "Lost towns and claims",
    claims.length || yokes.length
      ? html`${top.length
          ? html`<ul class="cq-claims">
              ${top.map((x) => claimRow(ui, x.c, true))}
            </ul>`
          : nothing}
        ${rest.length
          ? more(
              `${rest.length} more`,
              html`<ul class="cq-claims">
                ${rest.map((x) => claimRow(ui, x.c, true))}
              </ul>`,
            )
          : nothing}
        ${yokes.length
          ? more(
              `Towns in a ferment (${yokes.length})`,
              html`<ul class="cq-claims">
                ${yokes.slice(0, 20).map(
                  (y) =>
                    html`<li class="cq-claim">
                      <span class="cq-claim-who"
                        >${provLink(ui, y.p)}
                        <span class="cq-muted small"
                          >under ${nameOf(ui, y.ruler)}; its people
                          ${s.nations[y.old]?.adjective ?? "its own"}${y.m !==
                          undefined
                            ? html`; <b class="bad">a plot afoot</b>`
                            : nothing}</span
                        ></span
                      >
                      <span class="cq-claim-v"
                        >${bar(y.ferment / 100, "invert")}<span
                          class="cq-meter-n"
                          >${Math.round(y.ferment)}</span
                        ></span
                      >
                    </li>`,
                )}
              </ul>`,
            )
          : nothing}`
      : html`<p class="cq-muted">Nobody has lost a town they want back.</p>`,
  );
}

/** A nation's page: the towns it wants back, and the claims on its own. */
export function nationClaims(
  ui: GameUi,
  n: number,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const R = reclaimOf(s);
  const live = (c: Claim) => claimLive(s, c).total >= CLAIM.minLive;
  const mine = R.claims.filter((c) => c.by === n && live(c));
  const onIt = R.claims.filter((c) => c.from === n && live(c));
  if (!mine.length && !onIt.length) return nothing;
  return section(
    "Lost towns",
    html`${mine.length
      ? html`<p class="small"><b>Wants back</b></p>
          <ul class="cq-claims">
            ${mine.map((c) => claimRow(ui, c, true))}
          </ul>`
      : nothing}
    ${onIt.length
      ? html`<p class="small"><b>Claimed from it</b></p>
          <ul class="cq-claims">
            ${onIt.map((c) => claimRow(ui, c, true))}
          </ul>`
      : nothing}`,
  );
}
