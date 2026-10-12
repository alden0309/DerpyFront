// DICE (r14): Liar's dice at the tavern table, in the browser. Opening a
// table (the stake, and who you ask: each with whether they'll sit down and
// why); the table itself over the painted tavern, the others seated round
// it with their cups and their last word, your own dice large under your
// raised cup, the bid standing, the round so far, and the bid picker (only
// legal raises, with how likely your bid is from what you can see), Raise
// and Liar!; the cups lifted at a call, the dice that count lit, the tally
// against the bid and the die taken away; and the end of the table.
//
// What the server sends is the game as it stands; the moves since are
// played back one by one, the computer players' at a reading pace, so a
// round reads like play. Nothing here waits on the server's clock.

import { html, nothing, svg, TemplateResult } from "lit";
import { presentAt } from "../../engine/Areas";
import { formatDate } from "../../engine/Calendar";
import { joinProblem, openProblem } from "../../engine/Dice";
import { canAsk, sitAcceptance } from "../../engine/DiceAi";
import {
  bidChance,
  bidWords,
  chanceWord,
  countFace,
  DICE_EACH,
  faceName,
  FACES,
  MAX_SEATS,
  MIN_SEATS,
  numberWord,
  seatedAt,
  seatOf,
  STAKES,
  STALL_SECONDS,
  tableAt,
  tableById,
  totalDice,
} from "../../engine/DiceCore";
import { lifeOfChar } from "../../engine/LifeQueries";
import { ageOf, charName } from "../../engine/Queries";
import type {
  Character,
  DiceAct,
  DiceBid,
  DiceSeat,
  DiceTable,
  PlaceKind,
} from "../../engine/Types";
import { portrait } from "../Portrait";
import { sceneArt } from "../SceneArt";
import { play, playDice } from "../Sound";
import { num } from "../Tip";
import { breakdownTip, type GameUi, token } from "./Context";
import { roleOf } from "./Here";
import type { PlacePart } from "./Livelihood";
import { curly, reasons } from "./Scene";
import { term } from "./Terms";

type Mood = NonNullable<DiceAct["mood"]>;

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const reduced = () =>
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- the dice, drawn

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [29, 29],
    [71, 71],
  ],
  3: [
    [27, 27],
    [50, 50],
    [73, 73],
  ],
  4: [
    [29, 29],
    [71, 29],
    [29, 71],
    [71, 71],
  ],
  5: [
    [27, 27],
    [73, 27],
    [50, 50],
    [27, 73],
    [73, 73],
  ],
  6: [
    [29, 25],
    [71, 25],
    [29, 50],
    [71, 50],
    [29, 75],
    [71, 75],
  ],
};

/** A bone die: ivory, black pips; a one (wild) has a red pip. */
export function die(face: number, cls = ""): TemplateResult {
  const wild = face === 1;
  return html`<svg
    class="cq-die ${wild ? "wild" : ""} ${cls}"
    viewBox="0 0 100 100"
    role="img"
    aria-label=${wild ? "a one (wild)" : `a ${faceName(face, false)}`}
  >
    <rect class="cq-die-body" x="5" y="5" width="90" height="90" rx="17" />
    <rect class="cq-die-shine" x="11" y="10" width="78" height="30" rx="12" />
    ${(PIPS[face] ?? []).map(
      ([x, y]) =>
        svg`<circle class="cq-die-pip" cx=${x} cy=${y} r=${wild ? 13 : 9.5} />`,
    )}
  </svg>`;
}

/** A leather dice cup: on the board, raised (your own), or lifting at a call. */
function cupArt(how: "" | "up" | "lift"): TemplateResult {
  return html`<svg
    class="cq-dice-cupart ${how}"
    viewBox="0 0 60 56"
    aria-hidden="true"
  >
    <path
      d="M10 6 H50 L45 50 Q30 55 15 50 Z"
      fill="url(#cq-leather)"
      stroke="#1f120a"
      stroke-width="2"
    />
    <path
      d="M8 4 H52 V10 H8 Z"
      fill="#6b4524"
      stroke="#1f120a"
      stroke-width="1.6"
    />
    <path
      d="M16 20 Q30 24 44 20"
      stroke="#c99b3a"
      stroke-width="1.4"
      fill="none"
      opacity=".7"
    />
    <path
      d="M17 36 Q30 40 43 36"
      stroke="#c99b3a"
      stroke-width="1.4"
      fill="none"
      opacity=".55"
    />
  </svg>`;
}

/** The leather's gradient, defined once in the page. */
const DEFS = html`<svg
  width="0"
  height="0"
  style="position:absolute"
  aria-hidden="true"
>
  <defs>
    <linearGradient id="cq-leather" x1="0" x2="1">
      <stop offset="0" stop-color="#3b2312" />
      <stop offset="0.45" stop-color="#7a4d27" />
      <stop offset="1" stop-color="#2c190c" />
    </linearGradient>
  </defs>
</svg>`;

/** How many dice someone has left, as pips: filled for theirs, hollow for those lost. */
function pips(n: number): TemplateResult {
  return html`<span
    class="cq-dice-pips"
    aria-label="${n} of ${DICE_EACH} dice left"
    >${Array.from(
      { length: DICE_EACH },
      (_, i) => html`<i class=${i < n ? "on" : ""}></i>`,
    )}</span
  >`;
}

// ---------------------------------------------------------------- playing back

/** How far each table has been played back on this screen. */
const shown = new Map<number, { n: number; timer: number; seq: number }>();
/** Whose turn the server is timing, and when the table moves for them. */
const clocks = new Map<number, { c: number; until: number }>();
let ticker = 0;

/** The server's word on a player's turn at a table (and how long they have). */
export function onDiceClock(m: { id: number; c: number; left: number }): void {
  clocks.set(m.id, { c: m.c, until: performance.now() + m.left * 1000 });
}

/** Seconds a player has left on their turn at a table, if it's being timed. */
function clockLeft(t: DiceTable, c: number): number | null {
  const k = clocks.get(t.id);
  if (!k || k.c !== c) return null;
  return Math.max(0, Math.ceil((k.until - performance.now()) / 1000));
}

const clockText = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function isComputer(t: DiceTable, c: number): boolean {
  return seatOf(t, c)?.seat === undefined;
}

/** The pause before a move is shown: the computer players at a reading pace. */
function delayOf(
  t: DiceTable,
  a: DiceAct,
  prev: DiceAct | undefined,
  me: number,
): number {
  switch (a.k) {
    case "bid":
    case "liar":
      return a.c === me && !a.auto
        ? 0
        : isComputer(t, a.c)
          ? 600 + ((a.n * 137) % 600)
          : 350;
    case "reveal":
      return 900;
    case "out":
      return 1500;
    case "gone":
    case "void":
      return prev?.k === "reveal" ? 1300 : 500;
    case "roll":
      return !prev || prev.k === "sit"
        ? 250
        : prev.k === "reveal"
          ? 2600
          : 1200;
    case "win":
      return prev?.k === "reveal" ? 2200 : 1200;
    default:
      return 0;
  }
}

function cue(a: DiceAct, me: number): void {
  if (a.k === "roll") playDice("rattle");
  else if (a.k === "reveal") playDice("lift");
  else if (a.k === "win") play(a.c === me ? "coins" : "paper");
}

/**
 * The move up to which a table is shown, catching up with what the server
 * has sent at a reading pace. A table looked at afresh starts as it stands.
 */
function showing(ui: GameUi, t: DiceTable): number {
  const last = t.acts[t.acts.length - 1]?.n ?? 0;
  let pb = shown.get(t.id);
  if (!pb || pb.seq !== ui.modalSeq) {
    if (pb?.timer) clearTimeout(pb.timer);
    pb = { n: last, timer: 0, seq: ui.modalSeq };
    shown.set(t.id, pb);
  }
  const me = ui.life?.c ?? -1;
  // Your own moves show at once.
  for (;;) {
    const next = t.acts.find((a) => a.n > pb.n);
    if (!next || pb.timer) break;
    const prev = t.acts.find((a) => a.n === pb.n);
    const wait = delayOf(t, next, prev, me);
    if (wait <= 0) {
      pb.n = next.n;
      cue(next, me);
      continue;
    }
    const p = pb;
    pb.timer = window.setTimeout(() => {
      p.timer = 0;
      p.n = next.n;
      cue(next, me);
      ui.redraw();
    }, wait);
    break;
  }
  return pb.n;
}

/** Keep the clocks ticking on screen while a table is open. */
function keepTicking(ui: GameUi): void {
  if (ticker) return;
  ticker = window.setInterval(() => {
    if (!document.querySelector(".cq-dice")) {
      clearInterval(ticker);
      ticker = 0;
      return;
    }
    if (clocks.size) ui.redraw();
  }, 1000);
}

/** A table as it stood at a move: the round, the bid, whose turn, the cups. */
interface View {
  round: number;
  bid: DiceBid | null;
  by: number;
  turn: number;
  counts: Map<number, number>;
  state: Map<number, DiceSeat["state"]>;
  /** This round's bids and the call, in order. */
  history: DiceAct[];
  /** The cups lifted (until the next roll). */
  reveal: DiceAct | null;
  /** Each one's last word this round. */
  said: Map<number, DiceAct>;
  won: DiceAct | null;
  roll: DiceAct | null;
  last: DiceAct | undefined;
}

function viewAt(t: DiceTable, upTo: number): View {
  const acts = t.acts.filter((a) => a.n <= upTo);
  const v: View = {
    round: 0,
    bid: null,
    by: -1,
    turn: t.seats[t.turn]?.c ?? -1,
    counts: new Map(),
    state: new Map(),
    history: [],
    reveal: null,
    said: new Map(),
    won: null,
    roll: null,
    last: acts[acts.length - 1],
  };
  for (const x of t.seats) {
    v.state.set(x.c, "in");
    v.counts.set(x.c, DICE_EACH);
  }
  // Seats as they stood: those out or gone by then.
  for (const a of acts) {
    if (a.k === "out") v.state.set(a.c, "out");
    if (a.k === "gone") v.state.set(a.c, "gone");
    if (a.turn !== undefined) v.turn = a.turn;
  }
  let ri = -1;
  for (let i = acts.length - 1; i >= 0; i--)
    if (acts[i].k === "roll") {
      ri = i;
      break;
    }
  // Before the first roll: everyone with all their dice.
  if (ri < 0) return v;
  const roll = acts[ri];
  v.roll = roll;
  v.round = roll.round;
  for (const [c, n] of Object.entries(roll.ns ?? {}))
    v.counts.set(Number(c), n);
  for (const a of acts.slice(ri + 1)) {
    if (a.k === "bid") {
      v.bid = a.bid ?? null;
      v.by = a.c;
      v.history.push(a);
      v.said.set(a.c, a);
    } else if (a.k === "liar") {
      v.history.push(a);
      v.said.set(a.c, a);
    } else if (a.k === "reveal") {
      v.reveal = a;
      if (a.loser !== undefined)
        v.counts.set(a.loser, (v.counts.get(a.loser) ?? 1) - 1);
    } else if (a.k === "win") v.won = a;
  }
  return v;
}

/** Who speaks as the cups come up: a computer player who lost, or won the call. */
function revealSpeaker(t: DiceTable, r: DiceAct): number {
  if (r.loser !== undefined && isComputer(t, r.loser)) return r.loser;
  const other = r.loser === r.c ? r.bidder : r.c;
  return other !== undefined && isComputer(t, other) ? other : -1;
}

/** What someone said (a computer player's line, or a player's bid in words). */
function sayOf(a: DiceAct): string {
  if (a.say) return a.say;
  if (a.k === "liar") return "Liar!";
  if (a.bid) return `${cap(bidWords(a.bid))}.`;
  return "";
}

// ---------------------------------------------------------------- the table

/** The table where you are (yours, or the game in this tavern). */
export function tableHere(ui: GameUi): DiceTable | undefined {
  const life = ui.life;
  if (!life) return undefined;
  return seatedAt(ui.s, life.c) ?? tableAt(ui.s, life.prov);
}

function mySeat(ui: GameUi, t: DiceTable): DiceSeat | undefined {
  const life = ui.life;
  return life
    ? t.seats.find((x) => x.c === life.c && x.seat === ui.seat)
    : undefined;
}

/** A seat round the table: the sitter, their cup, their last word. */
function seatView(
  ui: GameUi,
  t: DiceTable,
  x: DiceSeat,
  v: View,
  side: "left" | "right",
  me: boolean,
): TemplateResult {
  const s = ui.s;
  const c = s.chars[x.c];
  if (!c) return html``;
  const st = v.state.get(x.c) ?? x.state;
  const n = v.counts.get(x.c) ?? x.n;
  const playing = t.status === "playing" || (!!v.roll && !v.won);
  const turn = playing && !v.reveal && !v.won && v.turn === x.c && st === "in";
  const said = v.said.get(x.c);
  const r = v.reveal;
  const speaks = r && revealSpeaker(t, r) === x.c;
  const line = speaks ? r!.say : said ? sayOf(said) : "";
  let mood: Mood = said?.mood ?? "neutral";
  if (r && r.loser === x.c) mood = "worried";
  else if (speaks) mood = r!.mood ?? "smile";
  if (v.won) mood = v.won.c === x.c ? "smile" : "neutral";
  const n0 = s.nations[c.nation];
  const cups = r?.cups?.[x.c];
  const bid = r?.bid;
  const left = turn ? clockLeft(t, x.c) : null;
  return html`<div
    class="cq-dice-seat ${st} ${turn ? "turn" : ""} ${me
      ? "me"
      : ""} ${x.seat !== undefined ? "player" : ""}"
    style=${x.seat !== undefined && lifeOfChar(s, x.c)
      ? `--frame:${lifeOfChar(s, x.c)!.frame}`
      : ""}
  >
    <div class="cq-dice-say">
      ${line
        ? html`<span
            class="cq-dice-bubble ${said?.k === "liar" && !speaks
              ? "liar"
              : ""}"
            >${curly(line)}</span
          >`
        : nothing}
    </div>
    <div class="cq-dice-sitter">
      ${portrait(
        c,
        {
          age: ageOf(s, c),
          color: n0?.color ?? "#6b4f33",
          native: n0?.kind === "native" || c.religion === "native",
          facing: side === "left" ? "right" : "left",
          expression: mood,
          size: "l",
        },
        "cq-dice-face",
      )}
      ${turn
        ? html`<span class="cq-dice-turn"
            >${me ? "your turn" : "to bid"}${left !== null
              ? html` · <b>${clockText(left)}</b>`
              : nothing}</span
          >`
        : st === "out"
          ? html`<span class="cq-dice-turn out">out</span>`
          : st === "gone"
            ? html`<span class="cq-dice-turn out">gone</span>`
            : nothing}
    </div>
    <span class="cq-nameplate">
      <b>${me ? "You" : c.first}</b>
      <small
        >${x.seat !== undefined && !me
          ? "a player"
          : me
            ? charName(c)
            : roleOf(ui, c)}</small
      >
    </span>
    <div class="cq-dice-spot">
      ${cups && bid
        ? html`${cupArt("lift")}<span class="cq-dice-shown"
              >${[...cups]
                .sort((a, b) => a - b)
                .map((d) =>
                  die(d, d === bid.f || d === 1 ? "hit" : "miss"),
                )}</span
            >`
        : html`${cupArt("")}${pips(st === "in" ? n : 0)}`}
    </div>
  </div>`;
}

/** The bid standing, large, in the middle of the board (or the tally at a call). */
function boardView(
  ui: GameUi,
  t: DiceTable,
  v: View,
  me: number,
): TemplateResult {
  const s = ui.s;
  const who = (c: number) => (c === me ? "you" : (s.chars[c]?.first ?? "?"));
  if (v.won) {
    const w = v.won.c;
    return html`<div class="cq-dice-board-line won">
      <span class="cq-dice-tally"
        >${w === me ? "You take" : `${s.chars[w]?.first} takes`} the pot</span
      >
      <span class="cq-dice-sub">${t.pot} coins</span>
    </div>`;
  }
  if (t.status === "open")
    return html`<div class="cq-dice-board-line">
      <span class="cq-dice-tally">Liar's dice</span>
      <span class="cq-dice-sub"
        >${t.stake} coins a seat · ${MIN_SEATS} to ${MAX_SEATS} players</span
      >
    </div>`;
  const r = v.reveal;
  if (r && r.bid) {
    const stands = (r.count ?? 0) >= r.bid.q;
    const wild = Object.values(r.cups ?? {})
      .flat()
      .filter((d) => d === 1).length;
    return html`<div
      class="cq-dice-board-line reveal ${stands ? "stands" : "falls"}"
    >
      <span class="cq-dice-tally"
        >${cap(bidWords(r.bid))}?
        <b>${numberWord(r.count ?? 0)}</b> showing</span
      >
      <span class="cq-dice-sub"
        >${wild ? `${numberWord(wild)} of them wild · ` : ""}${stands
          ? "the bid stands"
          : "a lie"}:
        ${r.loser === me ? "you lose" : `${who(r.loser ?? -1)} loses`} a
        die</span
      >
    </div>`;
  }
  if (!v.bid)
    return html`<div class="cq-dice-board-line">
      <span class="cq-dice-tally"
        >${v.turn === me ? "You open" : `${who(v.turn)} opens`} the round</span
      >
      <span class="cq-dice-sub"
        >Round ${v.round} · ${totalCount(v)} dice under the cups</span
      >
    </div>`;
  return html`<div class="cq-dice-board-line bid">
    <span class="cq-dice-bidbig"
      ><b>${v.bid.q}</b><i>×</i>${die(v.bid.f, "big")}</span
    >
    <span class="cq-dice-sub"
      >${bidWords(v.bid)}, bid by ${who(v.by)} · ${totalCount(v)} dice under the
      cups</span
    >
  </div>`;
}

function totalCount(v: View): number {
  let n = 0;
  for (const [c, k] of v.counts) if (v.state.get(c) === "in") n += k;
  return n;
}

/** The stage: the tavern painted behind, the others round the board. */
function stageView(
  ui: GameUi,
  t: DiceTable,
  v: View,
  others: DiceSeat[],
  me: number,
): TemplateResult {
  const art = sceneArt("tavern");
  const half = Math.ceil(others.length / 2);
  return html`<div class="cq-dice-stage indoors">
    <div
      class="cq-scene-bg"
      style=${art ? `background-image:url(${art})` : ""}
    ></div>
    <div class="cq-scene-light"></div>
    <p class="cq-scene-where">
      The tavern, ${ui.map.provinces[t.prov]?.name ?? ""}<span>
        · ${formatDate(ui.s.day)}</span
      >
    </p>
    <div class="cq-dice-ring n${others.length}">
      ${others.map((x, i) =>
        seatView(ui, t, x, v, i < half ? "left" : "right", x.c === me),
      )}
    </div>
    ${lastLine(ui, t, v, me)}
    <div class="cq-dice-board">
      <div class="cq-dice-pot" title="The pot: everyone's stake">
        ${coins(t.pot)}
        <span>${term("dicepot", html`Pot <b>${t.pot}</b>`)}</span>
      </div>
      ${boardView(ui, t, v, me)}
    </div>
  </div>`;
}

/** The last word said at the table, in one line (shown on a phone's narrow table). */
function lastLine(
  ui: GameUi,
  t: DiceTable,
  v: View,
  me: number,
): TemplateResult {
  const r = v.reveal;
  const who = r ? revealSpeaker(t, r) : -1;
  const a = r && who >= 0 ? null : v.history[v.history.length - 1];
  const c = r && who >= 0 ? who : (a?.c ?? -1);
  const text = r && who >= 0 ? (r.say ?? "") : a ? sayOf(a) : "";
  return html`<p class="cq-dice-lastline" aria-live="polite">
    ${text
      ? html`<b>${c === me ? "You" : (ui.s.chars[c]?.first ?? "")}:</b> ${curly(
            `"${text}"`,
          )}`
      : html`&nbsp;`}
  </p>`;
}

/** A little pile of coins for the pot. */
function coins(n: number): TemplateResult {
  const k = Math.max(1, Math.min(6, Math.round(Math.sqrt(n))));
  return html`<svg class="cq-dice-coins" viewBox="0 0 44 40" aria-hidden="true">
    ${Array.from(
      { length: k },
      (_, i) =>
        svg`<ellipse cx=${14 + (i % 3) * 8} cy=${32 - Math.floor(i / 3) * 7 - (i % 2) * 2} rx="9" ry="4.2" fill="#d9b45a" stroke="#7a5418" stroke-width="1.4" />`,
    )}
  </svg>`;
}

// ---------------------------------------------------------------- your cup, the picker

let draft: { key: string; q: number; f: number } | null = null;

/** Your dice, large, under your raised cup; the faces you could read; the round so far. */
function mineView(
  ui: GameUi,
  t: DiceTable,
  v: View,
  x: DiceSeat | undefined,
  me: number,
): TemplateResult {
  if (!x)
    return html`<section class="cq-dice-mine watching">
      <h3 class="cq-dice-h">Watching</h3>
      <p class="cq-muted">
        The dice are under their cups: you'll see them when someone calls.
      </p>
      ${historyView(ui, t, v, me)}
    </section>`;
  const st = v.state.get(x.c) ?? x.state;
  // The dice of the round being shown: now, or (catching up) as revealed.
  const later = t.acts.find(
    (a) => a.k === "reveal" && a.round === v.round && a.cups,
  );
  const dice =
    v.reveal?.cups?.[me] ??
    (v.round === t.round ? x.dice : (later?.cups?.[me] ?? x.dice));
  const r = v.reveal;
  const tell = [...t.tells]
    .filter((tl) => tl.to === me && v.history.some((h) => h.n === tl.n) && !r)
    .pop();
  return html`<section class="cq-dice-mine">
    <h3 class="cq-dice-h">
      Your cup
      <span class="cq-muted small"
        >${st === "in"
          ? `${dice.length} ${dice.length === 1 ? "die" : "dice"}`
          : st === "out"
            ? "out of dice"
            : "away from the table"}</span
      >
    </h3>
    <div class="cq-dice-yours">
      ${cupArt("up")}
      <div class="cq-dice-row">
        ${st === "in" && dice.length
          ? [...dice]
              .sort((a, b) => a - b)
              .map((d) =>
                die(
                  d,
                  r?.bid ? (d === r.bid.f || d === 1 ? "hit" : "miss") : "",
                ),
              )
          : html`<p class="cq-muted small">
              ${st === "out"
                ? "Your last die is gone. Watch the rest, or get up."
                : t.status === "open"
                  ? "The dice are rolled when the table begins."
                  : "No dice."}
            </p>`}
      </div>
      <p class="cq-dice-wild small">
        ${term("dicewild", "Ones are wild")}: they count as any face.
      </p>
    </div>
    <div class="cq-dice-tell ${tell ? "on" : ""}" aria-live="polite">
      ${tell ? html`<p>${curly(tell.text)}</p>` : nothing}
    </div>
    ${historyView(ui, t, v, me)}
  </section>`;
}

/** The round so far: each bid, and the call. */
function historyView(
  ui: GameUi,
  t: DiceTable,
  v: View,
  me: number,
): TemplateResult {
  const s = ui.s;
  const rows = v.history.slice(-7);
  return html`<div class="cq-dice-history">
    <h4 class="cq-dice-h small">
      ${v.round ? `Round ${v.round}` : "Before the first roll"}
    </h4>
    <ol>
      ${rows.length
        ? rows.map(
            (a) =>
              html`<li class=${a.k === "liar" ? "liar" : ""}>
                <span class="who"
                  >${a.c === me ? "You" : (s.chars[a.c]?.first ?? "?")}</span
                >
                <span class="what"
                  >${a.k === "liar"
                    ? "Liar!"
                    : a.bid
                      ? bidWords(a.bid)
                      : ""}${a.auto
                    ? html` <i>(made for them)</i>`
                    : nothing}</span
                >
              </li>`,
          )
        : html`<li class="blank">No bids yet.</li>`}
    </ol>
  </div>`;
}

/** The legal raises, and the quantity a face must at least be bid at. */
function minQ(cur: DiceBid | null, f: number): number {
  if (!cur) return 1;
  return f > cur.f ? cur.q : cur.q + 1;
}

/** The picker: quantity and face (only legal raises), the odds, Raise and Liar! */
function pickerView(
  ui: GameUi,
  t: DiceTable,
  v: View,
  x: DiceSeat | undefined,
  me: number,
  caught: boolean,
): TemplateResult {
  const total = totalCount(v) || totalDice(t);
  const myTurn =
    !!x &&
    caught &&
    t.status === "playing" &&
    x.state === "in" &&
    t.seats[t.turn]?.c === me &&
    !v.reveal;
  const cur = v.bid;
  const dice = x?.dice ?? [];
  const hidden = Math.max(0, total - dice.length);
  // The bid being made: kept while it's your turn, reset when the bid moves on.
  const key = `${t.id}:${t.round}:${cur ? `${cur.q}.${cur.f}` : "-"}`;
  if (!draft || draft.key !== key) {
    let f = 6;
    let most = -1;
    for (const k of FACES) {
      const n = countFace(dice, k);
      if (n > most || (n === most && cur && k > cur.f)) {
        most = n;
        f = k;
      }
    }
    let q = Math.max(minQ(cur, f), cur ? 0 : Math.max(1, most));
    q = Math.min(q, Math.max(1, total));
    draft = { key, q, f };
  }
  const d = draft;
  const lo = minQ(cur, d.f);
  if (d.q < lo) d.q = lo;
  const legal = d.q <= total && d.q >= lo;
  const b = { q: d.q, f: d.f };
  const p = dice.length ? bidChance(dice, hidden, b) : 0;
  const curP = cur && dice.length ? bidChance(dice, hidden, cur) : null;
  const disabled = !myTurn;
  const set = (q: number, f: number) => {
    draft = { key, q, f };
    ui.redraw();
  };
  const raise = async () => {
    if (!legal) return;
    await ui.cmd({ k: "dice", act: "bid", id: t.id, q: d.q, f: d.f });
  };
  const liar = async () => {
    await ui.cmd({ k: "dice", act: "liar", id: t.id });
  };
  const turnC = v.turn;
  const left = clockLeft(t, turnC);
  const status = !x
    ? "You're watching."
    : x.state !== "in"
      ? x.state === "out"
        ? "You're out of dice."
        : "You've left the table."
      : v.reveal
        ? "The cups are up."
        : myTurn
          ? cur
            ? "Your turn: raise the bid, or call it a lie."
            : "Your turn: open the round with any bid."
          : !caught
            ? "…"
            : `${ui.s.chars[turnC]?.first ?? "Someone"} to bid${left !== null ? ` · ${clockText(left)}` : ""}…`;
  return html`<section class="cq-dice-play ${disabled ? "idle" : "live"}">
    <h3 class="cq-dice-h">Your bid</h3>
    <div class="cq-dice-pick" role="group" aria-label="Your bid">
      <div class="cq-dice-qty">
        <button
          class="cq-dice-step"
          aria-label="One fewer"
          ?disabled=${disabled || d.q - 1 < lo}
          @click=${() => set(d.q - 1, d.f)}
        >
          −
        </button>
        <span class="cq-dice-q" aria-live="polite"><b>${d.q}</b></span>
        <button
          class="cq-dice-step"
          aria-label="One more"
          ?disabled=${disabled || d.q + 1 > total}
          @click=${() => set(d.q + 1, d.f)}
        >
          +
        </button>
        <span class="cq-dice-times">×</span>
      </div>
      <div class="cq-dice-faces">
        ${FACES.map((f) => {
          const ok = d.q >= minQ(cur, f);
          return html`<button
            class="cq-dice-face ${f === d.f ? "on" : ""}"
            aria-pressed=${f === d.f}
            aria-label=${faceName(f, true)}
            ?disabled=${disabled || !ok}
            title=${ok ? "" : `Bid more than ${cur ? bidWords(cur) : ""} first`}
            @click=${() => set(d.q, f)}
          >
            ${die(f)}
          </button>`;
        })}
      </div>
    </div>
    <div class="cq-dice-odds ${disabled ? "dim" : ""}">
      ${dice.length
        ? html`<span class="cq-dice-odds-bid">${cap(bidWords(b))}:</span>
            ${num(
              chanceWord(p),
              () => ({
                title: "How likely, from what you see",
                notes: [
                  `You hold ${countFace(dice, b.f)} that count (${faceName(b.f, true)} and wild ones). There are ${hidden} dice you can't see; about a third of them count for any face: ${Math.round((hidden / 3) * 10) / 10}.`,
                  `So ${bidWords(b)} is ${chanceWord(p)} (${Math.round(p * 100)} in a hundred). A learning aid, not a promise: the others' bids tell you something too.`,
                ],
              }),
              `cq-dice-chance ${p >= 0.55 ? "good" : p < 0.25 ? "bad" : ""}`,
            )}
            <span class="cq-dice-bar"
              ><i style="width:${Math.round(p * 100)}%"></i
            ></span>`
        : html`<span class="cq-muted small">No dice under your cup.</span>`}
    </div>
    <div class="cq-dice-odds sub ${cur && curP !== null ? "" : "blank"}">
      ${cur && curP !== null
        ? html`The bid standing, ${bidWords(cur)}:
            <b class=${curP >= 0.55 ? "good" : curP < 0.25 ? "bad" : ""}
              >${chanceWord(curP)}</b
            >
            from where you sit.`
        : html`&nbsp;`}
    </div>
    <div class="cq-dice-acts">
      <button
        class="cq-btn primary cq-dice-raise"
        ?disabled=${disabled || !legal}
        @click=${raise}
      >
        ${cur ? "Raise" : "Bid"}:
        <span>${bidWords(b)}</span>
      </button>
      <button
        class="cq-btn cq-dice-liar"
        ?disabled=${disabled || !cur}
        @click=${liar}
        title=${cur
          ? `Call ${bidWords(cur)} a lie: the cups come up`
          : "Nobody's bid yet"}
      >
        Liar!
      </button>
    </div>
    <p class="cq-dice-status ${myTurn ? "now" : ""}" aria-live="polite">
      ${status}
    </p>
  </section>`;
}

// ---------------------------------------------------------------- gathering, and the end

function gatheringView(
  ui: GameUi,
  t: DiceTable,
  x: DiceSeat | undefined,
): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const host = t.host === life.c;
  const seated = t.seats.filter((y) => y.state === "in");
  const refused = t.acts.filter((a) => a.k === "refuse");
  const join = joinProblem(s, ui.w, life, t);
  const enough = seated.length >= MIN_SEATS;
  return html`<section class="cq-dice-mine">
      <h3 class="cq-dice-h">
        The table
        <span class="cq-muted small"
          >${seated.length} of ${MAX_SEATS} seats · ${t.stake} coins a
          seat</span
        >
      </h3>
      <ul class="cq-dice-who">
        ${seated.map(
          (y) =>
            html`<li>
              ${token(ui, s.chars[y.c], "small")}
              <span
                ><b>${y.c === life.c ? "You" : charName(s.chars[y.c])}</b>
                <span class="cq-muted small"
                  >${y.c === t.host ? "opened the table" : "sat down"}</span
                ></span
              >
            </li>`,
        )}
        ${t.asked.map(
          (c) =>
            html`<li class="asked">
              ${token(ui, s.chars[c], "small")}
              <span
                ><b>${charName(s.chars[c])}</b>
                <span class="cq-muted small"
                  >asked: a player, deciding</span
                ></span
              >
            </li>`,
        )}
        ${refused.map(
          (a) =>
            html`<li class="refused">
              ${token(ui, s.chars[a.c], "small")}
              <span
                ><b>${charName(s.chars[a.c])}</b>
                <span class="cq-muted small"
                  >won't: ${(a.why ?? "not tonight").toLowerCase()}</span
                ></span
              >
            </li>`,
        )}
      </ul>
    </section>
    <section class="cq-dice-play">
      <h3 class="cq-dice-h">${host ? "When you're ready" : "Waiting"}</h3>
      <p class="small">
        ${host
          ? enough
            ? "Everyone who's sitting down puts in the stake; roll, and you open the first round."
            : "Ask someone to sit down: you need at least one to play against."
          : x
            ? `Waiting for ${s.chars[t.host]?.first ?? "the host"} to roll.`
            : `${charName(s.chars[t.host])} has a table: ${t.stake} coins a seat.`}
      </p>
      <div class="cq-dice-acts">
        ${host
          ? html`<button
                class="cq-btn primary"
                ?disabled=${!enough}
                @click=${() => ui.cmd({ k: "dice", act: "start", id: t.id })}
              >
                Roll the dice
              </button>
              <button
                class="cq-btn"
                ?disabled=${seated.length + t.asked.length >= MAX_SEATS}
                @click=${() => ui.modal({ k: "dice", id: t.id, ask: true })}
              >
                Ask someone…
              </button>`
          : x
            ? nothing
            : html`<button
                class="cq-btn primary"
                ?disabled=${!!join}
                title=${join ?? ""}
                @click=${() => ui.cmd({ k: "dice", act: "join", id: t.id })}
              >
                Sit down (${t.stake})
              </button>`}
      </div>
      <p class="cq-dice-status">${!host && !x && join ? join : nothing}</p>
    </section>`;
}

function endView(
  ui: GameUi,
  t: DiceTable,
  x: DiceSeat | undefined,
  me: number,
): TemplateResult {
  const s = ui.s;
  const res = t.result;
  const w = res?.winner ?? -1;
  const fx = res?.fx[me] ?? [];
  // The order they went out, last out first.
  const order = [
    ...(w >= 0 ? [w] : []),
    ...t.acts
      .filter((a) => a.k === "out" || a.k === "gone")
      .map((a) => a.c)
      .reverse(),
  ].filter((c, i, xs) => xs.indexOf(c) === i);
  const again = !!x && t.status === "done" && !!res;
  return html`<section class="cq-dice-mine end">
      <h3 class="cq-dice-h">How it went</h3>
      <ol class="cq-dice-places">
        ${order.map(
          (c, i) =>
            html`<li class=${c === w ? "won" : ""}>
              <span class="n">${i + 1}</span>
              ${token(ui, s.chars[c], "small")}
              <span
                ><b>${c === me ? "You" : charName(s.chars[c])}</b>
                <span class="cq-muted small"
                  >${c === w
                    ? `took the pot of ${t.pot}`
                    : t.acts.some((a) => a.k === "gone" && a.c === c)
                      ? "got up"
                      : "out of dice"}</span
                ></span
              >
            </li>`,
        )}
      </ol>
    </section>
    <section class="cq-dice-play end">
      <h3 class="cq-dice-h">What it came to</h3>
      ${fx.length
        ? html`<ul class="cq-fx" aria-label="What changed">
            ${fx.map((f) => {
              const up = /^\+/.test(f);
              const good = /stress/.test(f) ? !up : up;
              return html`<li class=${good ? "good" : "bad"}>${f}</li>`;
            })}
          </ul>`
        : html`<p class="cq-muted">You weren't at the table.</p>`}
      <div class="cq-dice-acts">
        ${again
          ? html`<button
              class="cq-btn primary"
              @click=${async () => {
                if (await ui.cmd({ k: "dice", act: "again", id: t.id })) {
                  const n = tableAt(ui.s, t.prov);
                  if (n) ui.modal({ k: "dice", id: n.id });
                }
              }}
            >
              Play again (${t.stake})
            </button>`
          : nothing}
        <button class="cq-btn" @click=${() => ui.modal(null)}>
          Leave the table
        </button>
      </div>
    </section>`;
}

// ---------------------------------------------------------------- the window

/** The table scene (or, with no table, opening one). */
export function diceModal(
  ui: GameUi,
  m: { id?: number; ask?: boolean },
): TemplateResult {
  const life = ui.life;
  if (!life || !ui.me)
    return html`<p class="cq-muted">You're watching the world.</p>`;
  const t = m.id !== undefined ? tableById(ui.s, m.id) : tableHere(ui);
  if (!t || m.ask) return openView(ui, t && m.ask ? t : undefined);
  keepTicking(ui);
  const me = life.c;
  const n = showing(ui, t);
  const last = t.acts[t.acts.length - 1]?.n ?? 0;
  const caught = n >= last;
  const v = viewAt(t, n);
  const x = mySeat(ui, t);
  const others =
    t.status === "open"
      ? t.seats.filter((y) => y.state === "in")
      : t.seats.filter((y) => y.c !== me || !x);
  const ended = t.status === "done" && (!!v.won || caught);
  const leave = async () => {
    if (
      t.status === "playing" &&
      x?.state === "in" &&
      !confirm(
        v.bid
          ? `Get up when the cups are next lifted? Your ${t.stake} coins stay in the pot.`
          : `Get up from the table? Your ${t.stake} coins stay in the pot.`,
      )
    )
      return;
    if (await ui.cmd({ k: "dice", act: "leave", id: t.id }))
      if (t.status !== "playing" || !v.bid) ui.modal(null);
  };
  return html`<div
    class="cq-dice ${t.status} ${reduced() ? "still" : ""}"
    data-key="dice:${t.id}"
  >
    ${DEFS} ${stageView(ui, t, v, others, me)}
    <div
      class="cq-scene-ribbon ${ended
        ? t.result?.winner === me
          ? "good"
          : "bad"
        : ""}"
    >
      <h2>Liar's dice</h2>
      <span class="cq-scene-group"
        >${t.status === "open"
          ? `${t.stake} coins a seat · gathering`
          : ended
            ? `${t.stake} coins a seat · the end`
            : `Round ${v.round} · ${t.stake} coins a seat`}</span
      >
    </div>
    <div class="cq-dice-body">
      ${t.status === "open"
        ? gatheringView(ui, t, x)
        : ended
          ? endView(ui, t, x, me)
          : html`${mineView(ui, t, v, x, me)}
            ${pickerView(ui, t, v, x, me, caught)}`}
    </div>
    <div class="cq-scene-foot cq-dice-foot">
      <p class="cq-muted small">
        ${ui.solo
          ? "The world waits while you sit at the table."
          : t.seats.filter((y) => y.seat !== undefined && y.state === "in")
                .length > 1
            ? `In company: a player who doesn't bid in ${STALL_SECONDS} seconds has the smallest raise made for them.`
            : "The town's people wait for you to bid."}
        <button
          class="cq-link"
          @click=${() => ui.modal({ k: "guide", ch: "dice" })}
        >
          How it's played
        </button>
      </p>
      <span class="cq-dice-foot-btns">
        ${x && x.state === "in" && t.status !== "done"
          ? html`<button
              class="cq-btn quiet small"
              ?disabled=${!!x.quitting}
              @click=${leave}
            >
              ${x.quitting
                ? "Leaving when the cups come up"
                : t.status === "open"
                  ? `Get up (your ${t.stake} back)`
                  : "Get up from the table"}
            </button>`
          : nothing}
        <button class="cq-btn quiet small" @click=${() => ui.modal(null)}>
          ${t.status === "done" ? "Close" : "Step away"}
        </button>
      </span>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- opening a table

let opening: { key: string; stake: number; ask: number[] } | null = null;

/** Opening a table here, or asking more to one that's gathering. */
function openView(ui: GameUi, t: DiceTable | undefined): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const key = `${ui.modalSeq}:${t?.id ?? "new"}`;
  if (!opening || opening.key !== key)
    opening = {
      key,
      stake: t?.stake ?? (life.purse >= 5 ? 5 : 2),
      ask: [],
    };
  const o = opening;
  const stake = t?.stake ?? o.stake;
  const here = presentAt(s, ui.w, life.prov, "tavern", s.day, life)
    .map((x) => s.chars[x.c])
    .filter((c): c is Character => !!c && !canAsk(s, c))
    .filter(
      (c) =>
        !(t && (seatOf(t, c.id)?.state === "in" || t.asked.includes(c.id))) &&
        !seatedAt(s, c.id),
    )
    .sort(
      (a, b) =>
        Number(!!lifeOfChar(s, b.id)) - Number(!!lifeOfChar(s, a.id)) ||
        a.id - b.id,
    );
  const room =
    MAX_SEATS -
    (t ? t.seats.filter((y) => y.state === "in").length + t.asked.length : 1);
  const why = t ? null : openProblem(s, ui.w, life, stake);
  const toggle = (c: number) => {
    o.ask = o.ask.includes(c)
      ? o.ask.filter((y) => y !== c)
      : o.ask.length < room
        ? [...o.ask, c]
        : o.ask;
    ui.redraw();
  };
  const go = async () => {
    if (t) {
      if (await ui.cmd({ k: "dice", act: "ask", id: t.id, ask: o.ask }))
        ui.modal({ k: "dice", id: t.id });
      return;
    }
    if (await ui.cmd({ k: "dice", act: "open", stake, ask: o.ask })) {
      const n = tableAt(ui.s, life.prov);
      if (n) ui.modal({ k: "dice", id: n.id });
    }
  };
  const art = sceneArt("tavern");
  return html`<div class="cq-dice opening" data-key="dice-open">
    <div class="cq-dice-stage short indoors">
      <div
        class="cq-scene-bg"
        style=${art ? `background-image:url(${art})` : ""}
      ></div>
      <div class="cq-scene-light"></div>
      <p class="cq-scene-where">
        The tavern, ${ui.map.provinces[life.prov]?.name ?? ""}<span>
          · ${formatDate(s.day)}</span
        >
      </p>
      <div class="cq-dice-spread" aria-hidden="true">
        ${cupArt("")} ${die(5)} ${die(1)} ${die(3)} ${cupArt("")}
      </div>
    </div>
    <div class="cq-scene-ribbon">
      <h2>${t ? "Ask someone to the table" : "A table of Liar's dice"}</h2>
      <span class="cq-scene-group">${stake} coins a seat</span>
    </div>
    <div class="cq-dice-open">
      ${t
        ? nothing
        : html`<section>
            <h3 class="cq-dice-h">The stake</h3>
            <div
              class="cq-dice-stakes"
              role="radiogroup"
              aria-label="The stake"
            >
              ${STAKES.map(
                (k) =>
                  html`<button
                    class="cq-dice-stake ${k === stake ? "on" : ""}"
                    role="radio"
                    aria-checked=${k === stake}
                    @click=${() => {
                      o.stake = k;
                      ui.redraw();
                    }}
                  >
                    <b>${k}</b>
                    <span class="small"
                      >${k <= 2
                        ? "a friendly game"
                        : k <= 5
                          ? "an evening's play"
                          : k <= 10
                            ? "a serious game"
                            : "high stakes"}</span
                    >
                  </button>`,
              )}
            </div>
            <p class="cq-muted small">
              Everyone at the table puts in the stake; the last with dice takes
              the pot. You have ${Math.floor(life.purse)} coins.
            </p>
          </section>`}
      <section>
        <h3 class="cq-dice-h">
          Who you ask
          <span class="cq-muted small"
            >${o.ask.length} of ${Math.max(0, room)} more · ${MIN_SEATS} to
            ${MAX_SEATS} at a table</span
          >
        </h3>
        <ul class="cq-dice-ask" data-steady>
          ${here.length
            ? here.map((c) =>
                askRow(ui, c, stake, o.ask.includes(c.id), () => toggle(c.id)),
              )
            : html`<li class="cq-muted">
                Nobody's in the tavern just now: people come and go with the
                days.
              </li>`}
        </ul>
      </section>
      <section class="cq-dice-rules small">
        <h3 class="cq-dice-h">How it's played</h3>
        <p>
          Five dice each, under a cup: you see only your own. In turn, bid on
          how many of a face lie under <i>all</i> the cups ("four fives"); each
          bid must beat the last. Ones are wild. Or call the last bid a lie: the
          cups come up, and whoever was wrong loses a die. The last with dice
          takes the pot.
        </p>
        <button
          class="cq-link"
          @click=${() => ui.modal({ k: "guide", ch: "dice" })}
        >
          The rules, an example and some tips
        </button>
      </section>
    </div>
    <div class="cq-scene-actions cq-dice-foot">
      <button
        class="cq-btn primary"
        ?disabled=${!!why || (!!t && !o.ask.length)}
        title=${why ?? ""}
        @click=${go}
      >
        ${t ? `Ask ${o.ask.length || ""}` : `Open the table (${stake})`}
      </button>
      <button
        class="cq-btn quiet"
        @click=${() => ui.modal(t ? { k: "dice", id: t.id } : null)}
      >
        Back
      </button>
      ${why ? html`<span class="cq-why">${why}</span>` : nothing}
    </div>
  </div>`;
}

function askRow(
  ui: GameUi,
  c: Character,
  stake: number,
  on: boolean,
  toggle: () => void,
): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const player = !!lifeOfChar(s, c.id);
  const v = player ? null : sitAcceptance(s, life, c, stake);
  const will = v ? v.total > 0 : null;
  return html`<li class="cq-dice-asker ${on ? "on" : ""}">
    <button
      class="cq-dice-asker-row"
      role="checkbox"
      aria-checked=${on}
      @click=${toggle}
    >
      <span class="cq-dice-check" aria-hidden="true">${on ? "✓" : ""}</span>
      ${token(ui, c, "small")}
      <span class="cq-folk-text">
        <b>${charName(c)}</b>
        <span class="cq-muted small">${roleOf(ui, c)}, ${ageOf(s, c)}</span>
      </span>
      ${player
        ? html`<span class="cq-verdict-chip player"
            >a player: they decide</span
          >`
        : num(
            html`<span class="cq-verdict-chip ${will ? "will" : "wont"}"
              >${will ? "will sit down" : "won't"}</span
            >`,
            () => breakdownTip(`Will ${c.first} sit down?`, v!),
          )}
    </button>
    ${v ? html`<div class="cq-dice-why">${reasons(v, 2, 2)}</div>` : nothing}
  </li>`;
}

// ---------------------------------------------------------------- in the tavern

/** On the tavern's tile: "Dice: 3 at the table". */
export function diceTag(
  ui: GameUi,
  p: number,
  a: PlaceKind,
): TemplateResult | typeof nothing {
  if (a !== "tavern") return nothing;
  const t = tableAt(ui.s, p);
  if (!t) return nothing;
  const n = t.seats.filter((x) => x.state === "in").length;
  const mine = !!ui.life && seatOf(t, ui.life.c)?.state === "in";
  return html`<span
    class="cq-area-dice ${mine ? "mine" : ""}"
    title=${t.status === "open"
      ? "A table of Liar's dice, gathering"
      : "Liar's dice going"}
    >Dice: ${n} at the table</span
  >`;
}

/** The tavern's button for the dice: open a table, sit down, watch, or go back. */
export function diceAct(
  ui: GameUi,
  p: number,
): {
  label: string;
  ok: boolean;
  why: string | null;
  run: () => void;
  lit: boolean;
} {
  const s = ui.s;
  const life = ui.life!;
  const t = tableAt(s, p);
  const go = () => ui.modal({ k: "dice", id: t?.id });
  if (t && seatOf(t, life.c)?.state === "in")
    return {
      label: "Back to the dice table",
      ok: true,
      why: null,
      run: go,
      lit: true,
    };
  if (t?.status === "open") {
    const why = joinProblem(s, ui.w, life, t);
    return {
      label: `Liar's dice: sit down (${t.stake})`,
      ok: true,
      why: why && !/rolling/.test(why) ? why : null,
      run: go,
      lit: !why,
    };
  }
  if (t)
    return {
      label: "Watch the dice",
      ok: true,
      why: null,
      run: go,
      lit: false,
    };
  const why = openProblem(s, ui.w, life, STAKES[0]);
  return {
    label: "Liar's dice…",
    ok: !why,
    why,
    run: () => ui.modal({ k: "dice" }),
    lit: false,
  };
}

/** The tavern's fold for the dice: who's at the table, and the way to it. */
export function dicePart(
  ui: GameUi,
  p: number,
  area: PlaceKind,
): PlacePart | null {
  if (area !== "tavern") return null;
  const s = ui.s;
  const t = tableAt(s, p);
  if (!t) return null;
  const seated = t.seats.filter((x) => x.state === "in");
  return {
    key: "dice",
    title: "Liar's dice",
    count: seated.length,
    open: true,
    note: t.status === "open" ? "gathering" : `round ${t.round}`,
    body: html`<div class="cq-dice-fold">
      <p class="small">
        ${t.status === "open"
          ? `${charName(s.chars[t.host])} has a table: ${t.stake} coins a seat, until the first roll.`
          : `A game going: ${t.stake} coins a seat, a pot of ${t.pot}.`}
      </p>
      <p class="cq-dice-fold-faces">
        ${seated.map((x) => token(ui, s.chars[x.c], "small"))}
      </p>
      <button
        class="cq-btn small ${seatOf(t, ui.life!.c)?.state === "in"
          ? "primary"
          : ""}"
        @click=${() => ui.modal({ k: "dice", id: t.id })}
      >
        ${seatOf(t, ui.life!.c)?.state === "in"
          ? "Back to the table"
          : t.status === "open"
            ? "Look at the table"
            : "Watch"}
      </button>
    </div>`,
  };
}

/** For the tray: you're at a table (and whether it's your turn). */
export function diceTrayItem(
  ui: GameUi,
): { id: number; label: string; urgent: boolean } | null {
  const life = ui.life;
  if (!life || life.watching) return null;
  const t = seatedAt(ui.s, life.c);
  if (!t) return null;
  const mine = t.status === "playing" && t.seats[t.turn]?.c === life.c;
  return {
    id: t.id,
    label:
      t.status === "open"
        ? "Liar's dice: the table's gathering"
        : mine
          ? "Liar's dice: your turn"
          : `Liar's dice: round ${t.round}`,
    urgent: mine,
  };
}
