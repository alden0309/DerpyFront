/**
 * DFX (r26): rewinding a replay. The viewer plays frames the processor
 * built, with a keyframe every DEFAULT_KEYFRAME_INTERVAL frames, so a rewind
 * is a seek back: the chunk's keyframe and its deltas. It must land on
 * exactly the state playing forward reached, whatever came between, and
 * the inflated chunks it keeps stay capped however far it jumps about. The
 * rewind buttons seek back 10 seconds, a minute, or to the start.
 */

import { GameType } from "@openfront/engine-api/game/GameTypes";
import { gunzip as gunzipCb } from "zlib";
import {
  DEFAULT_KEYFRAME_INTERVAL,
  type ReplayFrame,
} from "../../../src/client/replay/codec/ReplayTypes";
import {
  REWIND_LONG_S,
  REWIND_SHORT_S,
  rewindFrame,
  type ReplayControls,
} from "../../../src/client/replay/ReplayControls";
import { ReplayPlayback } from "../../../src/client/replay/ReplayPlayback";
import { setup } from "../../util/Setup";
import { recordGame, type RecordedGame } from "./util/RecordGame";

const gunzip = (d: Uint8Array) =>
  new Promise<Uint8Array>((resolve, reject) =>
    gunzipCb(d, (err, out) =>
      err ? reject(err) : resolve(new Uint8Array(out)),
    ),
  );
const RULES = { allianceDuration: 100, doomsdayClockWarnTicks: 150 };

/** FNV-1a over a frame's whole state: tiles, players, units, names, terrain. */
function frameHash(f: ReplayFrame): string {
  let h = 0x811c9dc5;
  const byte = (b: number) => {
    h ^= b & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  const text = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      byte(c);
      byte(c >> 8);
    }
  };
  const json = (v: unknown) =>
    text(
      JSON.stringify(v, (_k, x: unknown) =>
        x instanceof Map
          ? [...x.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
          : ArrayBuffer.isView(x)
            ? Array.from(x as Uint8Array)
            : x,
      ),
    );
  text(`${f.tick}:${f.falloutTiles}`);
  for (let i = 0; i < f.tileState.length; i++) {
    byte(f.tileState[i]);
    byte(f.tileState[i] >> 8);
  }
  json(f.players);
  json(f.units);
  json(f.names);
  json(f.terrain);
  return h.toString(16);
}

describe("the rewind buttons' frames", () => {
  test("back 10 seconds, a minute, never before the start", () => {
    expect(REWIND_SHORT_S).toBe(10);
    expect(REWIND_LONG_S).toBe(60);
    expect(rewindFrame(1000, REWIND_SHORT_S)).toBe(900);
    expect(rewindFrame(1000, REWIND_LONG_S)).toBe(400);
    expect(rewindFrame(450, REWIND_LONG_S)).toBe(0);
    expect(rewindFrame(5, REWIND_SHORT_S)).toBe(0);
    expect(rewindFrame(-1, REWIND_SHORT_S)).toBe(0);
  });

  test("the bar's buttons seek back from the frame on screen; locked, they're gone", async () => {
    await import("../../../src/client/replay/ReplayControls");
    const el = document.createElement("replay-controls") as ReplayControls;
    el.frame = 1234;
    el.tick = 1234;
    el.loaded = 3000;
    el.total = 3000;
    document.body.appendChild(el);
    await el.updateComplete;
    const seeks: number[] = [];
    el.addEventListener("replay-seek", (e) =>
      seeks.push((e as CustomEvent<number>).detail),
    );
    const click = (key: string) =>
      el.querySelector<HTMLButtonElement>(`[data-rewind="${key}"]`)!.click();
    click("back_10s");
    click("back_1m");
    click("back_start");
    expect(seeks).toEqual([1134, 634, 0]);
    // Each has its name, and its key in its title.
    for (const b of el.querySelectorAll("[data-rewind]")) {
      expect(b.getAttribute("aria-label")).toBeTruthy();
      expect(b.getAttribute("title")).toBeTruthy();
    }

    // Watching together without the controls: no rewinding (it's theirs).
    el.locked = true;
    el.lockedBy = "Pat";
    await el.updateComplete;
    expect(el.querySelectorAll("[data-rewind]").length).toBe(0);
  });
});

describe("rewinding a played replay", () => {
  let rec: RecordedGame;
  /** Each frame's state, playing forward one frame at a time. */
  const forward: string[] = [];

  beforeAll(async () => {
    const game = await setup(
      "big_plains",
      { bots: 10, gameType: GameType.Singleplayer },
      [],
      undefined,
      undefined,
      false,
    );
    // Over a minute and a half of game, at the viewer's own keyframe
    // spacing, so a rewind of a minute crosses chunks.
    rec = await recordGame(game, {
      ticks: 960,
      keyframeInterval: DEFAULT_KEYFRAME_INTERVAL,
      tileTruthEvery: 50,
      beforeTick: (g, t) => {
        if (t === 5) g.endSpawnPhase();
      },
    });
  }, 180_000);

  async function open() {
    const playback = await ReplayPlayback.open(rec.replay, gunzip, RULES);
    const seen: { frame: number; hash: string; seeked: boolean }[] = [];
    playback.onFrame = (_fd, seeked, source) =>
      seen.push({ frame: source.frame, hash: frameHash(source), seeked });
    playback.onError = (err) => {
      throw err;
    };
    return { playback, seen };
  }

  test("lands on exactly the state playing forward reached", async () => {
    const { playback, seen } = await open();
    expect(playback.totalFrames).toBe(960);
    await playback.seek(0);
    for (let f = 1; f < playback.totalFrames; f++) await playback.seek(f);
    // Played forward: every frame stepped to, none seeked but the first.
    expect(seen.length).toBe(960);
    expect(seen.slice(1).every((s) => !s.seeked)).toBe(true);
    for (const s of seen) forward[s.frame] = s.hash;

    // Back 10 seconds, a minute, inside a chunk, onto a keyframe, to the
    // start, and forward again: each the same as playing there.
    const end = playback.totalFrames - 1;
    const targets = [
      rewindFrame(end, REWIND_SHORT_S),
      rewindFrame(end, REWIND_LONG_S),
      rewindFrame(rewindFrame(end, REWIND_LONG_S), REWIND_SHORT_S),
      DEFAULT_KEYFRAME_INTERVAL * 3,
      DEFAULT_KEYFRAME_INTERVAL * 3 - 1,
      517,
      0,
      end,
      123,
    ];
    for (const t of targets) {
      seen.length = 0;
      await playback.seek(t);
      expect(playback.frame).toBe(t);
      const last = seen[seen.length - 1];
      expect(last.frame).toBe(t);
      expect(last.hash, `frame ${t}`).toBe(forward[t]);
    }

    // And playing on from a rewind matches playing forward too.
    await playback.seek(400);
    seen.length = 0;
    for (let f = 401; f <= 460; f++) await playback.seek(f);
    expect(seen.map((s) => s.hash)).toEqual(forward.slice(401, 461));
  }, 120_000);

  test("the tiles rewound to are the engine's at that tick", async () => {
    const { playback } = await open();
    let tiles: Uint16Array | null = null;
    let tick = -1;
    playback.onFrame = (_fd, _seeked, source) => {
      tiles = source.tileState.slice();
      tick = source.tick;
    };
    await playback.seek(959);
    for (const f of [900, 600, 250, 50]) {
      await playback.seek(f);
      const truth = rec.truth[f];
      expect(truth.tileState, `tiles sampled at ${f}`).not.toBeNull();
      expect(tick).toBe(truth.tick);
      expect(tiles).toEqual(truth.tileState);
    }
  }, 60_000);

  test("however it jumps about, it keeps its inflated chunks capped", async () => {
    let inflated = 0;
    const counting = (d: Uint8Array) => {
      inflated++;
      return gunzip(d);
    };
    const playback = await ReplayPlayback.open(rec.replay, counting, RULES);
    const reader = (
      playback as unknown as {
        reader: {
          cache: Map<number, unknown>;
          loading: Map<number, Promise<void>>;
        };
      }
    ).reader;
    /** Inflated chunks once the read-ahead has landed. */
    const kept = async () => {
      await Promise.all([...reader.loading.values()]);
      return reader.cache.size;
    };
    let most = 0;
    // Forward to the end, then rewinding about: 10 s, a minute, the start.
    await playback.seek(959);
    most = Math.max(most, await kept());
    for (let i = 0; i < 40; i++) {
      const f = i % 3 === 0 ? 0 : i % 3 === 1 ? 900 - i * 7 : 500 + i * 11;
      await playback.seek(Math.min(959, f));
      most = Math.max(most, await kept());
      await playback.seek(rewindFrame(Math.min(959, f + 300), REWIND_SHORT_S));
      await playback.seek(rewindFrame(Math.min(959, f + 700), REWIND_LONG_S));
      most = Math.max(most, await kept());
    }
    // ReplayReader's cap: the 3 last decoded from, and the one read ahead.
    expect(most).toBeLessThanOrEqual(4);
    // Chunks dropped from the cache are inflated again when they're needed.
    expect(inflated).toBeGreaterThan(rec.replay.append.chunks.length);
  }, 60_000);
});
