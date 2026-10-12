// FIXES (r15): W A S D and the arrow keys move the map's camera (never the
// player). Holding a key pans smoothly, a frame at a time, at a steady pace
// on screen whatever the zoom (so close in it creeps over the country, far
// out it sweeps the coast); Shift goes faster. Keys are left alone while
// you type (any input, text box or the chat), while a window is open over
// the map, and with Ctrl, Alt or Cmd held (the browser's own shortcuts).

/** Which way each key moves the camera. */
const DIRS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  KeyA: [-1, 0],
  KeyS: [0, 1],
  KeyD: [1, 0],
  ArrowUp: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowRight: [1, 0],
};

/** Screen widths a second (of the larger side) at full pace. */
export const PAN_PACE = 0.6;
/** Shift's boost. */
export const PAN_FAST = 2.5;
/** Seconds from a standing start to full pace. */
const RAMP = 0.3;

export interface Pannable {
  /** Move the camera by screen pixels (the map stays within its bounds). */
  panBy(dx: number, dy: number): void;
  readonly screenSize: { width: number; height: number };
}

/** The key's direction, or null if it isn't one of ours. */
export function panDir(code: string): [number, number] | null {
  return DIRS[code] ?? null;
}

/** Whether a key event belongs to something being typed into. */
export function typing(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  if (!t || !t.tagName) return false;
  return (
    t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT" ||
    t.isContentEditable === true
  );
}

/**
 * Pixels to move in `dt` seconds holding direction (dx, dy): diagonals no
 * faster than straight, a short ramp from a standing start.
 */
export function panStep(
  dx: number,
  dy: number,
  dt: number,
  held: number,
  fast: boolean,
  width: number,
  height: number,
): [number, number] {
  const len = Math.hypot(dx, dy);
  if (len === 0) return [0, 0];
  const ramp = Math.min(1, 0.35 + (0.65 * held) / RAMP);
  const pace =
    PAN_PACE * Math.max(width, height) * (fast ? PAN_FAST : 1) * ramp;
  return [(dx / len) * pace * dt, (dy / len) * pace * dt];
}

export class CameraKeys {
  private held = new Map<string, [number, number]>();
  private fast = false;
  private since = 0;
  private last = 0;

  constructor(
    /** True while the keys shouldn't move the map (a window is open). */
    private blocked: () => boolean,
  ) {}

  attach(): void {
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.clear);
  }

  detach(): void {
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    window.removeEventListener("blur", this.clear);
    this.clear();
  }

  /** Whether a key is being held (so the map keeps drawing). */
  get moving(): boolean {
    return this.held.size > 0;
  }

  private down = (e: KeyboardEvent): void => {
    this.fast = e.shiftKey;
    const dir = panDir(e.code);
    if (!dir || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented)
      return;
    if (typing(e.target) || this.blocked()) {
      this.clear();
      return;
    }
    e.preventDefault(); // the arrows would scroll the page
    if (!this.held.size) {
      this.since = performance.now();
      this.last = this.since;
    }
    this.held.set(e.code, dir);
  };

  private up = (e: KeyboardEvent): void => {
    this.fast = e.shiftKey;
    this.held.delete(e.code);
  };

  private clear = (): void => {
    this.held.clear();
  };

  /** A frame: move the camera for the keys held. */
  step(now: number, view: Pannable | undefined): void {
    if (!this.held.size || !view) return;
    if (this.blocked()) {
      this.clear();
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    let dx = 0;
    let dy = 0;
    for (const [x, y] of this.held.values()) {
      dx += x;
      dy += y;
    }
    const { width, height } = view.screenSize;
    const [mx, my] = panStep(
      Math.sign(dx),
      Math.sign(dy),
      dt,
      (now - this.since) / 1000,
      this.fast,
      width,
      height,
    );
    // The camera goes right: the map slides left under it.
    if (mx || my) view.panBy(-mx, -my);
  }
}
