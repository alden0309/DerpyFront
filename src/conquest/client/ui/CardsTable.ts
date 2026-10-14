// EVENTS (r21): vingt-et-un at the tavern, in the browser. Opening a table
// (the stake a hand, and who you ask: each with whether they'll sit down
// and why); the table itself over the painted tavern: the innkeeper keeping
// the bank with his two cards face down until he plays, the punters with
// their cards (face down but for a natural or a bust, all turned up when the
// hand's settled), your own hand large in front of you with its count, and
// the odds of drawing and of standing, worked out from the cards you can't
// see; "A card" and "Content"; between hands, "Deal" or sit one out; the
// table's log. The town's people's draws and the banker's play are played
// back one by one, so a hand reads like play.

import { html, nothing, type TemplateResult } from "lit";
import { presentAt } from "../../engine/Areas";
import { formatDate } from "../../engine/Calendar";
import {
  bankOdds,
  bustChance,
  CARD_STAKES,
  cardSeatedAt,
  cardSeatOf,
  cardTableAt,
  cardTableById,
  handTotal,
  isNatural,
  MAX_PUNTERS,
  standOdds,
  unseenOf,
} from "../../engine/CardsCore";
import { lifeOfChar } from "../../engine/LifeQueries";
import { chanceWords } from "../../engine/Odds";
import { ageOf, charName } from "../../engine/Queries";
import type {
  Card,
  CardAct,
  CardSeat,
  CardTable,
  Character,
  PlaceKind,
} from "../../engine/Types";
import {
  cardsAcceptance,
  cardsJoinProblem,
  cardsOpenProblem,
} from "../../engine/VingtEtUn";
import { cardBack, cardFace } from "../CardArt";
import { sceneArt } from "../SceneArt";
import { play } from "../Sound";
import { num } from "../Tip";
import { breakdownTip, type GameUi, token } from "./Context";
import { roleOf } from "./Here";
import type { PlacePart } from "./Livelihood";
import { price } from "./Price";
import { reasons } from "./Scene";
import { term } from "./Terms";

const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const pct = (p: number) => `${Math.round(p * 100)} in 100`;

// ---------------------------------------------------------------- playing back

const shown = new Map<number, { n: number; timer: number; seq: number }>();
const clocks = new Map<number, number>();
let ticker = 0;

/** The server's word on a held-up table: how long before it decides for whoever's holding it up. */
export function onCardsClock(m: { id: number; left: number }): void {
  clocks.set(m.id, performance.now() + m.left * 1000);
}

function clockLeft(id: number): number | null {
  const k = clocks.get(id);
  if (k === undefined) return null;
  const s = Math.ceil((k - performance.now()) / 1000);
  return s >= 0 ? s : null;
}

const clockText = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function delayOf(t: CardTable, a: CardAct, me: number): number {
  const theirs = a.c !== me;
  switch (a.k) {
    case "draw":
    case "stand":
      return theirs ? 650 : 0;
    case "bust":
    case "natural":
      return theirs ? 700 : 300;
    case "bank":
      return 1000;
    case "settle":
      return 1300;
    case "deal":
      return 400;
    default:
      return t.seats.some((x) => x.c === a.c && x.seat === undefined) ? 300 : 0;
  }
}

function cue(a: CardAct, me: number): void {
  if (a.k === "deal" || a.k === "draw") play("paper");
  else if (a.k === "settle" && (a.pay?.[me] ?? 0) > 0) play("coins");
}

function showing(ui: GameUi, t: CardTable): number {
  const last = t.acts[t.acts.length - 1]?.n ?? 0;
  let pb = shown.get(t.id);
  if (!pb || pb.seq !== ui.modalSeq) {
    if (pb?.timer) clearTimeout(pb.timer);
    pb = { n: last, timer: 0, seq: ui.modalSeq };
    shown.set(t.id, pb);
  }
  const me = ui.life?.c ?? -1;
  for (;;) {
    const next = t.acts.find((a) => a.n > pb.n);
    if (!next || pb.timer) break;
    const wait = reduced() ? 0 : delayOf(t, next, me);
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

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function keepTicking(ui: GameUi): void {
  if (ticker) return;
  ticker = window.setInterval(() => {
    if (!document.querySelector(".cq-cards")) {
      clearInterval(ticker);
      ticker = 0;
      return;
    }
    if (clocks.size) ui.redraw();
  }, 1000);
}

/** A table as it stood at a move: this hand's cards as far as anyone could see them. */
interface View {
  hand: number;
  /** Cards each holds (a count), and those turned up. */
  count: Map<number, number>;
  shown: Map<number, Card[]>;
  state: Map<number, CardSeat["state"] | "deal">;
  bank: Card[] | null;
  settle: CardAct | null;
  last: CardAct | undefined;
}

function viewAt(t: CardTable, upTo: number): View {
  const acts = t.acts.filter((a) => a.n <= upTo);
  const v: View = {
    hand: 0,
    count: new Map(),
    shown: new Map(),
    state: new Map(),
    bank: null,
    settle: null,
    last: acts[acts.length - 1],
  };
  for (const x of t.seats) v.state.set(x.c, x.state === "gone" ? "gone" : "in");
  for (const a of acts) if (a.k === "gone") v.state.set(a.c, "gone");
  let di = -1;
  for (let i = acts.length - 1; i >= 0; i--)
    if (acts[i].k === "deal") {
      di = i;
      break;
    }
  if (di < 0) return v;
  const deal = acts[di];
  v.hand = deal.hand;
  for (const c of Object.keys(deal.stakes ?? {})) {
    v.count.set(Number(c), 2);
    v.state.set(Number(c), "play");
  }
  for (const a of acts.slice(di + 1)) {
    if (a.k === "draw")
      v.count.set(a.c, a.count ?? (v.count.get(a.c) ?? 2) + 1);
    else if (a.k === "stand") v.state.set(a.c, "stood");
    else if (a.k === "bust") {
      v.state.set(a.c, "bust");
      v.shown.set(a.c, a.cards ?? []);
    } else if (a.k === "natural") {
      v.state.set(a.c, "natural");
      v.shown.set(a.c, a.cards ?? []);
    } else if (a.k === "bank") v.bank = a.cards ?? [];
    else if (a.k === "settle") {
      v.settle = a;
      for (const [c, cs] of Object.entries(a.hands ?? {}))
        v.shown.set(Number(c), cs);
    }
  }
  return v;
}

// ---------------------------------------------------------------- the table

export function cardsHereTable(ui: GameUi): CardTable | undefined {
  const life = ui.life;
  if (!life) return undefined;
  return cardSeatedAt(ui.s, life.c) ?? cardTableAt(ui.s, life.prov);
}

function mySeat(ui: GameUi, t: CardTable): CardSeat | undefined {
  const life = ui.life;
  return life
    ? t.seats.find(
        (x) => x.c === life.c && x.seat === ui.seat && x.state !== "gone",
      )
    : undefined;
}

const nameOf = (ui: GameUi, c: number) =>
  c < 0 ? "The landlord" : (ui.s.chars[c]?.first ?? "?");

/** A row of cards: faces where they're known, backs where they aren't. */
function cardRow(
  cards: Card[] | null,
  count: number,
  cls = "",
): TemplateResult {
  const n = Math.max(count, cards?.length ?? 0);
  return html`<span class="cq-cards-row ${cls}" style="--n:${n}">
    ${Array.from({ length: n }, (_, i) =>
      cards?.[i] !== undefined ? cardFace(cards[i]) : cardBack(),
    )}
  </span>`;
}

function totalWords(cards: Card[]): string {
  const { total, soft } = handTotal(cards);
  if (isNatural(cards)) return "a natural";
  if (total > 21) return `${total}: over`;
  return `${soft ? "soft " : ""}${total}`;
}

const STATE_WORDS: Record<string, string> = {
  play: "deciding",
  stood: "content",
  bust: "over",
  natural: "a natural",
  out: "sitting out",
  in: "",
  gone: "gone",
};

function bankView(ui: GameUi, t: CardTable, v: View): TemplateResult {
  const c = t.bank >= 0 ? ui.s.chars[t.bank] : undefined;
  const cards = v.bank;
  const dealt = v.hand > 0;
  return html`<div class="cq-cards-bank">
    ${c ? token(ui, c, "small") : html`<span class="cq-cards-house">♣</span>`}
    <span class="cq-cards-who"
      ><b>${c ? charName(c) : "The landlord"}</b>
      <span class="cq-muted small">keeps the bank</span></span
    >
    ${dealt ? cardRow(cards, cards?.length ?? 2, "bank") : nothing}
    <span class="cq-cards-count"
      >${cards ? totalWords(cards) : dealt ? "face down" : ""}</span
    >
  </div>`;
}

function seatView(
  ui: GameUi,
  t: CardTable,
  x: CardSeat,
  v: View,
  me: number,
): TemplateResult {
  const st = v.state.get(x.c) ?? x.state;
  const cards = v.shown.get(x.c) ?? null;
  const count = v.count.get(x.c) ?? 0;
  const pay = v.settle?.pay?.[x.c];
  const c = ui.s.chars[x.c];
  return html`<li
    class="cq-cards-seat ${x.c === me ? "you" : ""} ${st}"
    aria-label=${`${x.c === me ? "You" : charName(c)}: ${STATE_WORDS[st] ?? ""}`}
  >
    ${token(ui, c, "small")}
    <span class="cq-cards-who"
      ><b>${x.c === me ? "You" : nameOf(ui, x.c)}</b>
      <span class="cq-muted small"
        >${pay !== undefined
          ? pay > 0
            ? `+${pay}`
            : pay < 0
              ? `−${-pay}`
              : "stand-off"
          : (STATE_WORDS[st] ?? "")}</span
      ></span
    >
    ${count && x.c !== me ? cardRow(cards, count, "small") : nothing}
    <span
      class="cq-cards-net ${x.net > 0 ? "good" : x.net < 0 ? "bad" : ""}"
      title="Up or down at this table, all hands"
      >${x.hands
        ? x.net > 0
          ? `+${x.net}`
          : x.net < 0
            ? `−${-x.net}`
            : "even"
        : ""}</span
    >
  </li>`;
}

/** Your hand, large, with what it counts and the odds of drawing and standing. */
function handView(
  ui: GameUi,
  t: CardTable,
  v: View,
  x: CardSeat | undefined,
  me: number,
  caught: boolean,
): TemplateResult {
  if (!x)
    return html`<section class="cq-cards-mine watching">
      <h3 class="cq-cards-h">Watching</h3>
      <p class="cq-muted">You'll see the cards when they're turned up.</p>
    </section>`;
  // Your cards in the hand being shown (the next one's, once it's dealt and caught up).
  const cards =
    v.hand === t.hand && (t.status === "hand" || caught)
      ? x.cards
      : (v.settle?.hands?.[me] ?? v.shown.get(me) ?? []);
  const st = v.state.get(me) ?? x.state;
  const playing = caught && t.status === "hand" && x.state === "play";
  const known = [...cards];
  for (const [c, cs] of v.shown) if (c !== me) known.push(...cs);
  const unseen = unseenOf(known);
  const bust = bustChance(cards, unseen);
  const { total } = handTotal(cards);
  const so = standOdds(total, bankOdds(unseen));
  const draw = () => ui.cmd({ k: "cards", act: "draw", id: t.id });
  const stand = () => ui.cmd({ k: "cards", act: "stand", id: t.id });
  return html`<section class="cq-cards-mine">
    <h3 class="cq-cards-h">
      Your hand
      <span class="cq-muted small"
        >${cards.length ? totalWords(cards) : (STATE_WORDS[st] ?? "")}</span
      >
    </h3>
    <div class="cq-cards-yours">
      ${cards.length
        ? cardRow(cards, cards.length, "big")
        : html`<p class="cq-muted small">
            ${t.status === "hand"
              ? "You're sitting this hand out."
              : "Your cards come when the hand is dealt."}
          </p>`}
    </div>
    ${cards.length && st === "play"
      ? html`<div class="cq-cards-odds">
          <p>
            <b>A card:</b>
            ${num(
              `${chanceWords(bust)} you go over`,
              () => ({
                title: "Drawing a card",
                notes: [
                  `Of the cards you can't see, ${pct(bust)} would take your ${total} over twenty-one.`,
                  "Worked out from the whole deck less the cards you can see (yours, and any turned up).",
                ],
              }),
              `cq-cards-chance ${bust >= 0.5 ? "bad" : bust < 0.25 ? "good" : ""}`,
            )}
          </p>
          <p>
            <b>Content at ${total}:</b>
            ${num(
              `you win ${chanceWords(so.win)}, a stand-off ${chanceWords(so.tie)}, the bank wins ${chanceWords(so.lose)}`,
              () => ({
                title: "Standing on what you hold",
                notes: [
                  `The banker turns up his two cards and draws to seventeen. From the cards you can't see: he goes over, or stops under ${total}, ${pct(so.win)}; stops at ${total} (a stand-off) ${pct(so.tie)}; beats you ${pct(so.lose)}.`,
                  "He hasn't a natural, or he'd have shown it at the deal.",
                ],
              }),
              "cq-cards-chance",
            )}
          </p>
        </div>`
      : nothing}
    <div class="cq-cards-acts">
      <button class="cq-btn primary" ?disabled=${!playing} @click=${draw}>
        A card
      </button>
      <button class="cq-btn" ?disabled=${!playing} @click=${stand}>
        Content
      </button>
    </div>
  </section>`;
}

/** Between hands: deal, sit out, get up; and what the last hand came to. */
function betweenView(
  ui: GameUi,
  t: CardTable,
  v: View,
  x: CardSeat | undefined,
  caught: boolean,
): TemplateResult {
  const life = ui.life!;
  const others = t.seats.filter(
    (y) => y.seat !== undefined && y.state !== "gone" && y.c !== life.c,
  );
  const waiting = others.filter((y) => y.ready === undefined);
  const left = clockLeft(t.id);
  const deal = () => ui.cmd({ k: "cards", act: "deal", id: t.id });
  const out = () => ui.cmd({ k: "cards", act: "sitout", id: t.id });
  const join = () => ui.cmd({ k: "cards", act: "join", id: t.id });
  if (!x) {
    const why = cardsJoinProblem(ui.s, ui.w, life, t);
    return html`<section class="cq-cards-play">
      <div class="cq-cards-acts">
        <button class="cq-btn primary" ?disabled=${!!why} @click=${join}>
          Sit down${price(t.stake, { have: life.purse, per: "each" })}
        </button>
      </div>
      ${why ? html`<p class="cq-why">${why}</p>` : nothing}
    </section>`;
  }
  const said = x.ready;
  return html`<section class="cq-cards-play">
    <div class="cq-cards-acts">
      <button
        class="cq-btn primary"
        ?disabled=${!caught || t.status === "hand" || said === true}
        @click=${deal}
        title="Your stake on the next hand; it's dealt when everyone at the table has said"
      >
        ${t.hand ? "Deal again" : "Deal"}${price(t.stake, { have: life.purse })}
      </button>
      <button
        class="cq-btn"
        ?disabled=${!caught || t.status === "hand" || said === false}
        @click=${out}
      >
        Sit this one out
      </button>
    </div>
    <p class="cq-cards-status" aria-live="polite">
      ${t.status === "hand"
        ? "A hand is being played."
        : said === true
          ? waiting.length
            ? `You're in. Waiting for ${waiting.map((y) => nameOf(ui, y.c)).join(" and ")}${left !== null ? ` · ${clockText(left)}` : ""}…`
            : "You're in."
          : said === false
            ? "You're sitting the next hand out."
            : t.hand
              ? "Another hand?"
              : "Deal when you're ready."}
    </p>
  </section>`;
}

/** The table's log: oldest at the top, the newest at the foot. */
function logView(
  ui: GameUi,
  t: CardTable,
  upTo: number,
  me: number,
): TemplateResult {
  const who = (c: number) => (c === me ? "You" : nameOf(ui, c));
  const lines: TemplateResult[] = [];
  for (const a of t.acts) {
    if (a.n > upTo) break;
    switch (a.k) {
      case "sit":
        lines.push(
          html`<li>${who(a.c)} ${a.c === me ? "sit" : "sits"} down.</li>`,
        );
        break;
      case "refuse":
        lines.push(
          html`<li class="dim">
            ${who(a.c)} won't sit
            down${a.why
              ? `: ${a.why.charAt(0).toLowerCase()}${a.why.slice(1)}`
              : ""}.
          </li>`,
        );
        break;
      case "deal":
        lines.push(
          html`<li class="round">
            Hand ${a.hand}: ${Object.keys(a.stakes ?? {}).length} dealt in.
          </li>`,
        );
        break;
      case "natural":
        lines.push(html`<li class="good">${who(a.c)}: a natural!</li>`);
        break;
      case "draw":
        lines.push(
          html`<li>
            ${who(a.c)}: "A
            card."${a.auto ? html` <i>(made for them)</i>` : nothing}
          </li>`,
        );
        break;
      case "stand":
        lines.push(
          html`<li>
            ${who(a.c)}:
            "Content."${a.auto ? html` <i>(made for them)</i>` : nothing}
          </li>`,
        );
        break;
      case "bust":
        lines.push(
          html`<li class="bad">
            ${who(a.c)} ${a.c === me ? "go" : "goes"} over:
            ${handTotal(a.cards ?? []).total}.
          </li>`,
        );
        break;
      case "bank":
        lines.push(
          html`<li class="round">
            The bank turns up: ${totalWords(a.cards ?? [])}.
          </li>`,
        );
        break;
      case "settle": {
        const parts = Object.entries(a.pay ?? {}).map(([c, p]) => {
          const n = Number(c);
          return `${who(n)} ${p > 0 ? `+${p}` : p < 0 ? `−${-p}` : "even"}`;
        });
        lines.push(html`<li class="round">Settled: ${parts.join(", ")}.</li>`);
        break;
      }
      case "gone":
        lines.push(
          html`<li class="dim">${who(a.c)} ${a.why ?? "gets up"}.</li>`,
        );
        break;
      case "close":
        lines.push(
          html`<li class="dim">${a.why ?? "The cards are put away."}</li>`,
        );
        break;
    }
  }
  requestAnimationFrame(() => {
    const ol = document.querySelector<HTMLElement>(
      `.cq-cards-log[data-t="${t.id}"]`,
    );
    if (ol) ol.scrollTop = ol.scrollHeight;
  });
  return html`<div class="cq-cards-history">
    <h4 class="cq-cards-h small">The table's log</h4>
    <ol class="cq-cards-log" data-t=${t.id} aria-live="polite">
      ${lines.length ? lines : html`<li class="dim">Nothing yet.</li>`}
    </ol>
  </div>`;
}

// ---------------------------------------------------------------- opening a table

let opening: { stake: number; ask: number[] } | null = null;

const STAKE_WORDS: Record<number, string> = {
  1: "A friendly hand",
  2: "An evening's play",
  5: "A serious game",
  10: "High stakes",
};

function openView(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const o = (opening ??= { stake: 2, ask: [] });
  const folk = presentAt(s, ui.w, life.prov, "tavern", s.day)
    .map((x) => s.chars[x.c])
    .filter(
      (c): c is Character =>
        !!c?.alive &&
        c.id !== life.c &&
        ageOf(s, c) >= 16 &&
        c.role !== "innkeeper",
    )
    .sort(
      (a, b) => Number(!!lifeOfChar(s, b.id)) - Number(!!lifeOfChar(s, a.id)),
    );
  const why = cardsOpenProblem(s, ui.w, life, o.stake);
  const toggle = (c: number) => {
    o.ask = o.ask.includes(c)
      ? o.ask.filter((x) => x !== c)
      : o.ask.length < MAX_PUNTERS - 1
        ? [...o.ask, c]
        : o.ask;
    ui.redraw();
  };
  const go = async () => {
    if (await ui.cmd({ k: "cards", act: "open", stake: o.stake, ask: o.ask })) {
      const t = cardTableAt(ui.s, life.prov);
      opening = null;
      if (t) ui.modal({ k: "cards", id: t.id });
    }
  };
  return html`<div class="cq-cards opening">
    <h2 class="cq-cards-title">${term("vingtetun", "Vingt-et-un")}</h2>
    <p class="cq-muted">
      Against the bank: the innkeeper deals. Two cards each, face down; draw or
      stand; the nearest to twenty-one without going over beats the bank.
    </p>
    <h3 class="cq-cards-h">The stake on each hand</h3>
    <div class="cq-cards-stakes" role="radiogroup" aria-label="The stake">
      ${CARD_STAKES.map(
        (k) =>
          html`<button
            class="cq-cards-stake ${o.stake === k ? "on" : ""}"
            role="radio"
            aria-checked=${o.stake === k}
            @click=${() => {
              o.stake = k;
              ui.redraw();
            }}
          >
            <b>${k}</b><span>${k === 1 ? "coin" : "coins"} a hand</span>
            <i>${STAKE_WORDS[k]}</i>
          </button>`,
      )}
    </div>
    <h3 class="cq-cards-h">Who you ask to sit in</h3>
    <ul class="cq-cards-askers">
      ${folk.length
        ? folk.map((c) =>
            askRow(ui, c, o.stake, o.ask.includes(c.id), () => toggle(c.id)),
          )
        : html`<li class="cq-muted">
            Nobody else in the tavern: play the bank alone.
          </li>`}
    </ul>
    <details class="cq-cards-rules">
      <summary>How it's played</summary>
      <ul>
        <li>
          Aces count one or eleven; kings, queens and knaves ten; the rest their
          pips.
        </li>
        <li>
          A natural (an ace with a ten or a court card) is turned up at once and
          paid double, unless the banker has one too. A banker's natural takes
          every stake but a natural's.
        </li>
        <li>
          Draw ("a card") as often as you dare; over twenty-one and your cards
          are turned up and your stake is the bank's.
        </li>
        <li>
          When everyone's content or over, the banker turns his cards up and
          draws until he has seventeen or more. Over twenty-one, he pays
          everyone still in; otherwise more than his count is paid even money,
          less loses, and the same is a stand-off: your stake back.
        </li>
      </ul>
    </details>
    <div class="cq-cards-acts">
      <button class="cq-btn primary" ?disabled=${!!why} @click=${go}>
        Open the table
      </button>
      <button class="cq-btn quiet" @click=${() => ui.modal(null)}>Back</button>
    </div>
    ${why ? html`<p class="cq-why">${why}</p>` : nothing}
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
  const v = player ? null : cardsAcceptance(s, life, c, stake);
  const will = v ? v.total > 0 : null;
  return html`<li class="cq-cards-asker ${on ? "on" : ""}">
    <button
      class="cq-cards-asker-row"
      role="checkbox"
      aria-checked=${on}
      @click=${toggle}
    >
      <span class="cq-cards-check" aria-hidden="true">${on ? "✓" : ""}</span>
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
              >${will ? "will sit in" : "won't"}</span
            >`,
            () => breakdownTip(`Will ${c.first} sit in?`, v!),
          )}
    </button>
    ${v ? html`<div class="cq-cards-why">${reasons(v, 2, 2)}</div>` : nothing}
  </li>`;
}

// ---------------------------------------------------------------- the window

export function cardsModal(ui: GameUi, m: { id?: number }): TemplateResult {
  const life = ui.life;
  if (!life || !ui.me)
    return html`<p class="cq-muted">You're watching the world.</p>`;
  const t = m.id !== undefined ? cardTableById(ui.s, m.id) : cardsHereTable(ui);
  if (!t) return openView(ui);
  keepTicking(ui);
  const me = life.c;
  const n = showing(ui, t);
  const last = t.acts[t.acts.length - 1]?.n ?? 0;
  const caught = n >= last;
  const v = viewAt(t, n);
  const x = mySeat(ui, t);
  const art = sceneArt("tavern");
  const seats = t.seats.filter((y) => y.state !== "gone" || v.count.has(y.c));
  const leave = async () => {
    if (
      t.status === "hand" &&
      x?.stake &&
      !confirm("Get up when this hand is settled? Your stake stays on it.")
    )
      return;
    if (await ui.cmd({ k: "cards", act: "leave", id: t.id })) ui.modal(null);
  };
  const left = clockLeft(t.id);
  return html`<div class="cq-cards ${t.status}" data-key="cards:${t.id}">
    <div class="cq-cards-stage indoors">
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
      <div class="cq-cards-baize">
        ${bankView(ui, t, v)}
        <ol class="cq-cards-seats" aria-label="The punters">
          ${seats.map((y) => seatView(ui, t, y, v, me))}
        </ol>
      </div>
    </div>
    <div class="cq-scene-ribbon">
      <h2>${term("vingtetun", "Vingt-et-un")}</h2>
      <span class="cq-scene-group"
        >${t.stake} ${t.stake === 1 ? "coin" : "coins"} a
        hand${t.hand ? ` · hand ${t.hand}` : ""}${t.status === "hand" &&
        left !== null
          ? ` · ${clockText(left)} to decide`
          : ""}</span
      >
    </div>
    <div class="cq-cards-body">
      ${t.status === "done"
        ? html`<section class="cq-cards-play">
            <p>The cards are put away.</p>
            ${x || t.seats.some((y) => y.c === me)
              ? html`<p class="cq-muted">
                  ${(() => {
                    const y = t.seats.find((z) => z.c === me);
                    return y?.hands
                      ? `You left ${y.net > 0 ? `${y.net} up` : y.net < 0 ? `${-y.net} down` : "even"} after ${y.hands} ${y.hands === 1 ? "hand" : "hands"}.`
                      : "";
                  })()}
                </p>`
              : nothing}
          </section>`
        : html`${handView(ui, t, v, x, me, caught)}
          ${t.status !== "hand" || !x?.stake
            ? betweenView(ui, t, v, x, caught)
            : nothing}`}
      ${logView(ui, t, n, me)}
      <div class="cq-cards-foot">
        ${x
          ? html`<button class="cq-btn quiet" @click=${leave}>
              Get up from the table
            </button>`
          : nothing}
        <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
          Step away
        </button>
      </div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- in the tavern

/** On the tavern's tile: "Cards: 3". */
export function cardsTag(
  ui: GameUi,
  p: number,
  a: PlaceKind,
): TemplateResult | typeof nothing {
  if (a !== "tavern") return nothing;
  const t = cardTableAt(ui.s, p);
  if (!t) return nothing;
  const n = t.seats.filter((x) => x.state !== "gone").length;
  const mine =
    !!ui.life &&
    !!cardSeatOf(t, ui.life.c) &&
    cardSeatOf(t, ui.life.c)!.state !== "gone";
  return html`<span
    class="cq-area-dice ${mine ? "mine" : ""}"
    title="Vingt-et-un at the card table"
    >Cards: ${n}<span class="long"> at the table</span></span
  >`;
}

/** The tavern's button for the cards: open a table, sit down, or go back. */
export function cardsAct(
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
  const t = cardTableAt(s, p);
  const go = () => ui.modal({ k: "cards", id: t?.id });
  const x = t ? cardSeatOf(t, life.c) : undefined;
  if (t && x && x.state !== "gone")
    return {
      label: "Back to the card table",
      ok: true,
      why: null,
      run: go,
      lit: true,
    };
  if (t) {
    const why = cardsJoinProblem(s, ui.w, life, t);
    return {
      label: `Vingt-et-un: sit down (${t.stake})`,
      ok: true,
      why,
      run: go,
      lit: !why,
    };
  }
  const why = cardsOpenProblem(s, ui.w, life, CARD_STAKES[0]);
  return {
    label: "Vingt-et-un…",
    ok: !why,
    why,
    run: () => ui.modal({ k: "cards" }),
    lit: false,
  };
}

/** The tavern's fold for the cards: who's at the table, and the way to it. */
export function cardsPart(
  ui: GameUi,
  p: number,
  area: PlaceKind,
): PlacePart | null {
  if (area !== "tavern") return null;
  const t = cardTableAt(ui.s, p);
  if (!t) return null;
  const at = t.seats.filter((x) => x.state !== "gone");
  return {
    key: "cards",
    title: "Vingt-et-un",
    count: at.length,
    body: html`<p class="cq-muted small">
        ${t.bank >= 0 ? charName(ui.s.chars[t.bank]) : "The landlord"} keeps the
        bank, ${t.stake} ${t.stake === 1 ? "coin" : "coins"} a
        hand${t.hand ? `, hand ${t.hand}` : ""}.
      </p>
      <ul class="cq-cards-here">
        ${at.map(
          (x) =>
            html`<li>
              ${token(ui, ui.s.chars[x.c], "xs")} ${charName(ui.s.chars[x.c])}
            </li>`,
        )}
      </ul>
      <button
        class="cq-btn small"
        @click=${() => ui.modal({ k: "cards", id: t.id })}
      >
        ${mySeat(ui, t) ? "Back to the table" : "Look"}
      </button>`,
  };
}

/** The tray at the top: your card table, while you've stepped away and it wants you. */
export function cardsTrayItem(
  ui: GameUi,
): { id: number; label: string; urgent: boolean } | null {
  const life = ui.life;
  if (!life) return null;
  const t = cardSeatedAt(ui.s, life.c);
  const x = t ? mySeat(ui, t) : undefined;
  if (!t || !x) return null;
  const mine =
    t.status === "hand"
      ? x.state === "play"
      : x.ready === undefined && t.hand > 0;
  return {
    id: t.id,
    label: mine
      ? t.status === "hand"
        ? "Vingt-et-un: your hand"
        : "Vingt-et-un: another hand?"
      : "Vingt-et-un",
    urgent: mine && clockLeft(t.id) !== null,
  };
}
