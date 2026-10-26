/**
 * DFX (r26): one clock for everyone watching a replay together. Each viewer
 * keeps its playback where the room's clock says: a late joiner jumps to
 * the moment, drift is corrected, whoever holds the controls moves
 * everyone, and nobody without them can.
 */

import {
  parseWatchPath,
  takeHostKeyFromHash,
} from "../../../src/client/replay/WatchRoute";
import {
  clockFrameAt,
  driftTolerance,
  SEEK_SEND_MS,
  ServerTime,
  WatchSync,
  type SyncPlayback,
} from "../../../src/client/replay/WatchSync";
import type {
  WatchClientMessage,
  WatchClock,
  WatchRoomView,
} from "../../../src/derpland/WatchTypes";

class FakePlayback implements SyncPlayback {
  frame = 0;
  totalFrames = 5000;
  playing = false;
  speed = 1;
  live = false;
  seeks: number[] = [];
  play() {
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  async seek(f: number) {
    this.seeks.push(f);
    this.frame = f;
  }
  setSpeed(s: number) {
    this.speed = s;
  }
}

/** A viewer on a local clock that tests move, with the server's the same. */
function viewer(local: { now: number }) {
  const sent: WatchClientMessage[] = [];
  const time = new ServerTime(() => local.now);
  const sync = new WatchSync(
    (m) => sent.push(m),
    time,
    () => local.now,
  );
  return { sync, sent };
}

const room = (clock: WatchClock, ctl = 1, host = 1): WatchRoomView => ({
  id: "RoomRoom01",
  game: { id: "AbCd1234", map: "Europe", scenario: null },
  members: [
    { id: 1, name: "Pat", account: true },
    { id: 2, name: "Gary", account: false },
  ],
  host,
  ctl,
  clock,
});

describe("the room's clock", () => {
  test("a paused clock stays; a playing one moves 10 frames a second times its speed", () => {
    const c = { frame: 100, playing: false, speed: 4, at: 1000 };
    expect(clockFrameAt(c, 9000)).toBe(100);
    expect(clockFrameAt({ ...c, playing: true }, 3000)).toBe(180);
    expect(clockFrameAt({ ...c, playing: true, speed: 0.5 }, 3000)).toBe(110);
    // A message from before the clock was set doesn't move it back.
    expect(clockFrameAt({ ...c, playing: true }, 500)).toBe(100);
  });

  test("the server's time is the best of what its messages say", () => {
    const local = { now: 10_000 };
    const t = new ServerTime(() => local.now);
    expect(t.now()).toBe(10_000);
    t.sample(15_000); // took 200 ms to come: offset 5200 less 200
    local.now = 10_300;
    t.sample(15_480); // took 20 ms
    expect(t.now()).toBe(10_300 + 5180);
  });

  test("drift: under a second of play at any speed", () => {
    expect(driftTolerance(0.5)).toBe(8);
    expect(driftTolerance(1)).toBe(8);
    expect(driftTolerance(32)).toBe(192);
  });

  test("a room's address and a host key's hash", () => {
    expect(parseWatchPath("/watch/AbCdEfGh12")).toBe("AbCdEfGh12");
    expect(parseWatchPath("/watch/AbCdEfGh12/")).toBe("AbCdEfGh12");
    expect(parseWatchPath("/watch/short")).toBeNull();
    expect(parseWatchPath("/game/AbCdEfGh12")).toBeNull();
    expect(takeHostKeyFromHash("#key=abcDEF123")).toBe("abcDEF123");
    expect(takeHostKeyFromHash("#modal=store")).toBeNull();
  });
});

describe("following the room", () => {
  test("a late joiner jumps to the room's moment and plays on", () => {
    const local = { now: 50_000 };
    const { sync } = viewer(local);
    const pb = new FakePlayback();
    sync.receive({
      t: "welcome",
      you: 2,
      room: room({ frame: 100, playing: true, speed: 2, at: 20_000 }),
      now: 50_000,
    });
    expect(sync.inControl).toBe(false);
    expect(sync.controllerName()).toBe("Pat");
    sync.attach(pb);
    // 30 s at x2: 600 frames on from 100.
    expect(pb.seeks).toEqual([700]);
    expect(pb.playing).toBe(true);
    expect(pb.speed).toBe(2);
  });

  test("a viewer that drifts is brought back; a small drift is left alone", () => {
    const local = { now: 0 };
    const { sync } = viewer(local);
    const pb = new FakePlayback();
    sync.receive({
      t: "welcome",
      you: 2,
      room: room({ frame: 0, playing: true, speed: 1, at: 0 }),
      now: 0,
    });
    sync.attach(pb);
    pb.seeks = [];
    // The playback keeps up (its own frame moves with the room's).
    local.now = 10_000;
    pb.frame = 97;
    sync.tick();
    expect(pb.seeks).toEqual([]);
    // A slow device fell behind by two seconds.
    local.now = 20_000;
    pb.frame = 180;
    sync.tick();
    expect(pb.seeks).toEqual([200]);
  });

  test("the controls' changes reach this viewer: pause, seek, speed", () => {
    const local = { now: 1_000 };
    const { sync } = viewer(local);
    const pb = new FakePlayback();
    sync.receive({
      t: "welcome",
      you: 2,
      room: room({ frame: 0, playing: true, speed: 1, at: 1_000 }),
      now: 1_000,
    });
    sync.attach(pb);
    local.now = 2_000;
    sync.receive({
      t: "clock",
      clock: { frame: 2400, playing: false, speed: 1, at: 2_000 },
      op: "seek",
      by: 1,
      now: 2_000,
    });
    expect(pb.playing).toBe(false);
    expect(pb.frame).toBe(2400);
    sync.receive({
      t: "clock",
      clock: { frame: 2400, playing: true, speed: 16, at: 2_000 },
      op: "speed",
      by: 1,
      now: 2_000,
    });
    expect(pb.speed).toBe(16);
    expect(pb.playing).toBe(true);
  });

  test("without the controls, nothing moves the room", () => {
    const local = { now: 0 };
    const { sync, sent } = viewer(local);
    const pb = new FakePlayback();
    sync.receive({
      t: "welcome",
      you: 2,
      room: room({ frame: 50, playing: false, speed: 1, at: 0 }),
      now: 0,
    });
    sync.attach(pb);
    sync.togglePlay();
    sync.seek(900);
    sync.setSpeed(8);
    sync.takeControl();
    sync.handTo(2);
    expect(sent).toEqual([]);
    expect(pb.frame).toBe(50);
    expect(pb.playing).toBe(false);
  });

  test("ahead of what's processed: it waits at the edge, saying so, and catches up", () => {
    const local = { now: 0 };
    const { sync } = viewer(local);
    const pb = new FakePlayback();
    pb.live = true;
    pb.totalFrames = 300;
    sync.receive({
      t: "welcome",
      you: 2,
      room: room({ frame: 2000, playing: false, speed: 1, at: 0 }),
      now: 0,
    });
    sync.attach(pb);
    expect(sync.behind).toBe(true);
    expect(pb.frame).toBe(299);
    // More of the game is processed: it moves up to the room.
    pb.totalFrames = 2500;
    local.now = 1000;
    sync.tick();
    expect(sync.behind).toBe(false);
    expect(pb.frame).toBe(2000);
  });

  test("played past the end: everyone stops on the last frame", () => {
    const local = { now: 0 };
    const { sync } = viewer(local);
    const pb = new FakePlayback();
    pb.totalFrames = 600;
    sync.receive({
      t: "welcome",
      you: 2,
      room: room({ frame: 550, playing: true, speed: 1, at: 0 }),
      now: 0,
    });
    sync.attach(pb);
    expect(pb.playing).toBe(true);
    local.now = 10_000;
    sync.tick();
    expect(sync.ended).toBe(true);
    expect(pb.playing).toBe(false);
    expect(pb.frame).toBe(599);
  });
});

describe("holding the controls", () => {
  function controller() {
    const local = { now: 0 };
    const v = viewer(local);
    const pb = new FakePlayback();
    v.sync.receive({
      t: "welcome",
      you: 1,
      room: room({ frame: 0, playing: false, speed: 1, at: 0 }),
      now: 0,
    });
    v.sync.attach(pb);
    return { ...v, pb, local };
  }

  test("play, speed and pause move this viewer at once, and go to the room", () => {
    const { sync, sent, pb, local } = controller();
    expect(sync.inControl).toBe(true);
    expect(sync.isHost).toBe(true);
    pb.frame = 120;
    sync.togglePlay();
    expect(pb.playing).toBe(true);
    expect(sent[sent.length - 1]).toEqual({
      t: "ctl",
      op: "play",
      frame: 120,
      seq: 1,
    });
    local.now = 500;
    pb.frame = 125;
    sync.setSpeed(8);
    expect(pb.speed).toBe(8);
    expect(sent[sent.length - 1]).toEqual({
      t: "ctl",
      op: "speed",
      frame: 125,
      speed: 8,
      seq: 2,
    });
    sync.setSpeed(3); // not a speed the viewer has
    expect(sent).toHaveLength(2);
    sync.togglePlay();
    expect(pb.playing).toBe(false);
    expect(sent[sent.length - 1]).toMatchObject({ op: "pause", seq: 3 });
  });

  test("dragging the timeline: every move here, the room the latest few times a second", () => {
    vi.useFakeTimers();
    try {
      const { sync, sent, pb, local } = controller();
      sync.seek(100);
      expect(sent).toHaveLength(1);
      for (let i = 1; i <= 10; i++) {
        local.now += 10;
        sync.seek(100 + i * 50);
        expect(pb.frame).toBe(100 + i * 50);
      }
      // Within SEEK_SEND_MS of the first: only the trailing one goes.
      expect(sent).toHaveLength(1);
      local.now += SEEK_SEND_MS;
      vi.advanceTimersByTime(SEEK_SEND_MS);
      expect(sent).toHaveLength(2);
      expect(sent[sent.length - 1]).toMatchObject({ op: "seek", frame: 600 });
    } finally {
      vi.useRealTimers();
    }
  });

  test("dragging back: the echo of the drag's first move doesn't pull it back", () => {
    vi.useFakeTimers();
    try {
      const { sync, sent, pb, local } = controller();
      sync.seek(1200); // sent at once (seq 1)
      local.now += 20;
      sync.seek(900);
      local.now += 20;
      sync.seek(600); // waits for SEEK_SEND_MS
      expect(pb.frame).toBe(600);
      // The first move's echo comes back while the last waits to go.
      sync.receive({
        t: "clock",
        clock: { frame: 1200, playing: false, speed: 1, at: local.now },
        op: "seek",
        by: 1,
        seq: 1,
        now: local.now,
      });
      expect(pb.frame).toBe(600);
      local.now += SEEK_SEND_MS;
      vi.advanceTimersByTime(SEEK_SEND_MS);
      expect(sent[sent.length - 1]).toMatchObject({
        op: "seek",
        frame: 600,
        seq: 2,
      });
      // Its own echo then settles it there.
      sync.receive({
        t: "clock",
        clock: { frame: 600, playing: false, speed: 1, at: local.now },
        op: "seek",
        by: 1,
        seq: 2,
        now: local.now,
      });
      expect(pb.frame).toBe(600);
      expect(sync.roomFrame()).toBe(600);
    } finally {
      vi.useRealTimers();
    }
  });

  test("an old echo of this viewer's own change doesn't pull it back", () => {
    const { sync, pb } = controller();
    sync.seek(100); // seq 1
    sync.togglePlay(); // seq 2 (play from 100)
    pb.frame = 130;
    // The echo of the seek arrives after the play was sent: ignored.
    sync.receive({
      t: "clock",
      clock: { frame: 100, playing: false, speed: 1, at: 0 },
      op: "seek",
      by: 1,
      seq: 1,
      now: 0,
    });
    expect(pb.playing).toBe(true);
    // Refused by the server (too fast): its word, without a number, wins.
    sync.receive({
      t: "clock",
      clock: { frame: 40, playing: false, speed: 1, at: 0 },
      op: "seek",
      by: 1,
      now: 0,
    });
    expect(pb.playing).toBe(false);
    expect(pb.frame).toBe(40);
  });

  test("handing the controls on, and the host taking them back", () => {
    const { sync, sent } = controller();
    sync.handTo(2);
    expect(sent[sent.length - 1]).toEqual({ t: "hand", to: 2 });
    sync.receive({
      t: "members",
      members: room({ frame: 0, playing: false, speed: 1, at: 0 }).members,
      host: 1,
      ctl: 2,
      now: 0,
    });
    expect(sync.inControl).toBe(false);
    expect(sync.controllerName()).toBe("Gary");
    sync.seek(5);
    expect(sent[sent.length - 1]).toEqual({ t: "hand", to: 2 });
    sync.takeControl();
    expect(sent[sent.length - 1]).toEqual({ t: "take" });
  });

  test("at the end of the replay, play starts it over", () => {
    const { sync, sent, pb } = controller();
    pb.totalFrames = 400;
    pb.frame = 399;
    sync.togglePlay();
    expect(sent[sent.length - 1]).toMatchObject({ op: "play", frame: 0 });
    expect(pb.frame).toBe(0);
  });
});
