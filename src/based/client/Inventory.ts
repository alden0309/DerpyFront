// What Mr. Based carries (r22 BPLAY): a sheet of paper like a property
// clerk's inventory. His figure, drawn, with the slots around it (hat,
// glasses, neck, jacket, shirt, gloves, the hand, trousers, shoes), each
// joined to where it sits on him; his pockets as a grid; and whatever's
// picked out, with what it does to his skills. Click to pick, double-click
// (or the button) to put on or take off, or drag between the pockets and
// the slots; "Use" for things with a use. Drawn only when something
// changes: never every frame.

import { html, nothing, svg, TemplateResult } from "lit";
import { CLOTHES_SLOTS, GEAR_SLOTS, GearSlot, ItemDef } from "../engine/Types";
import { FIGURE_POINTS, figureArt, itemArt } from "./ItemArt";

export interface InventoryView {
  items: Record<string, ItemDef>;
  /** Pockets: key → how many. */
  pockets: Record<string, number>;
  gear: Partial<Record<GearSlot, string>>;
  money: number;
  selected: string | null;
  /** Things with a use now, and things with a use at all. */
  usable: readonly string[];
  useful: readonly string[];
  /** He's free (things can be used only then). */
  free: boolean;
  skillName: (id: string) => string;
  skillColor: (id: string) => string;
  select: (key: string | null) => void;
  equip: (key: string) => void;
  unequip: (slot: GearSlot) => void;
  use: (key: string) => void;
}

/** How each slot is named on the sheet. */
export const SLOT_NAMES: Record<GearSlot, string> = {
  hat: "Hat",
  glasses: "Glasses",
  neck: "Neck",
  jacket: "Jacket",
  shirt: "Shirt",
  gloves: "Gloves",
  hand: "In his hand",
  trousers: "Trousers",
  shoes: "Shoes",
};

const KIND_NAMES: Record<string, string> = {
  clothes: "Clothes",
  tool: "A tool",
  weapon: "A weapon",
  document: "Papers",
  key: "A key",
  small: "Pocket things",
};

/** The slots' places around the figure, in a 400 × 430 box: [x, y]. */
const LEFT: GearSlot[] = ["hat", "neck", "jacket", "gloves"];
const RIGHT: GearSlot[] = ["glasses", "shirt", "hand", "trousers", "shoes"];
const BOX = { w: 400, h: 430 };
const SLOT = { w: 96, h: 70 };
/** The figure's box inside it (the drawing is 200 × 400). */
const FIG = { x: 118, y: 22, w: 164, h: 328 };

function slotAt(slot: GearSlot): [number, number] {
  const left = LEFT.indexOf(slot);
  if (left >= 0) return [6, 20 + left * 98];
  const right = RIGHT.indexOf(slot);
  return [BOX.w - SLOT.w - 6, 12 + right * 82];
}

/** Where a slot's leader line meets the figure, in the box. */
function figPoint(slot: GearSlot): [number, number] {
  const [px, py] = FIGURE_POINTS[slot];
  const k = FIG.w / 200;
  return [FIG.x + px * k, FIG.y + py * k];
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** Where the item is now, in words. */
function whereIs(v: InventoryView, key: string): string {
  for (const s of GEAR_SLOTS) {
    if (v.gear[s] === key) {
      return s === "hand"
        ? "In his hand"
        : `Wearing it (${SLOT_NAMES[s].toLowerCase()})`;
    }
  }
  return "In his pockets";
}

export function inventoryBody(v: InventoryView): TemplateResult {
  const pocketKeys = Object.keys(v.items).filter(
    (k) => (v.pockets[k] ?? 0) > 0,
  );
  // At least two rows of envelopes, empty ones too: pockets have no limit.
  const cells = Math.max(10, Math.ceil((pocketKeys.length + 1) / 5) * 5);
  const sel = v.selected ? v.items[v.selected] : undefined;
  const dragKey = (e: DragEvent) => e.dataTransfer?.getData("text/plain") ?? "";
  return html`<div class="mb-inv">
    <header class="mb-inv-head">
      <h2>What he carries</h2>
      <div class="mb-inv-money" title="Euros">
        <span>Money</span> <b>€${v.money}</b>
      </div>
    </header>
    <div class="mb-inv-body">
      <section class="mb-inv-figure" aria-label="What he wears">
        <div class="mb-inv-board" style="aspect-ratio:${BOX.w} / ${BOX.h}">
          <svg
            class="mb-inv-lines"
            viewBox="0 0 ${BOX.w} ${BOX.h}"
            aria-hidden="true"
          >
            ${GEAR_SLOTS.map((s) => {
              const [x, y] = slotAt(s);
              const [fx, fy] = figPoint(s);
              const sx = LEFT.includes(s) ? x + SLOT.w : x;
              const sy = y + SLOT.h / 2;
              const on = !!v.gear[s];
              return svg`<path class=${on ? "on" : ""} d="M${sx} ${sy} H${
                (sx + fx) / 2
              } L${fx} ${fy}" /><circle class=${on ? "on" : ""} cx=${fx} cy=${fy} r="2.6" />`;
            })}
          </svg>
          <div
            class="mb-inv-fig"
            style="left:${(FIG.x / BOX.w) * 100}%;top:${(FIG.y / BOX.h) *
            100}%;width:${(FIG.w / BOX.w) * 100}%;height:${(FIG.h / BOX.h) *
            100}%"
          >
            ${figureArt()}
          </div>
          ${GEAR_SLOTS.map((s) => {
            const key = v.gear[s];
            const it = key ? v.items[key] : undefined;
            const [x, y] = slotAt(s);
            return html`<button
              class="mb-slotbox ${it ? "full" : "empty"} ${v.selected === key &&
              key
                ? "picked"
                : ""}"
              style="left:${(x / BOX.w) * 100}%;top:${(y / BOX.h) *
              100}%;width:${(SLOT.w / BOX.w) * 100}%;height:${(SLOT.h / BOX.h) *
              100}%"
              aria-label=${it ? `${SLOT_NAMES[s]}: ${it.name}` : SLOT_NAMES[s]}
              title=${it ? it.name : SLOT_NAMES[s]}
              draggable=${it ? "true" : "false"}
              @dragstart=${(e: DragEvent) => {
                if (key) e.dataTransfer?.setData("text/plain", key);
              }}
              @dragover=${(e: DragEvent) => e.preventDefault()}
              @drop=${(e: DragEvent) => {
                e.preventDefault();
                const k = dragKey(e);
                if (v.items[k]?.slot === s) v.equip(k);
              }}
              @click=${() => v.select(key ?? null)}
              @pointerenter=${(e: PointerEvent) => {
                if (key && e.pointerType === "mouse") v.select(key);
              }}
              @dblclick=${() => {
                if (key) v.unequip(s);
              }}
            >
              ${it
                ? itemArt(it.icon, it.kind, 40)
                : html`<span class="mb-slotbox-empty"></span>`}
              <span class="mb-slotbox-name">${SLOT_NAMES[s]}</span>
            </button>`;
          })}
        </div>
      </section>
      <section class="mb-inv-side">
        <div class="mb-inv-sub">Pockets</div>
        <ol
          class="mb-pockets"
          aria-label="His pockets"
          @dragover=${(e: DragEvent) => e.preventDefault()}
          @drop=${(e: DragEvent) => {
            e.preventDefault();
            const k = dragKey(e);
            for (const s of GEAR_SLOTS) if (v.gear[s] === k) v.unequip(s);
          }}
        >
          ${Array.from({ length: cells }, (_, i) => {
            const key = pocketKeys[i];
            const it = key ? v.items[key] : undefined;
            if (!it) return html`<li class="mb-pocket empty"></li>`;
            const n = v.pockets[key] ?? 0;
            return html`<li class="mb-pocket">
              <button
                class=${v.selected === key ? "picked" : ""}
                aria-label=${n > 1 ? `${it.name}, ${n}` : it.name}
                title=${it.name}
                draggable="true"
                @dragstart=${(e: DragEvent) =>
                  e.dataTransfer?.setData("text/plain", key)}
                @click=${() => v.select(key)}
                @pointerenter=${(e: PointerEvent) => {
                  if (e.pointerType === "mouse") v.select(key);
                }}
                @dblclick=${() => {
                  if (it.slot) v.equip(key);
                }}
              >
                ${itemArt(it.icon, it.kind, 44)}
                ${n > 1 ? html`<span class="mb-pocket-n">${n}</span>` : nothing}
              </button>
            </li>`;
          })}
        </ol>
        ${sel
          ? details(v, sel)
          : html`<p class="mb-inv-hint">
              Pick something to see what it is.
              ${matchMedia?.("(pointer: coarse)").matches
                ? nothing
                : html`Drag clothes onto him, or back into his pockets.`}
            </p>`}
      </section>
    </div>
  </div>`;
}

function details(v: InventoryView, it: ItemDef): TemplateResult {
  const worn = GEAR_SLOTS.find((s) => v.gear[s] === it.key);
  const canUse = v.usable.includes(it.key);
  const hasUse = v.useful.includes(it.key);
  return html`<article class="mb-item" aria-live="polite">
    <div class="mb-item-art">${itemArt(it.icon, it.kind, 72)}</div>
    <div class="mb-item-text">
      <h3>${it.name}</h3>
      <div class="mb-item-where">
        ${KIND_NAMES[it.kind] ?? it.kind}, ${whereIs(v, it.key)}
      </div>
      <p class="mb-item-about">${it.about}</p>
      ${it.bonus.length > 0
        ? html`<ul class="mb-item-fx">
            ${it.bonus.map(
              (b) =>
                html`<li
                  class=${b.delta > 0 ? "up" : "down"}
                  style="--c:${v.skillColor(b.skill)}"
                >
                  <b>${signed(b.delta)}</b> ${v.skillName(b.skill)}
                </li>`,
            )}
            <li class="note">
              ${it.slot === "hand" ? "While he holds it" : "While he wears it"}
            </li>
          </ul>`
        : nothing}
      <div class="mb-item-acts">
        ${it.slot && !worn
          ? html`<button class="mb-btn primary" @click=${() => v.equip(it.key)}>
              ${it.slot === "hand"
                ? "Hold it"
                : (CLOTHES_SLOTS as readonly string[]).includes(it.slot)
                  ? "Put it on"
                  : "Wear it"}
            </button>`
          : nothing}
        ${worn
          ? html`<button class="mb-btn" @click=${() => v.unequip(worn)}>
              ${worn === "hand" ? "Put it away" : "Take it off"}
            </button>`
          : nothing}
        ${hasUse
          ? html`<button
              class="mb-btn"
              ?disabled=${!canUse}
              title=${canUse
                ? ""
                : v.free
                  ? "Nothing to do with it here, just now"
                  : "Not in the middle of something"}
              @click=${() => v.use(it.key)}
            >
              Use
            </button>`
          : nothing}
      </div>
    </div>
  </article>`;
}
