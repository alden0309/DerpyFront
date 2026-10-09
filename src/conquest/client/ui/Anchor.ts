// Keeping what you're pointing at where it is. When a panel is drawn again
// because the world ticked, whatever is under the mouse (or, on a phone, the
// first thing in view) should be exactly where it was: if something above it
// grew or shrank, the panel scrolls by the same amount to make up for it.
// Panels that do this are marked `data-steady`; the browser's own scroll
// anchoring is turned off on them (in the CSS) so the two don't both pull.

let px = -1;
let py = -1;

/** Follow the mouse (touches don't hover, so they don't count). */
export function trackPointer(e: PointerEvent): void {
  if (e.pointerType === "touch") {
    px = -1;
    py = -1;
    return;
  }
  px = e.clientX;
  py = e.clientY;
}

export function pointerAt(): { x: number; y: number } | null {
  return px < 0 ? null : { x: px, y: py };
}

/** Whether the mouse is over an element just now. */
export function pointerOver(el: Element | null): boolean {
  if (!el || px < 0) return false;
  const r = el.getBoundingClientRect();
  return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
}

const ANCHORS =
  "button, a, li, summary, label, h2, h3, h4, header, .cq-area-banner, .cq-workblock, p";

interface Mark {
  box: HTMLElement;
  el: Element;
  off: number;
}

function pick(hit: Element | null, box: HTMLElement): Element | null {
  if (!hit || !box.contains(hit) || hit === box) return null;
  const near = hit.closest(ANCHORS);
  return near && box.contains(near) && near !== box ? near : hit;
}

/** Note where things are in every steady panel, before it's drawn again. */
export function captureAnchors(root: ParentNode): Mark[] {
  const out: Mark[] = [];
  for (const box of root.querySelectorAll<HTMLElement>("[data-steady]")) {
    const r = box.getBoundingClientRect();
    if (r.height < 4) continue;
    let el: Element | null = null;
    if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom)
      el = pick(document.elementFromPoint(px, py), box);
    // Not pointing into it: keep the first thing in view where it is.
    if (!el && box.scrollTop > 0)
      el = pick(
        document.elementFromPoint(
          r.left + Math.min(48, r.width / 2),
          r.top + Math.min(12, r.height / 2),
        ),
        box,
      );
    if (el) out.push({ box, el, off: el.getBoundingClientRect().top - r.top });
  }
  return out;
}

/** After drawing: scroll each panel so the noted things are back in place. */
export function restoreAnchors(marks: Mark[]): void {
  // Innermost first (a list inside the page), so the page itself only makes
  // up for what the list couldn't.
  for (const m of [...marks].reverse()) {
    if (!m.el.isConnected || !m.box.isConnected) continue;
    const top = m.box.getBoundingClientRect().top;
    const d = m.el.getBoundingClientRect().top - top - m.off;
    if (Math.abs(d) >= 1) m.box.scrollTop += d;
  }
}
