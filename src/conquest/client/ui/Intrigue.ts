// INTRIGUE (r15): hearts and schemes in the browser.
// - Society › Intrigue: a promise to marry and its wedding, your husband or
//   wife, your schemes as they ripen, those you keep, plots against you that
//   you've found out, and what came of the rest.
// - "Hearts and schemes" on anyone's card: win them, plot against them, court
//   your own husband or wife, write to a player in your own words.
// - The windows: a seduction or a plot, with the odds shown before you commit
//   (from the same reckoning the engine rolls); drawing in an accomplice; the
//   wedding planner (the place, how grand, the day, the guests, the cost on
//   the button); a letter in your own words, and reading one on letter paper.
// - The journey to a gathering you're asked to, on its invitation.
// Everything here is the player's own: other players are never sent it.

import { html, nothing, TemplateResult } from "lit";
import { journeyView } from "../../engine/Attendance";
import { formatDate } from "../../engine/Calendar";
import { attendees, gatheringById, invitables } from "../../engine/Gatherings";
import {
  betrothalOf,
  betrothedTo,
  intrigueOf,
} from "../../engine/IntrigueCore";
import { addressOf, postOf, postRoute } from "../../engine/Letters";
import { lifeOfChar, opinionOf, weddingCost } from "../../engine/LifeQueries";
import { NOTE_MAX, noteCheck, SUBJECT_MAX } from "../../engine/Notes";
import { chanceWords } from "../../engine/Odds";
import {
  accompliceCandidates,
  PLOT,
  PLOT_METHOD_KEYS,
  PLOT_METHODS,
  plotCheck,
  plotCost,
  plotsAgainst,
  plotStage,
  plotView,
  recruitView,
  schemeById,
} from "../../engine/Plots";
import { ageOf, charName } from "../../engine/Queries";
import {
  FOND,
  keepCost,
  keptOf,
  mySchemes,
  seduceCheck,
  seduceView,
  wooView,
} from "../../engine/Seduction";
import type {
  Character,
  Gathering,
  IntrigueScheme,
  Letter,
  Life,
  PlotMethod,
  WeddingRite,
} from "../../engine/Types";
import {
  BANNS_DAYS,
  betrothalById,
  breachCost,
  dowryOf,
  jiltCheck,
  LICENCE,
  planView,
  quietCheck,
  RITES,
  ritesFor,
  riteVenue,
  TIERS,
  weddingPlanCost,
} from "../../engine/Weddings";
import { QuillIcon } from "../Icons";
import { play } from "../Sound";
import {
  action,
  charLink,
  GameUi,
  Modal,
  provLink,
  section,
  token,
} from "./Context";
import { pageHead } from "./Nav";
import { price, priceWords } from "./Price";
import { curly, reasons } from "./Scene";
import { termMark } from "./Terms";

type IntrigueModal = Extract<Modal, { k: "intrigue" }>;

const pct = (p: number) =>
  p > 0 && p < 0.01
    ? `${Math.round(p * 1000) / 10}%`
    : `${Math.round(p * 100)}%`;

const watching = html`<p class="cq-muted">You're watching.</p>`;

/** Each way something can go, with its chance, in the odds panel's style. */
function oddsRows(
  rows: { label: string; p: number; bad?: boolean }[],
): TemplateResult {
  const shown = rows.filter((r) => r.p > 0);
  const max = Math.max(0.0001, ...shown.map((r) => r.p));
  return html`<ul class="cq-odds-rows cq-intr-rows">
    ${shown.map(
      (r) =>
        html`<li class=${r.bad ? "bad" : ""}>
          <span class="cq-odds-chance" title=${pct(r.p)}
            >${chanceWords(r.p)}</span
          >
          <span class="cq-odds-what"
            >${r.label}
            <span class="cq-odds-bar"
              ><span style="width:${Math.round((r.p / max) * 100)}%"></span
            ></span>
          </span>
          <span class="cq-odds-amt">${pct(r.p)}</span>
        </li>`,
    )}
  </ul>`;
}

/** The head of a scheme's window: their portrait, who they are, what they think of you. */
function whoHead(
  ui: GameUi,
  c: Character,
  kicker: string,
  title: string,
): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const op = opinionOf(s, c, life).total;
  const sp = s.chars[c.spouse];
  const player = lifeOfChar(s, c.id);
  return html`<header class="cq-intr-head">
    ${token(ui, c, "xl")}
    <div>
      <p class="cq-kicker">${kicker}</p>
      <h2 class="cq-h1">${title}</h2>
      <p class="cq-muted small">
        ${ageOf(s, c)}${sp?.alive
          ? html`, married to ${charLink(ui, sp, false)}`
          : ", unmarried"}.
        ${player ? html`Played by ${player.name}. ` : nothing}What ${c.first}
        thinks of you:
        <b class="cq-intr-op ${op >= 20 ? "good" : op <= -20 ? "bad" : ""}"
          >${op > 0 ? "+" : ""}${op}</b
        >.
      </p>
    </div>
  </header>`;
}

const scheme = (
  ui: GameUi,
  c: Character | undefined,
  kind: IntrigueScheme["kind"],
) =>
  c
    ? intrigueOf(ui.s).schemes.find(
        (x) =>
          x.seat === ui.seat &&
          x.target === c.id &&
          x.kind === kind &&
          (x.status === "on" || x.status === "strike"),
      )
    : undefined;

// ---------------------------------------------------------------- the card's block

/** Reasons a scheme isn't for the two of you at all (the button isn't shown). */
const NEVER =
  /^(That's you|Not until|Never a child|Too close kin|Not your own|Not in this century|They're gone|They're beyond|You're watching)/;

/** "Hearts and schemes" on someone's card. */
export function intrigueCard(
  ui: GameUi,
  c: Character,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  if (!life || !me || life.watching || !c.alive || c.abroad) return nothing;
  const player = lifeOfChar(s, c.id);
  const buttons: TemplateResult[] = [];
  const btn = (
    label: string | TemplateResult,
    check: { ok: true } | { ok: false; why: string },
    run: () => void,
    tip: string,
    cls = "",
  ) =>
    html`<button
      class="cq-int ${cls} ${check.ok ? "" : "has-why"}"
      ?disabled=${!check.ok}
      title=${check.ok ? tip : check.why}
      @click=${run}
    >
      <span class="cq-int-label">${label}</span>
      <span class="cq-act-why">${check.ok ? "" : check.why}</span>
    </button>`;
  // Your own husband or wife: court them.
  if (me.spouse === c.id) {
    const v = wooView(s, life);
    buttons.push(
      btn(
        `Court your ${c.female ? "wife" : "husband"}`,
        v.check,
        () => void woo(ui),
        `An evening for the two of you: they'll think the better of you, and a child is likelier for half a year (${pct(v.now)} → ${pct(v.fond)} a year).`,
        "lit",
      ),
    );
  } else {
    // Win them.
    const sc = seduceCheck(s, ui.w, life, c);
    const going = scheme(ui, c, "seduce");
    if (going || sc.ok || !NEVER.test(sc.why))
      buttons.push(
        btn(
          going ? `Winning ${c.first}: ${plotStage(going)}` : "Seduce…",
          going ? { ok: true } : sc,
          () =>
            going
              ? ui.open({ k: "tab", tab: "society", sub: "intrigue" })
              : ui.modal({ k: "intrigue", what: "seduce", c: c.id }),
          player
            ? "Make your interest plain: their player decides."
            : "Set about winning them, as a lover or someone kept. The odds are shown before you begin.",
        ),
      );
  }
  // Plot against them.
  const plotting = scheme(ui, c, "plot");
  const pc = PLOT_METHOD_KEYS.map((m) => plotCheck(s, ui.w, life, c, m));
  const anyOk = pc.find((x) => x.ok) ?? pc[0];
  if (plotting || anyOk.ok || !NEVER.test(anyOk.why))
    buttons.push(
      btn(
        plotting ? `A plot: ${plotStage(plotting)}` : "Plot against…",
        plotting ? { ok: true } : anyOk,
        () =>
          plotting
            ? ui.open({ k: "tab", tab: "society", sub: "intrigue" })
            : ui.modal({ k: "intrigue", what: "plot", c: c.id }),
        "Have them killed: the ways, the cost, the chance it comes off and the chance it's found out, before you begin.",
        "rough",
      ),
    );
  // A player: a letter in your own words.
  if (player)
    buttons.push(
      btn(
        html`${QuillIcon()} Write in your own words…`,
        { ok: true },
        () => ui.modal({ k: "intrigue", what: "letter", c: c.id }),
        "A letter in your own words, by the post. Only their player will read it.",
      ),
    );
  if (!buttons.length) return nothing;
  return html`<section class="cq-section cq-interactions cq-intr-card">
    <h3 class="cq-h3">Hearts and schemes</h3>
    <div class="cq-int-list">${buttons}</div>
  </section>`;
}

async function woo(ui: GameUi): Promise<void> {
  if (await ui.cmd({ k: "intrigue", act: "woo" })) play("seal");
}

// ---------------------------------------------------------------- Society › Intrigue

/** Marks for the tab: a promise with no wedding planned. */
export function intrigueMarks(ui: GameUi): number {
  const me = ui.me;
  if (!me) return 0;
  const b = betrothalOf(ui.s, me.id);
  return b?.status === "promised" ? 1 : 0;
}

export function intriguePage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  if (!life || !me || life.watching)
    return html`<p class="cq-empty">You're watching.</p>`;
  const st = intrigueOf(s);
  const mine = mySchemes(s, life).filter((x) => x.by === me.id);
  const live = mine.filter((x) => x.status === "on" || x.status === "strike");
  const ended = mine
    .filter((x) => x.status !== "on" && x.status !== "strike")
    .slice(-5)
    .reverse();
  const kept = keptOf(s, life);
  const keptBy = st.kept.filter((k) => k.c === me.id);
  const against = plotsAgainst(s, life).filter(
    (x) => x.status === "on" || x.status === "strike",
  );
  const guard = st.guards[me.id];
  return html`${pageHead(
      "Intrigue",
      html`A match to make and a wedding to plan; a lover won, or someone kept;
      and plots, yours and against you. It's all your own business: other
      players see none of it unless it comes out.`,
    )}
    ${betrothalSection(ui, life, me)} ${spouseSection(ui, life, me)}
    ${section(
      html`Your schemes ${termMark("scheme")}`,
      live.length
        ? html`<div class="cq-intr-list">
            ${live.map((x) => schemeCard(ui, life, x))}
          </div>`
        : html`<p class="cq-muted small">
            Nothing afoot. To win someone, or to plot against them, open their
            card: <b>Hearts and schemes</b>.
          </p>`,
    )}
    ${kept.length || keptBy.length
      ? section(
          html`Kept ${termMark("kept")}`,
          html`<ul class="cq-intr-kept">
            ${kept.map((k) => {
              const c = s.chars[k.c];
              return html`<li>
                ${token(ui, c, "small")}
                <span
                  ><b>${charLink(ui, c, false)}</b>
                  <span class="cq-muted small"
                    >since
                    ${formatDate(k.since)}${k.owed
                      ? html` · <b class="cq-intr-op bad">allowance unpaid</b>`
                      : nothing}</span
                  ></span
                >
                ${price(k.cost, { per: "month" })}
                <button
                  class="cq-btn quiet small"
                  @click=${() =>
                    ui.cmd({ k: "intrigue", act: "unkeep", c: k.c })}
                >
                  End it
                </button>
              </li>`;
            })}
            ${keptBy.map((k) => {
              const c = s.chars[k.by];
              return html`<li>
                ${token(ui, c, "small")}
                <span
                  ><b>${charLink(ui, c, false)}</b>
                  <span class="cq-muted small">keeps you</span></span
                >
                ${price(k.cost, { per: "month", gain: true })}
                <span></span>
              </li>`;
            })}
          </ul>`,
        )
      : nothing}
    ${against.length || (guard !== undefined && guard >= s.day)
      ? section(
          "Against you",
          html`${guard !== undefined && guard >= s.day
            ? html`<p class="small">
                Men you hired watch over you until
                <b>${formatDate(guard)}</b>: anyone who comes for you meets them
                first.
              </p>`
            : nothing}
          ${against.map((x) => {
            const by = s.chars[x.by];
            return html`<div class="cq-intr-scheme bad">
              <p>
                <b>${charLink(ui, by, false)}</b> wants you dead
                (${PLOT_METHODS[x.method ?? "poison"].label.toLowerCase()}). You
                know it. Their card: Hearts and schemes, if you'd answer in
                kind; or the law.
              </p>
            </div>`;
          })}`,
        )
      : nothing}
    ${ended.length
      ? section(
          "Lately",
          html`<ul class="cq-intr-past">
            ${ended.map(
              (x) =>
                html`<li>
                  <b
                    >${x.kind === "plot" ? "A plot against" : "Winning"}
                    ${charName(s.chars[x.target])}</b
                  >: ${x.lines[x.lines.length - 1] ?? x.status}
                  <span class="cq-muted small"
                    >${x.ended ? formatDate(x.ended) : ""}</span
                  >
                </li>`,
            )}
          </ul>`,
        )
      : nothing}
    <p class="cq-muted small cq-pad">
      Seduction and marriage are between grown people (eighteen and over), and
      never close kin; the door closes on the rest. A plot never touches a
      child. Another player's character is never won, wed or struck down without
      their player's own answer in a scene.
    </p>`;
}

/** A promise to marry: plan the wedding, marry quietly, or break it off. */
function betrothalSection(
  ui: GameUi,
  life: Life,
  me: Character,
): TemplateResult {
  const s = ui.s;
  const b = betrothalOf(s, me.id);
  if (!b)
    return section(
      html`Promised ${termMark("betrothal")}`,
      html`<p class="cq-muted small">
        You're not promised to anyone. To ask for someone's hand, open their
        card: Interactions › <b>Ask for their hand</b>. Say yes to it, or have
        it said to you, and you're betrothed, with a wedding to plan.
      </p>`,
    );
  const other = s.chars[betrothedTo(b, me.id)];
  const gat = b.gat !== undefined ? gatheringById(s, b.gat) : undefined;
  const qc = quietCheck(s, life, b.id);
  const jc = jiltCheck(s, life, b.id);
  const otherPlayed = !!lifeOfChar(s, other?.id ?? -1);
  const damages = otherPlayed ? 0 : breachCost(s, other);
  const dowry = other && !otherPlayed ? dowryOf(s, other) : 0;
  return section(
    html`Promised ${termMark("betrothal")}`,
    html`<div class="cq-intr-bet">
      ${token(ui, other, "small")}
      <div>
        <p>
          To <b>${charLink(ui, other)}</b>, since ${formatDate(b.since)}.
          ${dowry
            ? html`Their family will settle a marriage portion of about
                <b>${priceWords(dowry)}</b> at the wedding.`
            : nothing}
        </p>
        ${b.status === "planned" && gat
          ? html`<p class="small">
              <b>The wedding:</b> ${RITES[
                b.rite ?? "church"
              ].label.toLowerCase()}
              at ${provLink(ui, gat.prov)}, on <b>${formatDate(gat.day)}</b>
              (${TIERS[b.tier ?? 0].name.toLowerCase()},
              ${gat.invited.length - 1}
              asked)${b.licence
                ? ", by licence"
                : RITES[b.rite ?? "church"].banns
                  ? ", the banns read three Sundays"
                  : ""}.
              Be there on the day, both of you.
            </p>`
          : html`<p class="small">
              No wedding planned yet. Plan one (the place, how grand, the day,
              who's asked), or be married quietly before the minister.
              ${otherPlayed
                ? nothing
                : html`<span class="cq-muted"
                    >Left two years, or if ${other?.first ?? "they"} comes to
                    think ill of you, it lapses.</span
                  >`}
            </p>`}
        <div class="cq-btnrow">
          ${b.status === "promised"
            ? html`<button
                class="cq-btn primary small"
                ?disabled=${!!life.travel}
                title=${life.travel ? "Not from the road." : ""}
                @click=${() =>
                  ui.modal({ k: "intrigue", what: "wedding", id: b.id })}
              >
                Plan the wedding…
              </button>`
            : nothing}
          ${action(
            html`A quiet wedding
            now${b.status === "promised"
              ? price(weddingCost(s, life), { have: life.purse })
              : nothing}`,
            qc,
            async () => {
              if (
                confirm(
                  `Be married to ${charName(other)} now, quietly, before the minister and two witnesses${b.status === "planned" ? " (the wedding planned is called off; what was paid is spent)" : ""}?`,
                )
              )
                await ui.cmd({ k: "intrigue", act: "quiet", id: b.id });
            },
            "small",
          )}
          ${action(
            html`Break it
            off${damages ? price(damages, { have: life.purse }) : nothing}`,
            jc,
            async () => {
              if (
                confirm(
                  `Break off your engagement to ${charName(other)}?${damages ? ` Their family will want ${priceWords(damages)} in damages for the breach of promise, and won't forgive it.` : ""}`,
                )
              )
                await ui.cmd({ k: "intrigue", act: "jilt", id: b.id });
            },
            "quiet small",
          )}
        </div>
      </div>
    </div>`,
  );
}

/** Your husband or wife: court them again. */
function spouseSection(
  ui: GameUi,
  life: Life,
  me: Character,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const sp = s.chars[me.spouse];
  if (!sp?.alive) return nothing;
  const v = wooView(s, life);
  const until = life.cooldowns["intr:fond"] ?? 0;
  const word = sp.female ? "wife" : "husband";
  return section(
    `Your ${word}`,
    html`<div class="cq-intr-bet">
      ${token(ui, sp, "small")}
      <div>
        <p class="small">
          ${until > s.day
            ? html`You and ${sp.first} are courting each other again, until
              ${formatDate(until)}: a child is likelier (${pct(v.now)} a year).`
            : html`Court ${sp.first} again (supper, a walk, the door closed on
              the world): they'll think the better of you, and for
              ${Math.round(FOND.days / 30)} months a child is ${FOND.mul}×
              likelier (${pct(v.now)} → ${pct(v.fond)} a year).`}
          ${v.player
            ? html`<span class="cq-muted"
                >${sp.first} is another player: they'll be asked.</span
              >`
            : nothing}
        </p>
        <div class="cq-btnrow">
          ${action(`Court your ${word}`, v.check, () => void woo(ui), "small")}
        </div>
      </div>
    </div>`,
  );
}

/** A scheme as it ripens: how far on, the odds now, what's happened, what can be done. */
function schemeCard(ui: GameUi, life: Life, x: IntrigueScheme): TemplateResult {
  const s = ui.s;
  const c = s.chars[x.target];
  const plot = x.kind === "plot";
  const def = plot ? PLOT_METHODS[x.method ?? "poison"] : null;
  const found = 1 - (1 - x.odds.d) ** Math.max(1, x.weeks - x.week);
  const player = !!lifeOfChar(s, x.target);
  const frac = x.weeks ? Math.min(1, x.week / x.weeks) : 0;
  return html`<article class="cq-intr-scheme ${plot ? "plot" : "heart"}">
    <header>
      ${token(ui, c, "small")}
      <span>
        <b>${plot ? "A plot against" : "Winning"} ${charLink(ui, c, false)}</b>
        <span class="cq-muted small"
          >${plot ? def!.label : x.aim === "keep" ? "to keep" : "as lovers"} ·
          since ${formatDate(x.started)}</span
        >
      </span>
      <span class="cq-chip ${x.status === "strike" ? "bad" : "gold"}"
        >${plotStage(x)}</span
      >
    </header>
    <span class="cq-intr-progress" title="${x.week} of ${x.weeks} weeks"
      ><span style="width:${Math.round(frac * 100)}%"></span
    ></span>
    <p class="small cq-intr-odds">
      ${player && plot
        ? html`A player: they'll be warned, and meet the moment themselves.`
        : html`Comes off: <b>${chanceWords(x.odds.p)}</b>
            <span class="cq-muted">(${pct(x.odds.p)})</span>.`}
      ${x.odds.d > 0
        ? html`Found out before then:
            <b>${chanceWords(found)}</b>
            <span class="cq-muted">(${pct(x.odds.d)} a week)</span>.`
        : nothing}
      ${plot && x.helpers.length
        ? html`Accomplices:
          ${x.helpers.map((h, i) =>
            i
              ? html`, ${charLink(ui, s.chars[h], false)}`
              : charLink(ui, s.chars[h], false),
          )}.`
        : nothing}
      ${x.paid ? html`Laid out: ${priceWords(x.paid)}.` : nothing}
    </p>
    <ol class="cq-intr-lines">
      ${x.lines.slice(-4).map((t) => html`<li>${t}</li>`)}
    </ol>
    <div class="cq-btnrow">
      ${plot && x.status === "on"
        ? html`<button
            class="cq-btn small"
            ?disabled=${x.helpers.length >= PLOT.maxHelpers}
            title=${x.helpers.length >= PLOT.maxHelpers
              ? `${PLOT.maxHelpers} accomplices are plenty.`
              : "People here who think well of you, with a grudge, debts or greed: likelier to come off, and more mouths to keep shut."}
            @click=${() =>
              ui.modal({ k: "intrigue", what: "recruit", id: x.id })}
          >
            Draw someone in…
          </button>`
        : nothing}
      ${x.status === "on"
        ? html`<button
            class="cq-btn quiet small"
            @click=${() => {
              if (
                confirm(
                  plot
                    ? "Let the plot drop? What's laid out is spent."
                    : `Give up on ${c?.first ?? "them"}?`,
                )
              )
                void ui.cmd({ k: "intrigue", act: "drop", id: x.id });
            }}
          >
            Let it drop
          </button>`
        : nothing}
    </div>
  </article>`;
}

// ---------------------------------------------------------------- the windows

export function intrigueModal(ui: GameUi, m: IntrigueModal): TemplateResult {
  switch (m.what) {
    case "seduce":
      return seduceModal(ui, m.c ?? -1);
    case "plot":
      return plotModal(ui, m.c ?? -1);
    case "recruit":
      return recruitModal(ui, m.id ?? -1);
    case "wedding":
      return weddingModal(ui, m.id ?? -1);
    case "letter":
      return letterModal(ui, m.c, m.id);
    case "read":
      return readModal(ui, m.id ?? -1);
  }
}

// ---- winning someone

let sd: { key: string; aim: "lover" | "keep" } = { key: "", aim: "lover" };

function seduceModal(ui: GameUi, cId: number): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const c = s.chars[cId];
  if (!life || !ui.me || !c) return watching;
  const key = `${ui.modalSeq}|${cId}`;
  if (sd.key !== key) sd = { key, aim: "lover" };
  const v = seduceView(s, ui.w, life, cId, sd.aim);
  const cost = keepCost(s, c);
  const set = (aim: "lover" | "keep") => {
    sd.aim = aim;
    ui.redraw();
  };
  const won = v.outcomes[0];
  return html`<div class="cq-intr">
    ${whoHead(ui, c, "Hearts", `Win ${charName(c)}`)}
    <div class="cq-seg big" role="radiogroup" aria-label="What you're after">
      <button
        role="radio"
        aria-checked=${sd.aim === "lover"}
        @click=${() => set("lover")}
      >
        As lovers<span>Your hearts, and nobody's purse</span>
      </button>
      <button
        role="radio"
        aria-checked=${sd.aim === "keep"}
        @click=${() => set("keep")}
      >
        To keep ${price(cost, { per: "month" })}<span
          >${c.female ? "A mistress" : "A kept man"}: rooms of
          ${c.female ? "her" : "his"} own, and an allowance</span
        >
      </button>
    </div>
    ${v.player
      ? html`<div class="cq-callout">
          <p>
            ${c.first} is another player's character. Nothing happens unless
            they say yes: they'll be asked in a scene of their own, and
            decide${sd.aim === "keep"
              ? html`, knowing you offer ${priceWords(cost)} a month`
              : nothing}.
          </p>
        </div>`
      : html`<div class="cq-odds-panel">
            <p class="cq-odds-head">
              <b>${v.weeks} weeks of attentions; then ${c.first} decides</b
              ><span
                >Won: <b>${chanceWords(won?.p ?? 0)}</b>${sd.aim === "keep"
                  ? html`, then ${price(cost, { per: "month" })} while it lasts`
                  : nothing}</span
              >
            </p>
            ${oddsRows(v.outcomes)}
            <ul class="cq-odds-risks">
              ${v.risks.map((r) => html`<li>${r}</li>`)}
            </ul>
          </div>
          <div class="cq-intr-why">
            <h4 class="cq-int-group">
              What makes the chance (${v.why.total} in 100)
            </h4>
            ${reasons(v.why, 10)}
          </div>`}
    <p class="cq-muted small cq-intr-note">
      Between grown people only, and never close kin. The door closes on the
      rest.
    </p>
    <div class="cq-btnrow end">
      ${action(
        html`${v.player
          ? "Make your interest plain"
          : "Set about it"}${sd.aim === "keep"
          ? price(cost, { per: "month", have: life.purse })
          : nothing}`,
        v.check,
        async () => {
          if (
            await ui.cmd({
              k: "intrigue",
              act: "seduce",
              c: cId,
              aim: sd.aim,
            })
          ) {
            ui.modal(null);
            ui.open({ k: "tab", tab: "society", sub: "intrigue" });
          }
        },
        "primary",
      )}
      <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
        Not now
      </button>
    </div>
  </div>`;
}

// ---- a plot

let pd: { key: string; method: PlotMethod } = { key: "", method: "poison" };

function plotModal(ui: GameUi, cId: number): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const c = s.chars[cId];
  if (!life || !ui.me || !c) return watching;
  const key = `${ui.modalSeq}|${cId}`;
  if (pd.key !== key) {
    const first = PLOT_METHOD_KEYS.find(
      (m) => plotCheck(s, ui.w, life, c, m).ok,
    );
    pd = { key, method: first ?? "poison" };
  }
  const v = plotView(s, ui.w, life, cId, pd.method);
  const def = PLOT_METHODS[pd.method];
  const found = 1 - (1 - v.odds.d) ** v.weeks;
  return html`<div class="cq-intr plot">
    ${whoHead(ui, c, "A plot", `Against ${charName(c)}`)}
    <div class="cq-intr-methods" role="radiogroup" aria-label="How">
      ${PLOT_METHOD_KEYS.map((m) => {
        const ck = plotCheck(s, ui.w, life, c, m);
        const cost = plotCost(s, c, m);
        const place = !ck.ok && /There's no|Nobody calls/.test(ck.why);
        return html`<button
          role="radio"
          aria-checked=${pd.method === m}
          class="cq-intr-method ${pd.method === m ? "on" : ""} ${place
            ? "dim"
            : ""}"
          title=${place && !ck.ok ? ck.why : PLOT_METHODS[m].text}
          @click=${() => {
            pd.method = m;
            ui.redraw();
          }}
        >
          <b>${PLOT_METHODS[m].label}</b>
          ${price(cost, { have: life.purse })}
          <span class="small"
            >${place && !ck.ok
              ? ck.why
              : `${PLOT_METHODS[m].weeks} weeks`}</span
          >
        </button>`;
      })}
    </div>
    <p class="cq-muted small">${def.text}</p>
    <div class="cq-odds-panel">
      <p class="cq-odds-head">
        <b>${v.weeks} weeks to ripen</b
        ><span
          >${v.player
            ? html`Found out on the way: <b>${chanceWords(found)}</b>`
            : html`Comes off: <b>${chanceWords(v.odds.p)}</b>; found out on the
                way: <b>${chanceWords(found)}</b>`}</span
        >
      </p>
      ${v.player
        ? html`<p class="small cq-intr-player">
            ${c.first} is another player's character, and is never simply
            killed. As it ripens they may hear something (<b
              >${chanceWords(v.warn ?? 0)}</b
            >
            a week, by their wits); they're always warned before the moment; and
            when it comes they get a scene and a chance to act (guards, a fight,
            flight, finding out who). If it goes against them, they carry on as
            their heir.
          </p>`
        : oddsRows(v.outcomes)}
      <ul class="cq-odds-risks">
        <li>
          <b>${pct(v.odds.d)}</b> a week it's found out before the moment:
          arrest, and a trial for conspiring to murder (hanging, or
          transportation).
        </li>
        <li>
          If it fails at the moment, traced to you
          <b>${chanceWords(v.odds.f)}</b>; if it comes off,
          <b>${chanceWords(v.odds.f / 2)}</b>. Either way the town talks.
        </li>
        <li>
          Foiled, ${c.first} is your enemy for life, and knows it was someone.
        </li>
      </ul>
    </div>
    <div class="cq-intr-why two">
      <div>
        <h4 class="cq-int-group">
          What makes it come off (${v.why.total} in 100)
        </h4>
        ${reasons(v.why, 9)}
      </div>
      <div>
        <h4 class="cq-int-group">What makes it found out</h4>
        <ul class="cq-why-list">
          ${v.findWhy.parts.map(
            (p) =>
              html`<li class=${p.value > 0 ? "bad" : p.value < 0 ? "good" : ""}>
                <span class="n"
                  >${p.value > 0 ? "+" : p.value < 0 ? "−" : ""}${pct(
                    Math.abs(p.value),
                  )}</span
                ><span>${p.label}</span>
              </li>`,
          )}
        </ul>
        <p class="cq-muted small">
          Accomplices (on the plot, once begun) make it likelier to come off,
          and to be found out.
        </p>
      </div>
    </div>
    <div class="cq-btnrow end">
      ${action(
        html`Set it going${price(v.cost, { have: life.purse })}`,
        v.check,
        async () => {
          if (
            confirm(
              `Set a plot going against ${charName(c)}: ${def.label.toLowerCase()}, for ${priceWords(v.cost)}? Murder is a hanging matter.`,
            ) &&
            (await ui.cmd({
              k: "intrigue",
              act: "plot",
              c: cId,
              method: pd.method,
            }))
          ) {
            ui.modal(null);
            ui.open({ k: "tab", tab: "society", sub: "intrigue" });
          }
        },
        "primary danger",
      )}
      <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
        Think better of it
      </button>
    </div>
  </div>`;
}

// ---- an accomplice

function recruitModal(ui: GameUi, id: number): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const x = schemeById(s, id);
  if (!life || !ui.me) return watching;
  if (!x || x.seat !== ui.seat || x.kind !== "plot")
    return html`<p class="cq-muted">No such plot.</p>`;
  const target = s.chars[x.target];
  const people = accompliceCandidates(s, life, x).slice(0, 14);
  return html`<div class="cq-intr">
    <h2 class="cq-h1">Draw someone in</h2>
    <p class="cq-muted small">
      Against ${charName(target)}: people here who think well of you. A grudge,
      debts or greed make them willing; honesty and fear of the rope don't. Each
      who joins makes it likelier to come off (+${PLOT.helper} in 100) and to be
      found out (+${pct(PLOT.helperFind)} a week). You pay only if they're in;
      one who says no may talk.
    </p>
    ${people.length
      ? html`<ul class="cq-intr-recruits">
          ${people.map((c) => {
            const r = recruitView(s, life, x, c.id);
            const will = r.will.total > 0;
            return html`<li>
              ${token(ui, c, "small")}
              <span>
                <b>${charLink(ui, c)}</b>
                <span class="cq-chip ${will ? "good" : "bad"} small"
                  >${will ? "likely in" : "likely no"}</span
                >
                ${reasons(r.will, 3)}
              </span>
              ${action(
                html`Ask ${c.first}${price(r.fee, { have: life.purse })}`,
                r.check,
                async () => {
                  if (
                    await ui.cmd({
                      k: "intrigue",
                      act: "recruit",
                      id,
                      c: c.id,
                    })
                  )
                    ui.redraw();
                },
                "small",
              )}
            </li>`;
          })}
        </ul>`
      : html`<p class="cq-empty">
          Nobody here thinks well enough of you to be asked.
        </p>`}
    <div class="cq-btnrow end">
      <button class="cq-btn quiet" @click=${() => ui.modal(null)}>Done</button>
    </div>
  </div>`;
}

// ---- the wedding

let wd: {
  key: string;
  rite: WeddingRite;
  tier: number;
  days: number;
  licence: boolean;
  guests: number[];
} = {
  key: "",
  rite: "church",
  tier: 1,
  days: BANNS_DAYS,
  licence: false,
  guests: [],
};

function weddingModal(ui: GameUi, id: number): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  const b = betrothalById(s, id);
  if (!life || !me) return watching;
  if (!b || (b.a !== me.id && b.b !== me.id))
    return html`<p class="cq-muted">No such promise.</p>`;
  const other = s.chars[betrothedTo(b, me.id)];
  const rites = ritesFor(s, life);
  const key = `${ui.modalSeq}|${id}`;
  if (wd.key !== key) {
    const rite =
      rites.find((r) => riteVenue(s, ui.w, life, r)) ?? rites[0] ?? "church";
    wd = {
      key,
      rite,
      tier: 1,
      days: RITES[rite].banns ? BANNS_DAYS : 7,
      licence: false,
      guests: [],
    };
  }
  const v = planView(s, ui.w, life, id, wd.rite, wd.tier, wd.days, wd.licence);
  const banns = RITES[wd.rite].banns;
  const can = invitables(s, ui.w, life).filter(
    (x) => x.c.id !== other?.id && x.c.id !== me.id,
  );
  wd.guests = wd.guests.filter((g) => can.some((x) => x.c.id === g));
  const set = (patch: Partial<typeof wd>) => {
    Object.assign(wd, patch);
    if (wd.days < v.soonest && !patch.days) wd.days = soonest();
    ui.redraw();
  };
  const soonest = () => (RITES[wd.rite].banns && !wd.licence ? BANNS_DAYS : 3);
  const toggle = (cid: number) => {
    const has = wd.guests.includes(cid);
    if (has) wd.guests = wd.guests.filter((x) => x !== cid);
    else if (wd.guests.length < v.maxGuests) wd.guests = [...wd.guests, cid];
    ui.redraw();
  };
  const where = ui.map.provinces[life.prov]?.name ?? "here";
  return html`<div class="cq-intr wedding">
    <header class="cq-intr-head">
      ${token(ui, me, "small")}${token(ui, other, "small")}
      <div>
        <p class="cq-kicker">A wedding</p>
        <h2 class="cq-h1">${me.first} and ${other?.first ?? "?"}</h2>
        <p class="cq-muted small">
          At ${where}. The vows, the dowry settled, a feast, the dancing and the
          toasts, played on the day; and whatever else happens. Both of you must
          be there.
        </p>
      </div>
    </header>
    <h4 class="cq-int-group">Where, and how</h4>
    <div class="cq-intr-rites" role="radiogroup" aria-label="The rite">
      ${rites.map((r) => {
        const venue = riteVenue(s, ui.w, life, r);
        return html`<button
          role="radio"
          aria-checked=${wd.rite === r}
          class="cq-intr-method ${wd.rite === r ? "on" : ""} ${venue
            ? ""
            : "dim"}"
          title=${RITES[r].text}
          @click=${() =>
            set({ rite: r, days: RITES[r].banns ? BANNS_DAYS : 7 })}
        >
          <b>${RITES[r].label}</b>
          <span class="small"
            >${venue
              ? RITES[r].text
              : RITES[r].venue === "home"
                ? "Only at your own home."
                : "There's no such place here."}</span
          >
        </button>`;
      })}
    </div>
    <h4 class="cq-int-group">How grand</h4>
    <div
      class="cq-seg big cq-intr-tiers"
      role="radiogroup"
      aria-label="How grand"
    >
      ${TIERS.map((t, i) => {
        const c = weddingPlanCost(s, life, v.venue ?? "church", i, false);
        return html`<button
          role="radio"
          aria-checked=${wd.tier === i}
          @click=${() => set({ tier: i })}
        >
          ${t.name}${c.feast ? price(c.feast) : nothing}<span
            >${t.feast ? `a feast; ` : ""}up to ${t.guests} asked</span
          >
        </button>`;
      })}
    </div>
    <h4 class="cq-int-group">The day</h4>
    <div class="cq-intr-day">
      <input
        type="range"
        min=${v.soonest}
        max="120"
        .value=${String(Math.max(v.soonest, wd.days))}
        aria-label="Days from now"
        @input=${(e: Event) =>
          set({
            days: Number((e.target as HTMLInputElement).value),
          })}
      />
      <span>In <b>${wd.days} days</b>: ${formatDate(s.day + wd.days)}</span>
      ${banns
        ? html`<label class="cq-intr-check">
            <input
              type="checkbox"
              .checked=${wd.licence}
              @change=${(e: Event) =>
                set({
                  licence: (e.target as HTMLInputElement).checked,
                  days: (e.target as HTMLInputElement).checked
                    ? Math.min(wd.days, 7)
                    : Math.max(wd.days, BANNS_DAYS),
                })}
            />
            A licence, to marry without waiting for the banns
            ${price(LICENCE, { have: life.purse })}
          </label>`
        : nothing}
      <p class="cq-muted small">
        ${banns
          ? wd.licence
            ? "By licence: as soon as three days."
            : "The banns are read on three Sundays first: three weeks at the soonest."
          : "The families need a few days to gather."}
      </p>
    </div>
    <h4 class="cq-int-group">
      Who's asked (${wd.guests.length} of ${v.maxGuests})
    </h4>
    ${can.length
      ? html`<ul class="cq-intr-guests">
          ${can.slice(0, 40).map(
            (x) =>
              html`<li>
                <label
                  class=${wd.guests.includes(x.c.id)
                    ? "on"
                    : wd.guests.length >= v.maxGuests
                      ? "dim"
                      : ""}
                >
                  <input
                    type="checkbox"
                    .checked=${wd.guests.includes(x.c.id)}
                    ?disabled=${!wd.guests.includes(x.c.id) &&
                    wd.guests.length >= v.maxGuests}
                    @change=${() => toggle(x.c.id)}
                  />
                  ${token(ui, x.c, "small")}
                  <span
                    ><b>${charName(x.c)}</b>
                    <span class="cq-muted small"
                      >${lifeOfChar(s, x.c.id)
                        ? "a player"
                        : x.near
                          ? "here"
                          : `${x.days} days away, by letter`}</span
                    ></span
                  >
                </label>
              </li>`,
          )}
        </ul>`
      : html`<p class="cq-muted small">Nobody to ask: just the two of you.</p>`}
    <div class="cq-intr-bill">
      <span>The minister's fee and the ring ${price(v.cost.fee)}</span>
      ${v.cost.feast
        ? html`<span>The feast ${price(v.cost.feast)}</span>`
        : nothing}
      ${v.cost.licence
        ? html`<span>A licence ${price(v.cost.licence)}</span>`
        : nothing}
    </div>
    <div class="cq-btnrow end">
      ${action(
        html`Set the day${price(v.cost.total, { have: life.purse })}`,
        v.check,
        async () => {
          if (
            await ui.cmd({
              k: "intrigue",
              act: "plan",
              id,
              rite: wd.rite,
              tier: wd.tier,
              days: wd.days,
              licence: wd.licence,
              list: wd.guests,
            })
          ) {
            play("seal");
            ui.modal(null);
            ui.open({ k: "tab", tab: "society", sub: "intrigue" });
          }
        },
        "primary",
      )}
      <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
        Not now
      </button>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- going to a gathering

const goHome = new Map<number, boolean>();

/** On an invitation: the journey there (and home), and other players going. */
export function journeyBlock(
  ui: GameUi,
  x: Gathering,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  if (!life || !me || x.host === me.id || x.status !== "planned")
    return nothing;
  const players = attendees(s, x)
    .filter((c) => c.id !== me.id && lifeOfChar(s, c.id))
    .map((c) => c);
  const others = players.length
    ? html`<p class="small cq-intr-players">
        Players going:
        ${players.map((c, i) =>
          i ? html`, ${charLink(ui, c, false)}` : charLink(ui, c, false),
        )}.
        You'll see each other there.
      </p>`
    : nothing;
  const a = life.attend?.g === x.id ? life.attend : null;
  const r = x.rsvp[me.id];
  if (a) {
    const where = ui.map.provinces[x.prov]?.name ?? "there";
    const line =
      a.stage === "wait"
        ? a.leave > s.day
          ? html`You'll set out for ${where} on
              <b>${formatDate(a.leave)}</b>${a.back
                ? ", and come home after"
                : ""}.`
          : html`You're setting out for ${where}.`
        : a.stage === "going"
          ? html`On your way to ${where}, for ${formatDate(x.day)}.`
          : a.stage === "there"
            ? html`You're at ${where} for
              it${a.back ? "; you'll go home when it's over" : ""}.`
            : html`On your way home.`;
    return html`<div class="cq-intr-journey">
      <p class="small">${line}</p>
      ${others}
      ${a.stage === "wait" || a.stage === "there"
        ? html`<div class="cq-btnrow">
            <button
              class="cq-btn quiet small"
              @click=${() => ui.cmd({ k: "intrigue", act: "stay" })}
            >
              ${a.stage === "wait" ? "Don't go after all" : "Don't come home"}
            </button>
          </div>`
        : nothing}
    </div>`;
  }
  if (r && !r.yes) return others;
  const back = goHome.get(x.id) ?? true;
  const v = journeyView(s, ui.w, life, x, back);
  if (v.here) return others;
  return html`<div class="cq-intr-journey">
    <p class="small">
      ${ui.map.provinces[x.prov]?.name} is <b>${v.days} days</b> away${v.sea
        ? ", by sea"
        : " by road"}.
      Go, and you'll set out in good time
      (${v.leave > s.day ? formatDate(v.leave) : "at once"}), with the road's
      adventures on the way.
    </p>
    ${others}
    <div class="cq-btnrow">
      ${action(
        html`${r ? "Set out for it" : "Accept, and go"}${price(v.fare, {
          have: life.purse,
          note: back ? "the fares there and home" : "the fare there",
        })}`,
        v.check,
        () => ui.cmd({ k: "intrigue", act: "attend", id: x.id, back }),
        r ? "small" : "primary small",
      )}
      <label class="cq-intr-check small">
        <input
          type="checkbox"
          .checked=${back}
          @change=${(e: Event) => {
            goHome.set(x.id, (e.target as HTMLInputElement).checked);
            ui.redraw();
          }}
        />
        Come home after
      </label>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- letters in your own words

/** Other players' characters, to write to. */
function playersToWrite(ui: GameUi, life: Life): Character[] {
  const s = ui.s;
  return s.lives
    .filter((l) => l.seat !== life.seat && l.c >= 0 && !l.watching)
    .map((l) => s.chars[l.c])
    .filter((c): c is Character => !!c?.alive && !c.abroad);
}

/** Whether there's another player to write to (for the letters page's button). */
export function canWritePersonal(ui: GameUi): boolean {
  const life = ui.life;
  return !!life && !life.watching && playersToWrite(ui, life).length > 0;
}

let ld: { key: string; to: number; subject: string; body: string } = {
  key: "",
  to: -1,
  subject: "",
  body: "",
};

function letterModal(ui: GameUi, cId?: number, re?: number): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  if (!life || !me) return watching;
  const people = playersToWrite(ui, life);
  const key = `${ui.modalSeq}`;
  if (ld.key !== key) {
    const answering =
      re !== undefined ? postOf(life).find((l) => l.id === re) : undefined;
    ld = {
      key,
      to: cId ?? people[0]?.id ?? -1,
      subject: answering?.subject
        ? `Re: ${answering.subject.replace(/^Re: /i, "")}`.slice(0, SUBJECT_MAX)
        : "",
      body: "",
    };
  }
  const to = s.chars[ld.to];
  const check = to
    ? noteCheck(s, ui.w, life, to.id, ld.subject, ld.body)
    : ({ ok: false, why: "Choose who to write to." } as const);
  const route = to ? postRoute(s, ui.map, life.prov, addressOf(s, to)) : null;
  const left = NOTE_MAX - [...ld.body].length;
  return html`<div class="cq-intr cq-intr-write">
    <h2 class="cq-h1">${QuillIcon()} A letter in your own words</h2>
    <p class="cq-muted small">
      To another player's character, by the post: it takes as long as the road
      or the sea, and a ship can be lost. Only they will ever read it.
    </p>
    <label class="cq-field">
      <span>To</span>
      <select
        @change=${(e: Event) => {
          ld.to = Number((e.target as HTMLSelectElement).value);
          ui.redraw();
        }}
      >
        ${people.length
          ? people.map(
              (c) =>
                html`<option value=${c.id} ?selected=${c.id === ld.to}>
                  ${charName(c)}, played by ${lifeOfChar(s, c.id)?.name ?? "?"}
                  (${ui.map.provinces[addressOf(s, c)]?.name ?? ""})
                </option>`,
            )
          : html`<option value="-1">No other players</option>`}
      </select>
    </label>
    <div class="cq-intr-paper">
      <p class="cq-intr-paper-date">
        ${ui.map.provinces[life.prov]?.name}, ${formatDate(s.day)}
      </p>
      <input
        class="cq-intr-subject"
        type="text"
        maxlength=${SUBJECT_MAX}
        placeholder="A subject, if you like"
        .value=${ld.subject}
        @input=${(e: Event) => {
          ld.subject = (e.target as HTMLInputElement).value;
          ui.redraw();
        }}
      />
      <textarea
        class="cq-intr-body"
        maxlength=${NOTE_MAX}
        rows="9"
        placeholder=${to ? `Dear ${to.first},` : "Your letter"}
        .value=${ld.body}
        @input=${(e: Event) => {
          ld.body = (e.target as HTMLTextAreaElement).value;
          ui.redraw();
        }}
      ></textarea>
      <p class="cq-intr-paper-sign">${charName(me)}</p>
      <span class="cq-intr-count ${left < 100 ? "low" : ""}">${left} left</span>
    </div>
    ${route && to
      ? html`<p class="small cq-desk-route">
          To ${ui.map.provinces[addressOf(s, to)]?.name}: about
          <b>${route.days} day${route.days === 1 ? "" : "s"}</b>${route.sea
            ? html`, by ship (${pct(route.risk)} chance it's lost)`
            : html` by rider`}.
        </p>`
      : nothing}
    <div class="cq-btnrow end">
      ${action(
        html`Seal and
        send${route
          ? price(route.cost, { have: life.purse, note: "the postage" })
          : nothing}`,
        check,
        async () => {
          if (
            await ui.cmd({
              k: "intrigue",
              act: "write",
              c: ld.to,
              subject: ld.subject,
              body: ld.body,
              ...(re !== undefined ? { re } : {}),
            })
          ) {
            play("seal");
            ui.toast(`Your letter to ${charName(to)} is on its way.`, "good");
            ld = { key: "", to: -1, subject: "", body: "" };
            ui.modal(null);
            ui.open({ k: "letters" });
          }
        },
        "primary",
      )}
      <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
        Not now
      </button>
    </div>
  </div>`;
}

/** A letter in someone's own words, read on letter paper. */
function readModal(ui: GameUi, id: number): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  if (!life) return watching;
  const l = postOf(life).find((x) => x.id === id && x.kind === "personal");
  if (!l) return html`<p class="cq-muted">No such letter.</p>`;
  const mine = l.from === life.c;
  const from = s.chars[l.from];
  const to = s.chars[l.to];
  const canReply = !mine && from?.alive && !!lifeOfChar(s, from.id);
  return html`<div class="cq-intr cq-intr-read">
    <div class="cq-intr-paper read">
      <p class="cq-intr-paper-date">
        ${ui.map.provinces[l.origin]?.name}, ${formatDate(l.sent)}
      </p>
      ${l.subject
        ? html`<p class="cq-intr-paper-subject">${l.subject}</p>`
        : nothing}
      <p class="cq-intr-paper-to">To ${charName(to)},</p>
      <div class="cq-intr-paper-text">${curly(l.text)}</div>
      <p class="cq-intr-paper-sign">${charName(from)}</p>
    </div>
    <div class="cq-btnrow end">
      ${canReply
        ? html`<button
            class="cq-btn primary"
            @click=${() =>
              ui.modal({
                k: "intrigue",
                what: "letter",
                c: from!.id,
                id: l.id,
              })}
          >
            ${QuillIcon()} Write back
          </button>`
        : nothing}
      <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
        Fold it away
      </button>
    </div>
  </div>`;
}

/** A letter in someone's own words, in the letter case: its first lines, and how to read it. */
export function personalSnippet(ui: GameUi, l: Letter): TemplateResult {
  const life = ui.life!;
  const mine = l.from === life.c;
  const text = [...l.text];
  const short = text.length > 260 ? `${text.slice(0, 240).join("")}…` : l.text;
  const other = ui.s.chars[mine ? l.to : l.from];
  return html`${l.subject
      ? html`<p class="cq-intr-snip-subject">${l.subject}</p>`
      : nothing}
    <p class="cq-post-text cq-intr-snip">${curly(short)}</p>
    <div class="cq-btnrow">
      <button
        class="cq-btn small"
        @click=${() => ui.modal({ k: "intrigue", what: "read", id: l.id })}
      >
        Read it
      </button>
      ${!mine && other?.alive && lifeOfChar(ui.s, other.id)
        ? html`<button
            class="cq-btn quiet small"
            @click=${() =>
              ui.modal({
                k: "intrigue",
                what: "letter",
                c: other.id,
                id: l.id,
              })}
          >
            Write back
          </button>`
        : nothing}
    </div>`;
}
