// FX (r28): a Nuke & Dome effect pack's picture in the store, the Inventory
// and the effects pickers: <dfx-live pack="fx_solar">.
//
// It shows a still of the real effect, and plays the real thing, live, while
// its card is hovered or focused (or tapped). The renderer is not part of
// this page's first download: it comes with import() the first time an
// effects card appears, and the whole page shares one canvas and one WebGL
// context, which moves into whichever card is playing. Every other card
// keeps its still, rendered by that same renderer (until it has loaded,
// and wherever WebGL2 or a GPU isn't available, a pre-rendered one from
// /derpy-fx/). With reduced motion, nothing plays.

import type { FxPreviewPlayer } from "../client/render/fxpreview/FxPreview";

/**
 * The pre-rendered still of a pack: FxStage's frame at STORE_SCENE.stillSec,
 * saved as resources/public/derpy-fx/<pack>.webp (render them again if the
 * effects change).
 */
export function fxPosterUrl(pack: string): string {
  return `/derpy-fx/${encodeURIComponent(pack)}.webp`;
}

let player: Promise<FxPreviewPlayer | null> | null = null;
let ready: FxPreviewPlayer | null = null;
let playing: DfxLive | null = null;
const shown = new Set<DfxLive>();
/** Stills already rendered, by pack and size (tabs re-render the cards). */
const stills = new Map<string, string>();

function loadPlayer(): Promise<FxPreviewPlayer | null> {
  // Without WebGL2 there's nothing to load: the posters stay.
  if (typeof WebGL2RenderingContext === "undefined") {
    return Promise.resolve(null);
  }
  player ??= import("../client/render/fxpreview/FxPreview")
    .then((m) => m.fxPreviewPlayer())
    .then((p) => {
      ready = p;
      if (p !== null) for (const el of shown) el.refreshStill();
      return p;
    })
    .catch(() => null);
  return player;
}

/** `el` becomes the card that plays; whichever played before stops. */
function takeStage(el: DfxLive): void {
  if (playing !== null && playing !== el) playing.stop();
  playing = el;
}

function reducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Outside a browser (the hub's modules imported by Node tests) there is no
// HTMLElement; the element is only defined where customElements exists.
const ElementBase: typeof HTMLElement =
  typeof HTMLElement === "undefined"
    ? (class {} as unknown as typeof HTMLElement)
    : HTMLElement;

export class DfxLive extends ElementBase {
  private img: HTMLImageElement | null = null;
  private card: HTMLElement | null = null;
  private stillFor = "";
  /** Whether this card is hovered or focused (the player may still be loading). */
  private wanted = false;

  get pack(): string {
    return this.getAttribute("pack") ?? "";
  }

  connectedCallback(): void {
    if (this.img === null) {
      this.setAttribute("aria-hidden", "true");
      const img = document.createElement("img");
      img.className = "dfx-still";
      img.alt = "";
      img.decoding = "async";
      img.draggable = false;
      img.src = fxPosterUrl(this.pack);
      img.addEventListener("error", () => img.classList.add("missing"), {
        once: true,
      });
      const badge = document.createElement("span");
      badge.className = "dfx-play";
      this.append(img, badge);
      this.img = img;
    }
    this.card =
      this.closest<HTMLElement>("article, button, li, figure") ?? this;
    this.card.addEventListener("pointerenter", this.onEnter);
    this.card.addEventListener("pointerleave", this.onLeave);
    this.card.addEventListener("focusin", this.onEnter);
    this.card.addEventListener("focusout", this.onLeave);
    shown.add(this);
    if (ready !== null) this.refreshStill();
    else void loadPlayer();
  }

  disconnectedCallback(): void {
    shown.delete(this);
    this.card?.removeEventListener("pointerenter", this.onEnter);
    this.card?.removeEventListener("pointerleave", this.onLeave);
    this.card?.removeEventListener("focusin", this.onEnter);
    this.card?.removeEventListener("focusout", this.onLeave);
    this.card = null;
    this.stop();
  }

  /** Swap in a still from the live renderer, at this card's size. */
  refreshStill(): void {
    const img = this.img;
    if (ready === null || img === null) return;
    const r = this.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const key = `${this.pack}@${Math.round(r.width)}x${Math.round(r.height)}`;
    if (this.stillFor === key) return;
    const url = stills.get(key) ?? ready.still(this.pack, r.width, r.height);
    if (url !== null) {
      stills.set(key, url);
      this.stillFor = key;
      img.src = url;
      img.classList.remove("missing");
    }
  }

  private onEnter = (): void => {
    if (reducedMotion()) return;
    this.wanted = true;
    void loadPlayer().then((p) => {
      if (p === null || !this.wanted || !this.isConnected) return;
      takeStage(this);
      this.dataset.playing = "";
      p.play(this.pack, this);
    });
  };

  private onLeave = (e: Event): void => {
    // A touch's pointer leaves as the finger lifts: let the tap keep playing
    // until another card takes over.
    if (e instanceof PointerEvent && e.pointerType !== "mouse") return;
    if (
      e instanceof FocusEvent &&
      e.relatedTarget instanceof Node &&
      this.card?.contains(e.relatedTarget)
    ) {
      return;
    }
    this.stop();
  };

  stop(): void {
    this.wanted = false;
    if (playing === this) playing = null;
    delete this.dataset.playing;
    ready?.stop(this);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("dfx-live")) {
  customElements.define("dfx-live", DfxLive);
}

/** Styles for <dfx-live> (in StorePreviews' STORE_PREVIEW_CSS). */
export const FX_LIVE_CSS = `
dfx-live{position:relative;display:block;width:100%;max-width:420px;aspect-ratio:16/9;overflow:hidden;border-radius:10px;background:#0f1923;isolation:isolate}
dfx-live .dfx-still{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
dfx-live .dfx-still.missing{visibility:hidden}
dfx-live .dfx-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:1}
dfx-live .dfx-play{position:absolute;right:8px;bottom:8px;z-index:2;width:26px;height:26px;border-radius:50%;background:#0b1118b3;box-shadow:0 0 0 1px #ffffff33;transition:opacity .2s}
dfx-live .dfx-play::after{content:"";position:absolute;left:10px;top:7px;border-style:solid;border-width:6px 0 6px 9px;border-color:transparent transparent transparent #fff}
dfx-live[data-playing] .dfx-play{opacity:0}
@media (prefers-reduced-motion:reduce){dfx-live .dfx-play{display:none}}
`;
