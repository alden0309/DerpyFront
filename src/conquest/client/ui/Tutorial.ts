// CQTUT (r26): the first life's lessons in the game's own clothes. A small
// card by the map (at the top of it on a phone) says what to do now, in a
// line or two; a soft gold ring stands round the thing to use; "Show me"
// opens the page it's on and brings it into view; "Skip step" moves on. A
// letter open, the card makes way and a line of advice sits over it. The
// steps themselves (and what counts as doing them) are the engine's
// (engine/Tutorial.ts); this only says them.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { formatDate } from "../../engine/Calendar";
import { meOf } from "../../engine/LifeQueries";
import {
  FIRST_LIFE_COINS,
  TUT_EARN_DONE,
  TUT_ERRAND,
  TUT_HOME,
  TUT_STEP_COUNT,
  tutEarned,
  TUTORIAL_STEPS,
  tutStep,
  type TutStep,
} from "../../engine/TutorialCore";
import type { Character, Life, TutorialState } from "../../engine/Types";
import type { DrawerView, GameUi, Modal } from "./Context";
import { subOf } from "./Nav";

// ---------------------------------------------------------------- what to point at

/**
 * Something on the screen: a selector, and (if many match) the words it
 * holds, and (`pick`) the thing inside it to ring; or a place on the map.
 */
export type TutTarget =
  | { sel: string; text?: RegExp; pick?: string }
  | { prov: number };

/** Where a province is on the screen (the game's map sets it), or null if it's not in view. */
export const tutMap: {
  point: ((p: number) => { x: number; y: number } | null) | null;
} = { point: null };

/** What a step says now. */
interface Say {
  title: string;
  text: TemplateResult | string;
  /** What to ring (the first that's on the screen). */
  at: TutTarget[];
  /** "Show me": the page it's on. */
  show?: () => void;
  /** Over an open letter: a line of advice. */
  over?: string;
}

/** What the card needs besides the game: the drawer's page, the open window, and the way out. */
export interface TutContext {
  cur: DrawerView | undefined;
  modal: Modal | null;
  signedIn: boolean;
  /** Leave this game for the start screen, and begin there: a fresh life, or the first life again. */
  fresh: () => void;
  again: (female: boolean) => void;
}

const provNamed = (ui: GameUi, name: string) =>
  ui.map.provinces.findIndex((p) => p.name === name);

const person = (ui: GameUi, id: number): Character | undefined => {
  const c = ui.s.chars[id];
  return c?.alive ? c : undefined;
};
const firstOf = (ui: GameUi, id: number, or: string) =>
  person(ui, id)?.first ?? or;
const fullOf = (ui: GameUi, id: number, or: string) => {
  const c = person(ui, id);
  return c ? `${c.first} ${c.family}` : or;
};

/** A letter of the lessons' own, waiting (and whether it's open). */
function letterOf(
  ui: GameUi,
  life: Life,
  t: TutorialState,
  modal: Modal | null,
): { id: number; open: boolean } | null {
  if (!t.wait) return null;
  const ev = life.events.find((e) => e.key === t.wait);
  if (!ev) return null;
  return { id: ev.id, open: modal?.k === "event" && modal.id === ev.id };
}

const TRAY: TutTarget = { sel: ".cq-tray-letter" };
/** An outcome's "Next: …" (the letter after it). */
const NEXT: TutTarget = { sel: ".cq-scene-actions .cq-btn", text: /^Next/ };
const LETTERS: TutTarget = { sel: ".cq-letters.has" };
const CHOICES: TutTarget = { sel: ".cq-scene-choices" };
const SKIP: TutTarget = { sel: ".cq-skip-btn" };
const PLAY: TutTarget = { sel: ".cq-pause.on" };
const SET_OUT: TutTarget = { sel: ".cq-travel-way button" };

/** A letter waiting: open it; open: what to do with it. */
function letterSay(
  ui: GameUi,
  life: Life,
  t: TutorialState,
  ctx: TutContext,
  title: string,
  text: string,
  over: string,
): Say | null {
  const l = letterOf(ui, life, t, ctx.modal);
  if (!l) return null;
  // Over what came of the last one: this one is next.
  const after = ctx.modal?.k === "outcome" || ctx.modal?.k === "interact";
  return {
    title,
    text,
    at: l.open ? [CHOICES] : after ? [NEXT, TRAY] : [TRAY, LETTERS],
    show: () => ui.modal({ k: "event", id: l.id }),
    over: after ? "A letter has come: Next opens it." : over,
  };
}

/** Back to Boston first (on the map, and its page). */
function homeFirst(ui: GameUi, title: string, why: string): Say {
  const home = provNamed(ui, TUT_HOME);
  return {
    title,
    text: html`${why} Click Boston (Massachusetts Bay) on the map, then
      <b>Set out</b>; ⏩ runs the road quickly.`,
    at: [SET_OUT, { prov: home }, SKIP],
    show: () => ui.focusProv(home),
  };
}

/** What the step now says, as the game stands. */
function stepSay(
  ui: GameUi,
  life: Life,
  t: TutorialState,
  step: TutStep,
  ctx: TutContext,
): Say {
  const me = meOf(ui.s, life);
  const cast = t.cast;
  const home = provNamed(ui, TUT_HOME);
  const errand = provNamed(ui, TUT_ERRAND);
  const atHome = life.prov === home && !life.travel;
  const master = fullOf(ui, cast.master, "your master");
  switch (step) {
    case "places": {
      if (!atHome && life.job?.prov !== life.prov)
        return homeFirst(
          ui,
          "Boston, May 1700",
          "Your work is in Boston, and you're not.",
        );
      return {
        title: "Boston, May 1700",
        text: html`You are ${me ? `${me.first} ${me.family}` : "a cooper"},
          twenty, a journeyman cooper at ${master}'s shop. The world waits while
          you look about. <b>Step into the workshops</b>, where you work: Here
          lists the town's places.`,
        at: [
          { sel: ".cq-area-tile:has(.cq-area-work)" },
          { sel: ".cq-tab", text: /^Here$/ },
        ],
        show: () => ui.open({ k: "tab", tab: "here" }),
      };
    }
    case "work":
      return {
        title: "Your work",
        text: html`Your days at the bench are worked for you, and wages come at
          the month's end. <b>Choose how hard you'll go at it</b> (Steady will
          do): harder brings promotion sooner, and more stress.`,
        at: [{ sel: ".cq-lv-effort" }, { sel: ".cq-tab", text: /^Work$/ }],
        show: () => ui.open({ k: "tab", tab: "work", sub: "job" }),
      };
    case "talk": {
      const name = firstOf(ui, cast.friend, "Your neighbour");
      const said = letterSay(
        ui,
        life,
        t,
        ctx,
        "A favour from next door",
        `${name} has a favour to ask, by letter. A letter stops the clock until you answer it: point at a choice for what it comes to.`,
        "Point at a choice (or tap it) for what it comes to, then choose.",
      );
      if (said) return said;
      const talking = ctx.modal?.k === "interact" && ctx.modal.act === "talk";
      return {
        title: `A word with ${name}`,
        text: html`That's ${fullOf(ui, cast.friend, "your neighbour")} at the
          next bench: he keeps the cooperage next to your master's.
          <b>Click him</b> to see what he thinks of you, then <b>Talk</b> to
          pass the time of day.`,
        at: talking
          ? [{ sel: ".cq-modal .cq-btn.primary" }]
          : [
              { sel: ".cq-interactions .cq-int", text: /^Talk/ },
              { sel: `li.cq-present-item[data-c="${cast.friend}"]` },
            ],
        // In the room (Here now): brought into view; elsewhere, his card.
        show: () => {
          if (
            !document.querySelector(
              `li.cq-present-item[data-c="${cast.friend}"]`,
            )
          )
            ui.open({ k: "char", c: cast.friend });
        },
        over: "Do it: a word costs nothing.",
      };
    }
    case "rival": {
      const said = letterSay(
        ui,
        life,
        t,
        ctx,
        "Trouble in the yard",
        `${firstOf(ui, cast.rival, "A rival")} has come about the Bristol hogsheads. A choice with a percentage is a test of skill: that's your chance, from your skill.`,
        "The percentage is your chance, from your skill. Point at a choice for what it comes to.",
      );
      return (
        said ?? {
          title: "Trouble in the yard",
          text: "A letter is on its way.",
          at: [TRAY],
        }
      );
    }
    case "map": {
      const there = ctx.cur?.k === "prov" && ctx.cur.p === errand;
      return {
        title: "An errand to Plymouth",
        text: html`${master} wants a cartload of barrels taken to Plymouth, a
          few days down the coast. Find <b>Plymouth</b> on the map, south of
          Boston, click it, then <b>Set out</b>. (Right-click it, or hold it,
          for the same.)`,
        at: there ? [SET_OUT] : [{ prov: errand }],
        show: () => ui.focusProv(errand),
      };
    }
    case "road": {
      const said = letterSay(
        ui,
        life,
        t,
        ctx,
        "Barrels for Plymouth",
        "The barrels are delivered. Answer the letter: a price on a choice is what it costs (yours is the purse up top).",
        "A coin on a choice is what it costs; your purse is up top.",
      );
      if (said) return said;
      const going = life.travel?.dest === errand;
      if (!going && !(life.prov === errand && !life.travel))
        return {
          title: "An errand to Plymouth",
          text: html`Plymouth is the place: click it on the map, then
            <b>Set out</b>.`,
          at: [SET_OUT, { prov: errand }],
          show: () => ui.focusProv(errand),
        };
      return {
        title: "Let the clock run",
        text: html`On the road. The world runs a day every three seconds at 1×;
          2×, 4× and 8× run faster. <b>Start the clock</b> with ▶ (or Space).`,
        at: [PLAY],
      };
    }
    case "home": {
      if (!atHome)
        return {
          ...homeFirst(
            ui,
            "Home, and pay day",
            "Now home to Boston for your wages.",
          ),
          text: html`Now home to Boston for your wages. Click Boston
            (Massachusetts Bay) on the map and <b>Set out</b>, then press
            <b>⏩</b>: it runs the quiet days until something needs you.`,
          at: life.travel ? [SKIP] : [SET_OUT, { prov: home }],
        };
      return {
        title: "Pay day",
        text: html`Wages come at the month's end. Press <b>⏩</b>: it runs the
          quiet days until something needs you, and stops for pay day.`,
        at: [SKIP],
      };
    }
    case "family": {
      const said = letterSay(
        ui,
        life,
        t,
        ctx,
        "Supper at your mother's",
        "Your wages are in: point at your purse up top for the month's money, in and out. And your mother wants you at supper.",
        "Pay day: your wages are in the purse, up top. Family matters too: what you choose here changes what they think of you.",
      );
      if (said) return said;
      if (!atHome)
        return homeFirst(
          ui,
          "Supper at your mother's",
          "Your mother wants you at supper.",
        );
      return {
        title: "Supper at your mother's",
        text: "Your mother's letter is on its way.",
        at: [TRAY],
      };
    }
    case "aim":
      return {
        title: "Something to aim at",
        text: html`An ambition gives the years a shape, and reaching it is worth
          renown. <b>Choose one</b> on You › Ambition (Rise in your trade would
          make you a master). What happens to you is kept in Journal › Diary.`,
        at: [
          {
            sel: ".cq-ambitions li",
            text: /^Rise in your trade/,
            pick: "button",
          },
          { sel: "details.cq-more > summary", text: /^Set your heart on/ },
          { sel: ".cq-subtab", text: /^Ambition/ },
          { sel: ".cq-tab", text: /^You$/ },
        ],
        show: () => {
          ui.open({ k: "tab", tab: "you", sub: "ambition" });
          // The list of ambitions opens with it.
          setTimeout(() => {
            const d = document
              .querySelector(".cq-ambitions")
              ?.closest("details");
            if (d) d.open = true;
          }, 60);
        },
      };
    case "birthday": {
      const said = letterSay(
        ui,
        life,
        t,
        ctx,
        "Twenty-one",
        "Every year you age. From about forty-five the most your health can be starts to fall, and stress makes every hurt worse: keep it under 70.",
        "Every year you age: from about forty-five your health begins to fail, and stress makes every hurt worse. Choose how to spend the day.",
      );
      if (said) return said;
      return {
        title: "A year older",
        text: html`Your twenty-first birthday is on ${formatDate(t.birthday)}.
          Press <b>⏩</b> to skip ahead to it.`,
        at: [SKIP],
      };
    }
    case "heir":
      return {
        title: "When you die",
        text: html`Nobody lives for ever. When you die you carry on as your
          heir: your eldest child, unless you name another. No child yet, and
          your line ends with you, so you'll want to marry.
          <b>Open You › Family</b> to see who's yours.`,
        at: [
          { sel: ".cq-subtab", text: /^Family/ },
          { sel: ".cq-tab", text: /^You$/ },
        ],
        show: () => ui.open({ k: "tab", tab: "you", sub: "family" }),
      };
  }
}

// ---------------------------------------------------------------- the card

/** Asking whether to leave the lessons, and the card folded down to a line (a phone). */
let asking = false;
let folded = false;
/** The step whose page-looked-at has been sent (once a step). */
let sawSent = -1;

/** Tell the engine a page the step asks to look at is open (the heir's). */
export function tutorialSaw(ui: GameUi, cur: DrawerView | undefined): void {
  const life = ui.life;
  const t = life?.tut;
  if (!life || !t || t.over || ui.watcher) return;
  if (TUTORIAL_STEPS[t.step] !== "heir" || sawSent === t.step) return;
  if (cur?.k === "tab" && cur.tab === "you" && subOf(cur) === "family") {
    sawSent = t.step;
    void ui.cmd({ k: "tut", act: "saw", what: "heir" });
  }
}

/** The lessons on screen: the card (or the line over a letter), and the ring. */
export function tutorialLayer(ui: GameUi, ctx: TutContext): TemplateResult {
  const life = ui.life;
  const t = life?.tut;
  if (!life || !t || ui.watcher || life.watching) return html``;
  if (t.over)
    return t.over.how === "done" && !t.closed ? endCard(ui, t, ctx) : html``;
  const step = tutStep(life);
  if (!step) return html``;
  const say = stepSay(ui, life, t, step, ctx);
  const n = t.step + 1;
  // A letter (or another window) open: the card makes way.
  const letterOpen =
    ctx.modal?.k === "event" ||
    ctx.modal?.k === "outcome" ||
    ctx.modal?.k === "interact";
  const other = !!ctx.modal && !letterOpen;
  if (other) return html``;
  // What came of a letter, and nothing of the step's own to say over it
  // (its next is on the page behind): stand aside until it's put away.
  if (letterOpen && !say.over) return html``;
  if (letterOpen)
    return html`${say.over
        ? html`<div class="cq-tut-over" role="status">
            <span class="cq-tut-kicker"
              >First life · ${n} of ${TUT_STEP_COUNT}</span
            >
            ${say.over}
          </div>`
        : nothing} <cq-tut-ring .at=${say.at}></cq-tut-ring>`;
  const skip = () => {
    asking = false;
    void ui.cmd({ k: "tut", act: "skip", step: t.step });
  };
  return html`<aside
      class="cq-tut ${folded ? "folded" : ""}"
      aria-label="First life: what to do now"
    >
      <div class="cq-tut-top">
        <span class="cq-tut-kicker"
          >First life · ${n} of ${TUT_STEP_COUNT}</span
        >
        <span class="cq-tut-dots" aria-hidden="true"
          >${TUTORIAL_STEPS.map(
            (_, i) =>
              html`<i
                class=${i < t.step ? "done" : i === t.step ? "now" : ""}
              ></i>`,
          )}</span
        >
        <button
          class="cq-tut-fold"
          aria-label=${folded ? "Open the lesson" : "Fold the lesson away"}
          title=${folded ? "Open the lesson" : "Fold it away"}
          @click=${() => {
            folded = !folded;
            ui.redraw();
          }}
        >
          ${folded ? "▴" : "▾"}
        </button>
        <button
          class="cq-tut-x"
          aria-label="Leave the lessons"
          title="Leave the lessons"
          @click=${() => {
            asking = !asking;
            folded = false;
            ui.redraw();
          }}
        >
          ×
        </button>
      </div>
      <h3 class="cq-tut-title">${say.title}</h3>
      ${folded
        ? nothing
        : asking
          ? html`<p class="cq-tut-text">
                Leave the lessons? ${me(ui)}'s life goes on as a normal game.
              </p>
              <div class="cq-tut-acts">
                <button
                  class="cq-btn small"
                  @click=${() => {
                    asking = false;
                    void ui.cmd({ k: "tut", act: "leave" });
                  }}
                >
                  Leave them
                </button>
                <button
                  class="cq-btn small quiet"
                  @click=${() => {
                    asking = false;
                    ui.redraw();
                  }}
                >
                  Stay
                </button>
              </div>`
          : html`<p class="cq-tut-text">${say.text}</p>
              <div class="cq-tut-acts">
                ${say.show
                  ? html`<button
                      class="cq-btn small primary"
                      @click=${() => {
                        say.show!();
                        ring.pulse();
                      }}
                    >
                      Show me
                    </button>`
                  : nothing}
                <button class="cq-btn small quiet" @click=${skip}>
                  Skip step
                </button>
              </div>`}
    </aside>
    <cq-tut-ring .at=${say.at}></cq-tut-ring>`;
}

function me(ui: GameUi): string {
  return ui.me?.first ?? "This";
}

/** The end: First life, and where next. */
function endCard(
  ui: GameUi,
  t: TutorialState,
  ctx: TutContext,
): TemplateResult {
  const mine = ui.me;
  const name = mine?.first ?? "this life";
  const female = !!mine?.female;
  const close = () => void ui.cmd({ k: "tut", act: "close" });
  return html`<aside class="cq-tut end" aria-label="First life: the end">
    <div class="cq-tut-top">
      <span class="cq-tut-kicker">First life · done</span>
      <span class="cq-tut-dots" aria-hidden="true"
        >${TUTORIAL_STEPS.map(() => html`<i class="done"></i>`)}</span
      >
    </div>
    <h3 class="cq-tut-title">Your life is yours</h3>
    <p class="cq-tut-text">
      That's the ropes. A master's shop to work towards, a sweetheart to find,
      and seventy-six years of history still to come. Anything else is under
      <b>I want to…</b> and the <b>?</b> on every page.
    </p>
    <p class="cq-tut-pay">
      ${!tutEarned(t)
        ? html`<b>First life</b> is for doing the lessons: you skipped
            ${t.skipped.length} of ${TUT_STEP_COUNT}, and it allows
            ${TUT_STEP_COUNT - TUT_EARN_DONE}. Play it again to earn it
            (${FIRST_LIFE_COINS} Derp Coins, once).`
        : ctx.signedIn
          ? html`<b>First life:</b> ${FIRST_LIFE_COINS} Derp Coins on your
              account (once).`
          : html`Signed in, finishing it pays ${FIRST_LIFE_COINS} Derp Coins
            (once).`}
    </p>
    <div class="cq-tut-acts end">
      <button class="cq-btn small primary" @click=${close}>
        Carry on as ${name}
      </button>
      <button class="cq-btn small" @click=${() => ctx.fresh()}>
        A fresh life
      </button>
      <button class="cq-btn small quiet" @click=${() => ctx.again(female)}>
        Play it again
      </button>
    </div>
  </aside>`;
}

// ---------------------------------------------------------------- the ring

/** The ring's one element, to pulse it from "Show me". */
const ring = {
  el: null as TutRing | null,
  pulse(): void {
    this.el?.pulse();
  },
};

/**
 * A soft gold ring round the first of the targets on the screen, following
 * it as the page scrolls (a frame at a time while there's one to follow).
 */
@customElement("cq-tut-ring")
export class TutRing extends LitElement {
  @property({ attribute: false }) at: TutTarget[] = [];
  private frame = 0;
  private box: HTMLDivElement | null = null;
  private last = "";

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    ring.el = this;
    const loop = () => {
      this.frame = requestAnimationFrame(loop);
      this.place();
    };
    this.frame = requestAnimationFrame(loop);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    cancelAnimationFrame(this.frame);
    if (ring.el === this) ring.el = null;
  }

  render(): TemplateResult {
    return html`<div class="cq-tut-ring" aria-hidden="true"></div>`;
  }

  pulse(): void {
    const b = this.box;
    if (!b) return;
    b.classList.remove("again");
    void b.offsetWidth;
    b.classList.add("again");
    // Bring it into view (after the page it's on has opened), wherever it
    // is on the page.
    setTimeout(() => {
      const el = this.findBox(true)?.el;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  }

  /**
   * The first target that's on the screen (an element, or a place on the
   * map); `anywhere`: or scrolled out of sight on its page.
   */
  private findBox(
    anywhere = false,
  ): { el: HTMLElement | null; r: DOMRectReadOnly } | null {
    for (const t of this.at) {
      if ("prov" in t) {
        const pt = tutMap.point?.(t.prov);
        // Only where the map itself shows (not under a page, a sheet or the card).
        const on = pt && document.elementFromPoint(pt.x, pt.y);
        if (pt && on instanceof Element && on.closest(".cq-map-host"))
          return { el: null, r: new DOMRect(pt.x - 20, pt.y - 20, 40, 40) };
        continue;
      }
      for (const found of document.querySelectorAll<HTMLElement>(t.sel)) {
        if (t.text && !t.text.test((found.textContent ?? "").trim())) continue;
        const el = t.pick
          ? found.querySelector<HTMLElement>(t.pick)
          : (found as HTMLElement | null);
        if (!el) continue;
        const whole = el.getBoundingClientRect();
        if (whole.width < 2 || whole.height < 2) continue;
        if (anywhere) return { el, r: whole };
        // Only the part that's in sight (a page scrolls, a window has edges).
        const r = inSight(el, whole);
        if (r) return { el, r };
      }
    }
    return null;
  }

  private place(): void {
    this.box ??= this.querySelector(".cq-tut-ring");
    const b = this.box;
    if (!b) return;
    const hit = this.findBox();
    if (!hit) {
      if (this.last !== "") {
        b.style.display = "none";
        this.last = "";
      }
      return;
    }
    const r = hit.r;
    const pad = hit.el ? 5 : 0;
    const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
    if (key === this.last) return;
    this.last = key;
    b.classList.toggle("spot", !hit.el);
    b.style.display = "block";
    b.style.left = `${r.left - pad}px`;
    b.style.top = `${r.top - pad}px`;
    b.style.width = `${r.width + pad * 2}px`;
    b.style.height = `${r.height + pad * 2}px`;
  }
}

/** The boxes round an element that scroll or clip it (looked up once an element). */
const clippers = new WeakMap<HTMLElement, HTMLElement[]>();
function clippersOf(el: HTMLElement): HTMLElement[] {
  let list = clippers.get(el);
  if (list) return list;
  list = [];
  for (
    let p = el.parentElement;
    p && p !== document.body;
    p = p.parentElement
  ) {
    const st = getComputedStyle(p);
    if (st.overflowY !== "visible" || st.overflowX !== "visible") list.push(p);
  }
  clippers.set(el, list);
  return list;
}

/**
 * The part of an element that can be seen: cut to the boxes that scroll or
 * clip it, and to the window; null if too little of it shows.
 */
function inSight(el: HTMLElement, r: DOMRect): DOMRect | null {
  let top = Math.max(r.top, 0);
  let left = Math.max(r.left, 0);
  let bottom = Math.min(r.bottom, innerHeight);
  let right = Math.min(r.right, innerWidth);
  for (const p of clippersOf(el)) {
    const b = p.getBoundingClientRect();
    top = Math.max(top, b.top);
    left = Math.max(left, b.left);
    bottom = Math.min(bottom, b.bottom);
    right = Math.min(right, b.right);
  }
  if (bottom - top < 10 || right - left < 10) return null;
  return new DOMRect(left, top, right - left, bottom - top);
}

declare global {
  interface HTMLElementTagNameMap {
    "cq-tut-ring": TutRing;
  }
}
