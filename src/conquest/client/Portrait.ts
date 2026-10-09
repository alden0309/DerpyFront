// Every character's likeness: a head-and-shoulders portrait painted in
// layers (client/avatar/) from how they look (engine/Appearance.ts), in an
// oval gilt frame. A player's character, and their family, wear the look
// the player drew; everyone else has a look of their own that fits their
// people, station and years.

import { html, TemplateResult } from "lit";
import { type Appearance, lookOf, yearAtAge } from "../engine/Appearance";
import type { Character } from "../engine/Types";
import { type Expression, portraitUrl } from "./avatar/Render";

export type { Expression } from "./avatar/Render";

export type PortraitSize = "xs" | "s" | "m" | "l" | "xl";

export interface PortraitOpts {
  age: number;
  /** The nation's colour, warming the ground behind the sitter a little. */
  color: string;
  native: boolean;
  /** Which way they look: right (the default) or left. */
  facing?: "left" | "right";
  expression?: Expression;
  size?: PortraitSize;
}

/** Small portraits leave out the finer brushwork. */
function detailFor(o: PortraitOpts, cls: string): "full" | "lite" {
  if (o.size) return o.size === "xs" || o.size === "s" ? "lite" : "full";
  return /\b(xl|huge|large)\b/.test(cls) ? "full" : "lite";
}

/** The picture for a character, as a URL an <img> or a canvas can show. */
export function likenessOf(
  c: Character,
  o: PortraitOpts,
  cls = "",
): string | null {
  const age = Math.max(0, o.age);
  return portraitUrl(lookOf(c, age), {
    female: c.female,
    age,
    year: yearAtAge(c, age),
    culture: c.culture,
    native: o.native,
    expression: o.expression,
    facing: o.facing,
    detail: detailFor(o, cls),
    seed: c.id,
    tint: o.color,
  });
}

/** A look as a picture, for the register's preview. */
export function lookLikeness(
  look: Appearance,
  o: {
    female: boolean;
    age: number;
    year: number;
    culture: string;
    native: boolean;
    color?: string;
    facing?: "left" | "right";
    expression?: Expression;
    seed?: number;
  },
): string {
  return portraitUrl(look, {
    ...o,
    detail: "full",
    seed: o.seed ?? 7,
    tint: o.color,
  });
}

/** The portrait in its frame, sized by its class (or `size`). */
export function portrait(
  c: Character | undefined,
  o: PortraitOpts,
  cls = "",
): TemplateResult {
  const size = o.size ? `size-${o.size}` : "";
  if (!c) return html`<span class="cq-portrait empty ${size} ${cls}"></span>`;
  return framed(
    likenessOf(c, o, cls),
    `Portrait of ${c.title ?? c.first}`,
    `${c.alive ? "" : "dead"} ${size} ${cls}`,
  );
}

/** A picture in the oval gilt frame. */
export function framed(
  url: string | null,
  label: string,
  cls = "",
): TemplateResult {
  return html`<span class="cq-portrait ${cls}" role="img" aria-label=${label}
    >${url
      ? html`<img src=${url} alt="" loading="lazy" decoding="async" />`
      : html`<span class="cq-portrait-blank"></span>`}</span
  >`;
}
