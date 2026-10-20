// NEWS (r25): an entry's body on screen: paragraphs, bullet lists, bold and
// italic (parseNewsBody), every word of it a text node. Nothing in a body
// is ever HTML: a "<b>" in the file shows as those three characters.

import { html, TemplateResult } from "lit";
import { parseNewsBody, type NewsInline } from "./NewsTypes";

function inline(parts: NewsInline[]): (TemplateResult | string)[] {
  return parts.map((p) =>
    p.b
      ? html`<strong>${p.text}</strong>`
      : p.i
        ? html`<em>${p.text}</em>`
        : p.text,
  );
}

export function renderNewsBody(src: string): TemplateResult {
  return html`${parseNewsBody(src).map((b) =>
    b.list
      ? html`<ul>
          ${b.items.map((item) => html`<li>${inline(item)}</li>`)}
        </ul>`
      : html`<p>${inline(b.parts)}</p>`,
  )}`;
}
