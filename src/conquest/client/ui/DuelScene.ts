// HOME (r12): a duel's scenes. The same stage as every scene (the painted
// ground, you on the left and your opponent on the right), with the steps of
// an affair of honour along the top (the challenge, the weapons, the field,
// the exchanges, the outcome), the weapons and the wounds so far, what just
// happened, and the choices with their odds; point at the odds for why.

import { html, nothing, TemplateResult } from "lit";
import {
  DOWN,
  duelChoicesShown,
  duelOdds,
  type DuelMove,
} from "../../engine/Duels";
import { charName } from "../../engine/Queries";
import type { LifeEventPending } from "../../engine/Types";
import { play } from "../Sound";
import { num } from "../Tip";
import { breakdownTip, GameUi } from "./Context";
import { letterClock, ModalHooks } from "./Modals";
import { curly, shell, stage } from "./Scene";

const STEPS: [string, string][] = [
  ["duel-call", "The challenge"],
  ["duel-weapons", "The weapons"],
  ["duel-dawn", "The field"],
  ["duel-exchange", "The exchanges"],
  ["duel-outcome", "After"],
];

/** The moves behind an exchange's choices, by their place in the list. */
const MOVES: (DuelMove | null)[] = [
  null,
  "guard",
  "press",
  "feint",
  "aim",
  "snap",
  "delope",
  null,
];

function wounds(n: number, who: string): TemplateResult {
  const f = Math.min(1, n / 70);
  const word =
    n <= 0
      ? "unhurt"
      : n < 15
        ? "scratched"
        : n < DOWN
          ? "wounded"
          : n < 60
            ? "badly hurt"
            : "gravely hurt";
  return html`<span
    class="cq-duel-wound ${n >= DOWN ? "bad" : n > 0 ? "hurt" : ""}"
  >
    <b>${who}</b>
    <span class="cq-duel-blood" aria-hidden="true"
      ><i style="width:${Math.round(f * 100)}%"></i
    ></span>
    <span class="small">${word}</span>
  </span>`;
}

function weaponIcon(w: number): TemplateResult {
  return w === 2
    ? html`<svg viewBox="0 0 40 20" class="cq-duel-icon" aria-hidden="true">
        <path
          d="M3 8 H26 L30 6 H36 V11 H28 L24 13 L22 18 H16 L18 12 H8 Z"
          fill="#3a2716"
        />
        <circle cx="31" cy="8.5" r="1.2" fill="#c99b3a" />
      </svg>`
    : html`<svg viewBox="0 0 40 40" class="cq-duel-icon" aria-hidden="true">
        <path
          d="M6 6 L30 30 M34 6 L10 30"
          stroke="#3a2716"
          stroke-width="2.2"
          stroke-linecap="round"
        />
        <path
          d="M26 34 L34 26 M6 26 L14 34"
          stroke="#c99b3a"
          stroke-width="3"
          stroke-linecap="round"
        />
      </svg>`;
}

export function duelScene(
  ui: GameUi,
  ev: LifeEventPending,
  hooks: ModalHooks,
): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const ctx = ev.ctx;
  const foe = s.chars[ctx.c];
  const step = STEPS.findIndex(([k]) => k === ev.key);
  const report = ev.key === "duel-report";
  const shown = report ? [0] : duelChoicesShown(ev.key, ctx);
  const scene = ev.scene ?? "duel";
  const second = s.chars[ctx.sec];
  // What came of the last choice, if it was this duel's.
  const o = life.outcome;
  const last =
    o && o.key.startsWith("duel-") && o.day >= ev.day - 1 && !report
      ? o.lines.filter((l) => !/: it (went|didn't go) your way\.$/.test(l))
      : [];
  const me = ctx.mw >= DOWN ? "worried" : ctx.mw > 0 ? "frown" : "neutral";
  const them =
    ev.key === "duel-outcome" && ctx.res > 0
      ? "worried"
      : ctx.fw > 0
        ? "frown"
        : "angry";
  const answer = async (i: number) => {
    if (await ui.cmd({ k: "event", id: ev.id, choice: i })) {
      play("seal");
      const next = ui.life?.events.find(
        (e) => e.key.startsWith("duel-") && e.id !== ev.id,
      );
      ui.modal(next ? { k: "event", id: next.id } : { k: "outcome" });
    }
  };
  return shell(
    html`${stage(ui, {
        scene,
        other: foe,
        me,
        them,
        day: ev.day,
      })}
      ${report
        ? nothing
        : html`<ol class="cq-duel-steps" aria-label="The affair of honour">
            ${STEPS.map(
              ([, name], i) =>
                html`<li
                  class=${i < step ? "done" : i === step ? "now" : ""}
                  aria-current=${i === step ? "step" : "false"}
                >
                  ${name}
                </li>`,
            )}
          </ol>`}
      <div class="cq-scene-ribbon"><h2>${ev.title}</h2></div>
      ${ctx.w || second
        ? html`<div class="cq-duel-state">
            ${ctx.w
              ? html`<span class="cq-duel-weapon"
                  >${weaponIcon(ctx.w)}
                  ${ctx.w === 2 ? "Pistols" : "Smallswords"}${ctx.fb
                    ? ", to first blood"
                    : ""}</span
                >`
              : nothing}
            ${ctx.w ? wounds(ctx.mw ?? 0, "You") : nothing}
            ${ctx.w && foe ? wounds(ctx.fw ?? 0, foe.first) : nothing}
            ${second
              ? html`<span class="cq-duel-second small"
                  >Your second: ${charName(second)}</span
                >`
              : ctx.sec === -1 && step >= 1
                ? html`<span class="cq-duel-second small">No second</span>`
                : nothing}
          </div>`
        : nothing}
      ${last.length
        ? html`<div class="cq-duel-last">
            ${last.map((l) => html`<p>${curly(l)}</p>`)}
          </div>`
        : nothing}
      <div class="cq-scene-text">
        ${ev.body.split("\n").map((p) => html`<p>${curly(p)}</p>`)}
      </div>
      <ol class="cq-scene-choices cq-duel-choices">
        ${shown.map((i) => {
          const c = ev.choices[i];
          if (!c) return nothing;
          const move = ev.key === "duel-exchange" ? MOVES[i] : null;
          const odds =
            move && move !== "delope" ? duelOdds(s, life, ctx, move) : null;
          // The odds are in the label already ("Press the attack (62%)").
          const label = odds ? c.label.replace(/\s*\(\d+%\)$/, "") : c.label;
          const why = / \(([^)]+)\.\)$/.exec(c.tip)?.[1];
          return html`<li>
            <button
              class="cq-choice ${why ? "blocked" : ""}"
              ?disabled=${!!why}
              @click=${() => void answer(i)}
            >
              <span class="cq-choice-label">${curly(label)}</span>
              ${odds
                ? num(
                    `${Math.round(odds.chance * 100)}%`,
                    () => breakdownTip("Your odds, and why", odds.why),
                    `cq-odds ${odds.chance >= 0.65 ? "good" : odds.chance < 0.4 ? "bad" : ""}`,
                  )
                : nothing}
              <span class="cq-choice-tip">${curly(c.tip)}</span>
            </button>
          </li>`;
        })}
      </ol>
      <div class="cq-scene-foot">
        <p class="cq-muted small">
          ${letterClock(hooks, ev.id, "the seconds decide")}
        </p>
        <button class="cq-btn quiet small" @click=${() => ui.modal(null)}>
          Decide later
        </button>
      </div>`,
    scene,
    ev.key,
  );
}
