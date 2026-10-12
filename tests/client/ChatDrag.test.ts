/**
 * Dragging the in-game chat around the screen: the real <chat-display>,
 * rendered by Lit in jsdom, with a small layout model standing in for the
 * browser's (jsdom lays nothing out). Covers the drag by the grip, that the
 * map underneath never sees it, keeping the chat on screen, remembering the
 * spot, and putting it back.
 */

vi.mock("../../src/client/Utils", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/client/Utils")>();
  return {
    ...actual,
    translateText: (key: string) => key,
    formatKeyForDisplay: (k: string) => k,
  };
});

import {
  GameMapType,
  GameMode,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_PLACEMENT_KEY,
  clampDrag,
  fitOffsets,
  parsePlacement,
  placementFromBox,
  scaledOffsets,
} from "../../src/client/chat/ChatPlacement";
import { ChatDisplay } from "../../src/client/hud/layers/ChatDisplay";

// ---------------------------------------------------------------- layout

/** The folded chat (grip and button) and the open panel, in px. */
const FOLDED = { w: 120, h: 34 };
const OPEN_H = 300;

function setViewport(w: number, h: number) {
  Object.defineProperty(window, "innerWidth", {
    value: w,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: h,
    configurable: true,
    writable: true,
  });
}

function px(v: string): number | null {
  const m = /(-?[\d.]+)px/.exec(v);
  return m === null ? null : Number(m[1]);
}

/** Where the browser would put the chat's box, from its inline style. */
function layout(el: HTMLElement): DOMRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const open = el.querySelector(".chat-input") !== null;
  // w-[calc(100vw-16px)] sm:w-[360px]
  const w = open ? (vw < 640 ? vw - 16 : 360) : FOLDED.w;
  const h = open ? OPEN_H : FOLDED.h;
  const s = el.style;
  let left = 8; // the default corner: left-2, bottom 12px
  let top = vh - 12 - h;
  if (px(s.left) !== null) left = px(s.left)!;
  else if (px(s.right) !== null) left = vw - px(s.right)! - w;
  if (px(s.top) !== null) top = px(s.top)!;
  else if (s.bottom !== "" && !s.bottom.includes("env")) {
    top = vh - px(s.bottom)! - h;
  }
  const t = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(s.transform);
  if (t !== null) {
    left += Number(t[1]);
    top += Number(t[2]);
  }
  return new DOMRect(left, top, w, h);
}

// ---------------------------------------------------------------- events

function pointer(
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  x: number,
  y: number,
) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 7, button: 0, clientX: x, clientY: y });
  target.dispatchEvent(e);
  return e;
}

/** Drag `grip` from (x0, y0) to (x1, y1), in a few moves as a hand would. */
function dragBy(grip: Element, x0: number, y0: number, x1: number, y1: number) {
  pointer(grip, "pointerdown", x0, y0);
  for (const t of [0.25, 0.5, 1]) {
    pointer(grip, "pointermove", x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
  }
  pointer(grip, "pointerup", x1, y1);
}

// ---------------------------------------------------------------- the chat

const me = {
  smallID: () => 1,
  clientID: () => "AAAAAAAA",
  id: () => "p1",
  type: () => PlayerType.Human,
  displayName: () => "Alice",
  isPlayer: () => true,
  isAlive: () => true,
  team: () => null,
  isOnSameTeam: () => false,
  isAlliedWith: () => false,
};

function fakeGame() {
  return {
    myPlayer: () => me,
    players: () => [me],
    playerByClientID: () => me,
    playerBySmallID: () => me,
    config: () => ({
      isReplay: () => false,
      gameConfig: () => ({
        gameMode: GameMode.FFA,
        gameMap: GameMapType.World,
      }),
    }),
    updatesSinceLastTick: () => null,
    ticks: () => 100,
  };
}

let chat: ChatDisplay;
let mapSaw: string[];
const onWindow = (e: Event) => mapSaw.push(e.type);

async function mount(): Promise<ChatDisplay> {
  const c = new ChatDisplay();
  c.game = fakeGame() as unknown as ChatDisplay["game"];
  c.eventBus = {
    on: () => {},
    off: () => {},
    emit: () => {},
  } as unknown as ChatDisplay["eventBus"];
  document.body.append(c);
  c.init();
  await settle(c);
  return c;
}

/** Let Lit render, measure, and fit (two passes at most). */
async function settle(c: ChatDisplay) {
  for (let i = 0; i < 3; i++) await c.updateComplete;
}

const box = () => chat.querySelector<HTMLElement>(".chat-box")!;
const grip = () => chat.querySelector<HTMLElement>(".chat-grip")!;
const saved = () => parsePlacement(localStorage.getItem(CHAT_PLACEMENT_KEY));
const where = () => {
  const r = box().getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  localStorage.clear();
  setViewport(1440, 900);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("chat-box")
        ? layout(this)
        : new DOMRect(0, 0, 0, 0);
    },
  );
  mapSaw = [];
  for (const t of ["pointerdown", "pointermove", "pointerup", "click"]) {
    window.addEventListener(t, onWindow);
  }
});

afterEach(() => {
  for (const t of ["pointerdown", "pointermove", "pointerup", "click"]) {
    window.removeEventListener(t, onWindow);
  }
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("dragging the chat", () => {
  it("starts in its usual corner, with a visible grip", async () => {
    chat = await mount();
    expect(grip()).not.toBeNull();
    expect(grip().getAttribute("title")).toBe("game_chat.drag");
    expect(where()).toMatchObject({ left: 8, bottom: 888 });
    expect(saved()).toBeNull();
  });

  it("moves where it is dragged, and stays there", async () => {
    chat = await mount();
    pointer(grip(), "pointerdown", 20, 870);
    pointer(grip(), "pointermove", 210, 685);
    // Mid-drag the box follows the finger.
    expect(box().style.transform).toBe("translate(190px, -185px)");
    pointer(grip(), "pointermove", 400, 500);
    pointer(grip(), "pointerup", 400, 500);
    await settle(chat);

    expect(where()).toMatchObject({ left: 388, top: 484 });
    expect(box().style.transform).toBe("");
    // Nearer the left and the bottom: it hugs those edges.
    expect(saved()).toEqual({
      h: "left",
      x: 388,
      v: "bottom",
      y: 382,
      vw: 1440,
      vh: 900,
    });
  });

  it("never lets the map underneath see the drag", async () => {
    chat = await mount();
    dragBy(grip(), 20, 870, 700, 300);
    await settle(chat);
    expect(saved()).not.toBeNull();
    expect(mapSaw).toEqual([]);
  });

  it("is dragged by the open panel's header, whose buttons still work", async () => {
    chat = await mount();
    chat
      .querySelector<HTMLButtonElement>("button[aria-label='game_chat.open']")!
      .click();
    await settle(chat);
    expect(chat.querySelector(".chat-input")).not.toBeNull();

    // A press on a header button is not a drag.
    const close = chat.querySelector<HTMLButtonElement>(
      "button[aria-label='game_chat.close']",
    )!;
    pointer(close, "pointerdown", 1000, 600);
    pointer(close, "pointermove", 1100, 300);
    pointer(close, "pointerup", 1100, 300);
    expect(saved()).toBeNull();

    // The header itself is.
    dragBy(grip(), 100, 600, 1300, 100);
    await settle(chat);
    const p = saved()!;
    expect(p).toMatchObject({ h: "right", v: "top" });
    const r = where();
    expect(r.right).toBeLessThanOrEqual(1440 - 8);
    expect(r.top).toBeGreaterThanOrEqual(8);

    close.click();
    await settle(chat);
    // Folded, it stays at the top right, growing down and to the left.
    expect(box().className).toContain("flex-col-reverse");
    expect(box().className).toContain("items-end");
    expect(where().right).toBe(r.right);
    expect(where().top).toBe(r.top);
  });

  it("stops at the edge of the screen", async () => {
    chat = await mount();
    dragBy(grip(), 20, 870, -500, -600);
    await settle(chat);
    expect(where()).toMatchObject({ left: 8, top: 8 });
    dragBy(grip(), 20, 20, 5000, 5000);
    await settle(chat);
    expect(where()).toMatchObject({ right: 1440 - 8, bottom: 900 - 8 });
  });

  it("stays on screen when it grows while held", async () => {
    chat = await mount();
    pointer(grip(), "pointerdown", 20, 870);
    pointer(grip(), "pointermove", 1390, 500);
    expect(where().right).toBe(1440 - 8);
    // An unread badge turns up mid-drag: the box is wider now.
    FOLDED.w = 160;
    try {
      pointer(grip(), "pointermove", 1420, 500);
      expect(where().right).toBe(1440 - 8);
      pointer(grip(), "pointerup", 1420, 500);
      await settle(chat);
      expect(where().right).toBe(1440 - 8);
      expect(saved()).toMatchObject({ h: "right", x: 8 });
    } finally {
      FOLDED.w = 120;
    }
  });

  it("a press that does not move is not a drag", async () => {
    chat = await mount();
    pointer(grip(), "pointerdown", 20, 870);
    pointer(grip(), "pointermove", 21, 871);
    pointer(grip(), "pointerup", 21, 871);
    await settle(chat);
    expect(saved()).toBeNull();
    expect(where()).toMatchObject({ left: 8, bottom: 888 });
  });

  it("a cancelled drag snaps back", async () => {
    chat = await mount();
    pointer(grip(), "pointerdown", 20, 870);
    pointer(grip(), "pointermove", 300, 400);
    pointer(grip(), "pointercancel", 300, 400);
    await settle(chat);
    expect(saved()).toBeNull();
    expect(box().style.transform).toBe("");
    expect(where()).toMatchObject({ left: 8, bottom: 888 });
  });
});

describe("keeping the chat on screen", () => {
  it("scales the spot to a smaller screen and keeps the panel inside it", async () => {
    chat = await mount();
    // Parked towards the bottom right of a desktop screen.
    dragBy(grip(), 20, 870, 1100, 600);
    await settle(chat);
    expect(saved()).toMatchObject({ h: "right", v: "bottom" });

    setViewport(390, 844);
    window.dispatchEvent(new Event("resize"));
    await settle(chat);
    let r = where();
    expect(r.left).toBeGreaterThanOrEqual(8);
    expect(r.right).toBeLessThanOrEqual(390 - 8);
    expect(r.top).toBeGreaterThanOrEqual(8);
    expect(r.bottom).toBeLessThanOrEqual(844 - 8);

    // The open panel is nearly as wide as the phone; it still fits.
    chat
      .querySelector<HTMLButtonElement>("button[aria-label='game_chat.open']")!
      .click();
    await settle(chat);
    r = where();
    expect(r.left).toBe(8);
    expect(r.right).toBe(390 - 8);
    expect(r.bottom).toBeLessThanOrEqual(844 - 8);
  });

  it("pulls the open panel down when it would run off the top", async () => {
    chat = await mount();
    // Low on the screen but nearer the bottom: anchored to the bottom.
    dragBy(grip(), 20, 870, 20, 500);
    await settle(chat);
    expect(saved()).toMatchObject({ v: "bottom" });
    setViewport(1440, 420);
    window.dispatchEvent(new Event("resize"));
    chat
      .querySelector<HTMLButtonElement>("button[aria-label='game_chat.open']")!
      .click();
    await settle(chat);
    const r = where();
    expect(r.top).toBeGreaterThanOrEqual(8);
    expect(r.bottom).toBeLessThanOrEqual(420 - 8);
  });

  it("comes back to the remembered spot in the next game", async () => {
    localStorage.setItem(
      CHAT_PLACEMENT_KEY,
      JSON.stringify({ h: "right", x: 40, v: "top", y: 90, vw: 1440, vh: 900 }),
    );
    chat = await mount();
    expect(where()).toMatchObject({ right: 1440 - 40, top: 90 });
  });

  it("shrugs off a broken or unreadable saved spot", async () => {
    localStorage.setItem(CHAT_PLACEMENT_KEY, "{not json");
    chat = await mount();
    expect(where()).toMatchObject({ left: 8, bottom: 888 });
    document.body.replaceChildren();

    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === CHAT_PLACEMENT_KEY) throw new Error("blocked");
      return get.call(this, key);
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === CHAT_PLACEMENT_KEY) throw new Error("blocked");
      set.call(this, key, value);
    });
    chat = await mount();
    dragBy(grip(), 20, 870, 600, 300);
    await settle(chat);
    // Not remembered, but moved for this game all the same.
    expect(where().left).toBeGreaterThan(8);
  });
});

describe("putting the chat back", () => {
  it("a double-click on the grip puts it back in its corner", async () => {
    chat = await mount();
    dragBy(grip(), 20, 870, 700, 200);
    await settle(chat);
    expect(saved()).not.toBeNull();
    grip().dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await settle(chat);
    expect(saved()).toBeNull();
    expect(localStorage.getItem(CHAT_PLACEMENT_KEY)).toBeNull();
    expect(where()).toMatchObject({ left: 8, bottom: 888 });
  });

  it("so does the open panel's reset button, shown once it has moved", async () => {
    chat = await mount();
    chat
      .querySelector<HTMLButtonElement>("button[aria-label='game_chat.open']")!
      .click();
    await settle(chat);
    expect(chat.querySelector(".chat-reset")).toBeNull();
    dragBy(grip(), 100, 600, 900, 300);
    await settle(chat);
    const reset = chat.querySelector<HTMLButtonElement>(".chat-reset")!;
    expect(reset).not.toBeNull();
    reset.click();
    await settle(chat);
    expect(saved()).toBeNull();
    expect(chat.querySelector(".chat-reset")).toBeNull();
    expect(where()).toMatchObject({ left: 8, bottom: 888 });
  });
});

describe("the placement arithmetic", () => {
  it("anchors to the nearer edges", () => {
    expect(
      placementFromBox(
        { left: 1000, top: 50, width: 200, height: 40 },
        1440,
        900,
      ),
    ).toEqual({ h: "right", x: 240, v: "top", y: 50, vw: 1440, vh: 900 });
  });

  it("scales a corner to a corner and the middle to the middle", () => {
    const corner = {
      h: "right",
      x: 12,
      v: "bottom",
      y: 12,
      vw: 1440,
      vh: 900,
    } as const;
    expect(scaledOffsets(corner, 720, 450)).toMatchObject({ x: 6, y: 6 });
    const mid = {
      h: "left",
      x: 660,
      v: "top",
      y: 400,
      vw: 1440,
      vh: 900,
    } as const;
    expect(scaledOffsets(mid, 720, 450)).toMatchObject({ x: 330, y: 200 });
  });

  it("fits a box inside the margins, or pins it to its anchor edges", () => {
    expect(
      fitOffsets({ h: "left", x: 2, v: "bottom", y: 9000 }, 100, 50, 800, 600),
    ).toEqual({ h: "left", x: 8, v: "bottom", y: 600 - 50 - 8 });
    // Bigger than the screen: its anchor edges stay in view.
    expect(
      fitOffsets({ h: "left", x: 50, v: "top", y: 50 }, 900, 700, 800, 600),
    ).toEqual({ h: "left", x: 8, v: "top", y: 8 });
  });

  it("stops a drag at the margin", () => {
    const b = { left: 100, top: 100, width: 100, height: 40 };
    expect(clampDrag(b, -500, 2000, 800, 600)).toEqual({
      dx: -92,
      dy: 600 - 40 - 8 - 100,
    });
  });
});
