// Every character's likeness: a period portrait (oil paintings of the 1600s
// and 1700s, and the few portraits of Native leaders made in those years),
// picked by nation, sex and age, the same one each time for the same person,
// in an oval gilt frame. A governor the player made wears the likeness they
// chose. The pictures and who painted them are listed in Credits.ts.

import { html, TemplateResult } from "lit";
import type { Character } from "../engine/Types";

const FILES = import.meta.glob<string>("./portraits/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

/** Bucket name ("english_m_old") to its pictures, in file order. */
const BUCKETS = new Map<string, string[]>();
for (const [path, url] of Object.entries(FILES).sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const name = path.replace(/^.*\//, "").replace(/_\d+\.webp$/, "");
  BUCKETS.set(name, [...(BUCKETS.get(name) ?? []), url]);
}

const EUROPEAN = ["english", "french", "spanish", "dutch", "swedish"];

/** Which nation's painters to draw from for a culture. */
function school(culture: string, native: boolean): string {
  if (native) return "native";
  if (culture === "portuguese") return "spanish";
  return EUROPEAN.includes(culture) ? culture : "english";
}

/** The pictures someone could be shown with, best fit first. */
export function likenesses(
  culture: string,
  female: boolean,
  age: number,
  native: boolean,
): string[] {
  const sex = female ? "f" : "m";
  const from = school(culture, native);
  const tries =
    age < 16
      ? [`child_${sex}`]
      : age >= 55
        ? [`${from}_${sex}_old`, `${from}_${sex}`]
        : [`${from}_${sex}`];
  tries.push(`english_${sex}`);
  for (const t of tries) {
    const list = BUCKETS.get(t);
    if (list?.length) return list;
  }
  return [];
}

/** Spread neighbouring ids across the pictures. */
function mix(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  return x >>> 0;
}

export interface PortraitOpts {
  age: number;
  /** The nation's colour, behind the sitter where the picture shows it. */
  color: string;
  native: boolean;
}

/** The picture for a character: their chosen likeness, or one by their id. */
export function likenessOf(c: Character, o: PortraitOpts): string | null {
  const list = likenesses(c.culture, c.female, o.age, o.native);
  if (list.length === 0) return null;
  const i = c.face ?? mix(c.id + 7);
  return list[((i % list.length) + list.length) % list.length];
}

/** The portrait in its frame, sized by its class. */
export function portrait(
  c: Character | undefined,
  o: PortraitOpts,
  cls = "",
): TemplateResult {
  if (!c) return html`<span class="cq-portrait empty ${cls}"></span>`;
  return framed(
    likenessOf(c, o),
    `Portrait of ${c.title ?? c.first}`,
    `${c.alive ? "" : "dead"} ${cls}`,
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
