/**
 * FxPreviewPlayer (FX r28) — the store's one live preview of a Nuke & Dome
 * effect pack.
 *
 * A page has at most one: one canvas and one WebGL context, running an
 * FxStage. Playing a pack moves the canvas into that card and loops the
 * scene there (a nuke flies in and bursts, then the Dome stops another);
 * stopping takes it out again, back to the card's still. Stills for every
 * other card are rendered by the same stage at the scene's still moment, so
 * every picture in the store is the real effect.
 */

import { findFxTheme } from "@openfront/shared/DerpyFx";
import { initGL } from "../gl/initGL";
import { FxStage } from "./FxStage";
import { STORE_SCENE } from "./PreviewScene";

export interface FxPreviewPlayer {
  /** Loop `pack`'s scene inside `host` (moving the canvas there). */
  play(pack: string, host: HTMLElement): void;
  /** Stop playing in `host` (no-op if it isn't the one playing). */
  stop(host: HTMLElement): void;
  /**
   * A still of `pack` at the scene's still moment, `cssW`×`cssH`, as an
   * image URL (null if the context was lost).
   */
  still(pack: string, cssW: number, cssH: number): string | null;
}

/** The player, or null where only a software renderer (or none) is on hand. */
export function createFxPreviewPlayer(): FxPreviewPlayer | null {
  const canvas = document.createElement("canvas");
  canvas.className = "dfx-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const res = initGL(canvas, {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
  });
  if (res.gl === null || res.status !== "ok") return null;
  return new Player(canvas, res.gl);
}

class Player implements FxPreviewPlayer {
  private readonly stage: FxStage;
  private host: HTMLElement | null = null;
  private pack: string | null = null;
  private themeShown: string | null = null;
  private startMs = 0;
  private raf = 0;
  private lost = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
  ) {
    this.stage = new FxStage(gl, STORE_SCENE);
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
      this.halt();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancelAnimationFrame(this.raf);
      else if (this.host !== null) this.loop();
    });
  }

  play(pack: string, host: HTMLElement): void {
    if (this.lost || findFxTheme(pack) === undefined) return;
    if (this.host === host && this.pack === pack) return;
    this.halt();
    this.host = host;
    this.pack = pack;
    this.show(pack);
    this.stage.restart();
    host.appendChild(this.canvas);
    this.startMs = performance.now();
    this.loop();
  }

  stop(host: HTMLElement): void {
    if (this.host === host) this.halt();
  }

  private halt(): void {
    cancelAnimationFrame(this.raf);
    this.canvas.remove();
    this.host = null;
    this.pack = null;
  }

  private show(pack: string): void {
    if (this.themeShown === pack) return;
    this.themeShown = pack;
    this.stage.setTheme(findFxTheme(pack) ?? null);
  }

  private loop = (): void => {
    cancelAnimationFrame(this.raf);
    const host = this.host;
    if (host === null || this.lost) return;
    const sec =
      ((performance.now() - this.startMs) / 1000) % STORE_SCENE.loopSec;
    this.draw(sec, host);
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw(sec: number, host: HTMLElement): void {
    const r = host.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    this.stage.seek(sec);
    this.stage.render(r.width, r.height);
  }

  still(pack: string, cssW: number, cssH: number): string | null {
    if (this.lost || findFxTheme(pack) === undefined) return null;
    this.show(pack);
    this.stage.seek(STORE_SCENE.stillSec);
    this.stage.render(cssW, cssH);
    const url = this.canvas.toDataURL("image/webp", 0.85);
    // Back to the card that's playing, within the same task, so it never
    // shows the still.
    if (this.host !== null && this.pack !== null) {
      this.show(this.pack);
      this.stage.restart();
      this.draw(
        ((performance.now() - this.startMs) / 1000) % STORE_SCENE.loopSec,
        this.host,
      );
    }
    return url;
  }
}
