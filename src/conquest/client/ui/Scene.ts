// Scenes, Crusader Kings fashion. Whatever happens (an event, a word with
// someone, a night in the tavern) is staged: a painted backdrop of where it
// happens, you on the left and the other on the right, both large, looking
// as they feel about it; a title on a ribbon, the words, and the choices,
// each with what it'll do and the odds. It eases in, the backdrop drifts
// with the pointer, the light breathes, and it opens with a sound.

import { html, nothing, TemplateResult } from "lit";
import { findIn } from "../../engine/Areas";
import { formatDate } from "../../engine/Calendar";
import {
  GROUP_NAMES,
  INTERACTIONS,
  interactionView,
} from "../../engine/Interactions";
import { carried, lifeOfChar, opinionOf } from "../../engine/LifeQueries";
import { PLACES } from "../../engine/LifeRules";
import { ageOf, charName } from "../../engine/Queries";
import type {
  Breakdown,
  Character,
  Good,
  PersonAct,
  PlaceKind,
} from "../../engine/Types";
import { GOODS } from "../../engine/Types";
import type { PortraitOpts } from "../Portrait";
import { portrait } from "../Portrait";
import { indoors, sceneArt, sceneSound } from "../SceneArt";
import { play } from "../Sound";
import { GOOD_NAMES } from "../Text";
import type { GameUi } from "./Context";
import { roleOf } from "./Here";
import { letterClock, ModalHooks } from "./Modals";

type Expr = NonNullable<PortraitOpts["expression"]>;

const SPECIAL: Record<string, string> = {
  road: "On the road",
  deck: "At sea",
  battle: "The field of battle",
  rising: "The rising",
  letter: "A letter",
  parliament: "Westminster",
  court: "At court, in Europe",
  duel: "At dawn",
};

/** Where a scene is, in words: "The tavern, Jamestown". */
function placeLine(ui: GameUi, scene: string): string {
  const life = ui.life;
  const prov = life ? ui.map.provinces[life.prov]?.name : "";
  if (SPECIAL[scene]) return SPECIAL[scene];
  const def = PLACES[scene as PlaceKind];
  if (!def) return prov ?? "";
  const owner = life ? ui.s.provinces[life.prov]?.owner : -1;
  const native =
    owner !== undefined && owner >= 0 && ui.s.nations[owner]?.kind === "native";
  const name = native && def.nativeName ? def.nativeName : def.name;
  return scene === "home" ? `${name}, ${prov}` : `${name}, ${prov}`;
}

function figure(
  ui: GameUi,
  c: Character | undefined,
  side: "you" | "them",
  expr: Expr,
  reaction?: string,
): TemplateResult {
  if (!c) return html`<div class="cq-scene-figure ${side} empty"></div>`;
  const n = ui.s.nations[c.nation];
  const played = lifeOfChar(ui.s, c.id);
  const role = side === "you" ? "You" : roleOf(ui, c);
  return html`<div
    class="cq-scene-figure ${side} expr-${expr}"
    style=${played ? `--frame:${played.frame}` : ""}
  >
    ${portrait(
      c,
      {
        age: ageOf(ui.s, c),
        color: n?.color ?? "#6b4f33",
        native: n?.kind === "native" || c.religion === "native",
        facing: side === "you" ? "right" : "left",
        expression: expr,
        size: "xl",
        // ART (r11): the sitter cut out of their painting, over the scene.
        bare: true,
      },
      "scene",
    )}
    ${reaction
      ? html`<span class="cq-reaction ${expr}">${reaction}</span>`
      : nothing}
    <span class="cq-nameplate">
      <b>${charName(c)}</b>
      <small>${role}${role ? ", " : ""}${ageOf(ui.s, c)}</small>
    </span>
  </div>`;
}

/** Move the backdrop a little against the pointer. */
function parallax(e: PointerEvent): void {
  const el = e.currentTarget as HTMLElement;
  const r = el.getBoundingClientRect();
  const mx = ((e.clientX - r.left) / r.width) * 2 - 1;
  const my = ((e.clientY - r.top) / r.height) * 2 - 1;
  el.style.setProperty("--mx", mx.toFixed(3));
  el.style.setProperty("--my", my.toFixed(3));
}

/** The stage: backdrop, light, the two of you, where and when. */
function stage(
  ui: GameUi,
  o: {
    scene: string;
    other?: Character;
    me: Expr;
    them: Expr;
    day: number;
    meSays?: string;
    themSays?: string;
  },
): TemplateResult {
  const art = sceneArt(o.scene);
  return html`<div
    class="cq-scene-stage ${indoors(o.scene) ? "indoors" : "outdoors"}"
    @pointermove=${parallax}
  >
    <div
      class="cq-scene-bg"
      style=${art ? `background-image:url(${art})` : ""}
    ></div>
    <div class="cq-scene-light"></div>
    ${figure(ui, ui.me ?? undefined, "you", o.me, o.meSays)}
    ${figure(ui, o.other, "them", o.them, o.themSays)}
    <p class="cq-scene-where">
      ${placeLine(ui, o.scene)}<span> · ${formatDate(o.day)}</span>
    </p>
  </div>`;
}

function shell(
  body: TemplateResult,
  scene: string,
  key: string,
): TemplateResult {
  return html`<div class="cq-scene scene-${scene}" data-key=${key}>
    ${body}
  </div>`;
}

/** Straight quotes made curly, as a printer would set them. */
export function curly(t: string): string {
  return t
    .replace(/(^|[\s([—-])"/g, "$1\u201c")
    .replace(/"/g, "\u201d")
    .replace(/(^|[\s([—-])'/g, "$1\u2018")
    .replace(/'/g, "\u2019");
}

/**
 * A breakdown as a short list: "+10 Hands are wanted". With `rows`, exactly
 * that many lines (the biggest reasons; blank lines to fill), so the list
 * keeps its height while opinions drift.
 */
export function reasons(
  b: Breakdown | null,
  max = 8,
  rows?: number,
): TemplateResult {
  if ((!b || !b.parts.length) && !rows) return html``;
  const parts = [...(b?.parts ?? [])]
    .filter((p) => !p.mul)
    .sort((a, x) => Math.abs(x.value) - Math.abs(a.value))
    .slice(0, rows ?? max);
  const pad = rows ? Math.max(0, rows - parts.length) : 0;
  return html`<ul class="cq-why-list">
    ${parts.map(
      (p) =>
        html`<li
          class=${p.value > 0 ? "good" : p.value < 0 ? "bad" : ""}
          title=${p.label}
        >
          <span class="n"
            >${p.value > 0 ? "+" : p.value < 0 ? "−" : ""}${Math.abs(
              Math.round(p.value),
            )}</span
          >
          <span>${p.label}</span>
        </li>`,
    )}
    ${Array.from(
      { length: pad },
      () => html`<li class="blank" aria-hidden="true">&nbsp;</li>`,
    )}
  </ul>`;
}

/** Reasons in a scene that keeps its size while it's open. */
function reasonCount(b: Breakdown | null): number {
  return Math.min(8, (b?.parts ?? []).filter((p) => !p.mul).length);
}

/**
 * What a scene looked like when it opened (its backdrop, how many reasons it
 * lists), kept while it stays open so it doesn't change under you.
 */
let frozen: { key: string; scene: string; rows: number } | null = null;

// ---------------------------------------------------------------- events

let lastSound = "";

function cue(scene: string, key: string): void {
  if (lastSound === key) return;
  lastSound = key;
  play(sceneSound(scene));
}

export function eventScene(
  ui: GameUi,
  id: number,
  hooks: ModalHooks,
): TemplateResult {
  const life = ui.life;
  const ev = life?.events.find((e) => e.id === id);
  if (!life || !ev) return outcomeScene(ui);
  const scene = ev.scene ?? "home";
  const other = ev.c !== undefined && ev.c >= 0 ? ui.s.chars[ev.c] : undefined;
  cue(scene, `ev:${ev.id}`);
  const others = life.events.filter((e) => e.id !== id).length;
  const worried =
    /fever|smallpox|sick|fire|storm|bandit|wolves|lost|dismiss|where|nemesis|challenge|caught|hunted|informed/i.test(
      ev.key,
    );
  return shell(
    html`${stage(ui, {
        scene,
        other,
        me: worried ? "worried" : "neutral",
        them: ev.key.startsWith("p2p-") ? "smile" : "neutral",
        day: ev.day,
      })}
      <div class="cq-scene-ribbon"><h2>${ev.title}</h2></div>
      <div class="cq-scene-text">
        ${ev.body.split("\n").map((p) => html`<p>${curly(p)}</p>`)}
      </div>
      <ol class="cq-scene-choices">
        ${ev.choices.map(
          (c, i) =>
            html`<li>
              <button
                class="cq-choice"
                @click=${async () => {
                  if (await ui.cmd({ k: "event", id, choice: i })) {
                    play("seal");
                    ui.modal({ k: "outcome" });
                  }
                }}
              >
                <span class="cq-choice-label">${c.label}</span>
                ${c.tip
                  ? html`<span class="cq-choice-tip">${c.tip}</span>`
                  : nothing}
              </button>
            </li>`,
        )}
      </ol>
      <div class="cq-scene-foot">
        <p class="cq-muted small">
          ${letterClock(
            hooks,
            id,
            ev.choices.length === 1
              ? "it's read and put away"
              : ev.key.startsWith("p2p-") && ev.key !== "p2p-reply"
                ? "it's taken as a no"
                : ev.key === "europe-invite" || ev.key === "movement-hour"
                  ? "you'll wait and see"
                  : "the first course is taken",
          )}
          ${others > 0 ? html`${others} more waiting.` : nothing}
        </p>
        <button class="cq-btn quiet small" @click=${() => ui.modal(null)}>
          Decide later
        </button>
      </div>`,
    scene,
    ev.key,
  );
}

// ---------------------------------------------------------------- interactions

const GIFTS = [2, 5, 10, 25, 50, 100];
let tradeDraft: { good: Good | ""; price: number } = { good: "", price: 0 };

export function interactScene(
  ui: GameUi,
  m: { c: number; act: PersonAct; arg?: number },
): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const c = s.chars[m.c];
  const def = INTERACTIONS[m.act];
  if (!life || !ui.me || !c || !def)
    return html`<p class="cq-muted">They're gone.</p>`;
  const v = interactionView(s, ui.w, life, c.id, m.act, m.arg);
  const at = findIn(s, ui.w, life.prov, c.id, s.day, life);
  const fkey = `${ui.modalSeq}|${m.c}|${m.act}|${m.arg ?? ""}`;
  if (frozen?.key !== fkey)
    frozen = {
      key: fkey,
      scene: at?.area ?? life.area ?? "tavern",
      rows: reasonCount(v.mode === "chance" ? v.odds : v.accept),
    };
  const scene = frozen.scene;
  const rows = frozen.rows;
  cue(scene, `in:${c.id}:${m.act}`);
  const op = opinionOf(s, c, life).total;
  const them: Expr = v.player
    ? "neutral"
    : v.will === true
      ? "smile"
      : v.will === false
        ? "frown"
        : op <= -30
          ? "angry"
          : op >= 30
            ? "smile"
            : "neutral";
  const run = async (arg?: number, extra?: { good?: Good; qty?: number }) => {
    if (
      await ui.cmd({
        k: "person",
        c: c.id,
        act: m.act,
        arg: arg ?? m.arg,
        ...(extra ?? {}),
      })
    ) {
      play("seal");
      ui.modal({ k: "outcome" });
    }
  };
  const title = v.label ?? def.label;
  const verdict = v.player
    ? html`<div class="cq-accept player">
        <span class="cq-accept-verdict">${c.first} will decide</span>
        <span class="cq-muted small"
          >Another player: they'll get this as a scene to accept or
          refuse.</span
        >
      </div>`
    : v.mode === "accept" && v.accept
      ? html`<div class="cq-accept ${v.will ? "will" : "wont"}">
          <span class="cq-accept-verdict"
            >${v.will ? "Will accept" : "Will refuse"}</span
          >
          <span class="cq-accept-score"
            >${v.accept.total > 0 ? "+" : ""}${v.accept.total}</span
          >
          ${reasons(v.accept, 8, rows)}
        </div>`
      : v.mode === "chance" && v.chance !== null
        ? html`<div class="cq-accept chance">
            <span class="cq-accept-verdict">A roll of the dice</span>
            <span class="cq-accept-score">${Math.round(v.chance * 100)}%</span>
            ${reasons(v.odds, 8, rows)}
          </div>`
        : nothing;
  let action: TemplateResult;
  if (!v.check.ok)
    action = html`<p class="cq-why">${v.check.why}</p>
      <button class="cq-btn" @click=${() => ui.modal(null)}>Back</button>`;
  else if (m.act === "gift" && !v.player)
    action = html`<div class="cq-gift-row">
        ${GIFTS.map(
          (n) =>
            html`<button
              class="cq-btn primary"
              ?disabled=${life.purse < n}
              @click=${() => run(n)}
            >
              ${n} coins
            </button>`,
        )}
      </div>
      <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
        Back
      </button>`;
  else if (m.act === "trade") {
    const goods = (Object.entries(life.goods) as [Good, number][]).filter(
      ([, n]) => n > 0,
    );
    if (!tradeDraft.good || !goods.some(([g]) => g === tradeDraft.good))
      tradeDraft = {
        good: goods[0]?.[0] ?? "",
        price: goods[0] ? goods[0][1] * 2 : 0,
      };
    const have = tradeDraft.good ? (life.goods[tradeDraft.good] ?? 0) : 0;
    action = goods.length
      ? html`<div class="cq-trade-offer">
            <label
              >Sell
              <select
                @change=${(e: Event) => {
                  tradeDraft.good = (e.target as HTMLSelectElement)
                    .value as Good;
                  ui.redraw();
                }}
              >
                ${goods.map(
                  ([g, n]) =>
                    html`<option value=${g} ?selected=${g === tradeDraft.good}>
                      ${n} ${GOOD_NAMES[g].toLowerCase()}
                    </option>`,
                )}
              </select></label
            >
            <label
              >for
              <input
                type="number"
                min="0"
                max="999"
                .value=${String(tradeDraft.price)}
                @input=${(e: Event) =>
                  (tradeDraft.price = Math.max(
                    0,
                    Number((e.target as HTMLInputElement).value) || 0,
                  ))}
              />
              coins</label
            >
          </div>
          <button
            class="cq-btn primary"
            @click=${() =>
              run(tradeDraft.price, {
                good: tradeDraft.good as Good,
                qty: have,
              })}
          >
            Make the offer
          </button>
          <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
            Back
          </button>`
      : html`<p class="cq-why">You're carrying nothing to sell.</p>
          <button class="cq-btn" @click=${() => ui.modal(null)}>Back</button>`;
  } else
    action = html`<button
        class="cq-btn primary ${v.will === false ? "risky" : ""}"
        @click=${() => run()}
      >
        ${v.player
          ? "Put it to them"
          : def.mode === "accept"
            ? v.will
              ? "Ask"
              : "Ask anyway"
            : def.mode === "chance"
              ? "Try it"
              : "Do it"}
      </button>
      <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
        Back
      </button>`;
  void GOODS;
  void carried;
  return shell(
    html`${stage(ui, {
        scene,
        other: c,
        me: "neutral",
        them,
        day: s.day,
        themSays: at ? at.doing : undefined,
      })}
      <div class="cq-scene-ribbon">
        <h2>${title}</h2>
        <span class="cq-scene-group">${GROUP_NAMES[def.group]}</span>
      </div>
      <div class="cq-scene-text">
        <p>${def.text}</p>
      </div>
      ${verdict}
      <div class="cq-scene-actions">${action}</div>`,
    scene,
    `in:${m.act}`,
  );
}

// ---------------------------------------------------------------- what happened

const HOSTILE: string[] = ["insult", "rumour", "duel"];

export function outcomeScene(ui: GameUi): TemplateResult {
  const life = ui.life;
  const o = life?.outcome;
  if (!life || !o)
    return html`<p class="cq-muted">Nothing to see.</p>
      <div class="cq-btnrow end">
        <button class="cq-btn" @click=${() => ui.modal(null)}>Close</button>
      </div>`;
  const other = o.c >= 0 ? ui.s.chars[o.c] : undefined;
  const hostile = HOSTILE.includes(o.key);
  const me: Expr = o.ok === false ? "worried" : o.ok ? "smile" : "neutral";
  const them: Expr = hostile
    ? "angry"
    : o.ok === false
      ? o.kind === "person"
        ? "frown"
        : "neutral"
      : o.ok
        ? "smile"
        : "neutral";
  cue(o.scene, `out:${o.n}`);
  const next = life.events[0];
  return shell(
    html`${stage(ui, {
        scene: o.scene,
        other,
        me,
        them,
        day: o.day,
        meSays:
          o.ok === true
            ? "It went well"
            : o.ok === false
              ? "It went badly"
              : undefined,
      })}
      <div
        class="cq-scene-ribbon ${o.ok === true
          ? "good"
          : o.ok === false
            ? "bad"
            : ""}"
      >
        <h2>${o.title || "What happened"}</h2>
      </div>
      <div class="cq-scene-text outcome">
        ${o.choice
          ? html`<p class="cq-outcome-choice">You chose: ${curly(o.choice)}</p>`
          : nothing}
        ${o.lines
          .filter((l) => !/: it (went|didn't go|didn’t go) your way\.$/.test(l))
          .map((l) => html`<p>${curly(l)}</p>`)}
        ${!o.lines.length && !o.fx?.length && !o.choice
          ? html`<p class="cq-muted">Nothing much came of it.</p>`
          : nothing}
      </div>
      ${o.fx?.length
        ? html`<ul class="cq-fx" aria-label="What changed">
            ${o.fx.map((f) => {
              const up = f.startsWith("+");
              const good = /stress/.test(f) ? !up : up;
              return html`<li class=${good ? "good" : "bad"}>${f}</li>`;
            })}
          </ul>`
        : nothing}
      <div class="cq-scene-actions">
        <button class="cq-btn primary" @click=${() => ui.modal(null)}>
          Continue
        </button>
        ${next
          ? html`<button
              class="cq-btn"
              @click=${() => ui.modal({ k: "event", id: next.id })}
            >
              Next: ${next.title}
            </button>`
          : nothing}
      </div>`,
    o.scene,
    `out:${o.n}`,
  );
}
