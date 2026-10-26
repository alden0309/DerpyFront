/**
 * DFX (r26): one clock for everyone watching a replay together. The room's
 * clock (WatchClock) says where the replay is at a moment of the server's
 * time; every viewer works out where that puts it now and keeps their own
 * playback there, seeking when it drifts. Whoever holds the controls changes
 * the clock: their own playback follows at once, and the server tells
 * everyone else.
 *
 * No DOM and no socket in here: the viewer gives it the playback, the
 * connection gives it the server's messages and takes what it sends.
 */

import {
  WATCH_SPEEDS,
  type WatchClientMessage,
  type WatchClock,
  type WatchMember,
  type WatchRoomView,
  type WatchServerMessage,
} from "../../derpland/WatchTypes";

/** Game ticks a second at 1x (the replay viewer's TICKS_PER_SECOND). */
const FRAMES_PER_SECOND = 10;
/** How often (ms) a viewer checks it's still where the room is. */
export const DRIFT_CHECK_MS = 250;
/** Timeline drags are sent at most this often (the server limits them). */
export const SEEK_SEND_MS = 150;

/** Where a room's clock puts the replay at the server's time `serverNow`. */
export function clockFrameAt(clock: WatchClock, serverNow: number): number {
  if (!clock.playing) return clock.frame;
  const elapsed = Math.max(0, serverNow - clock.at);
  return clock.frame + (elapsed / 1000) * FRAMES_PER_SECOND * clock.speed;
}

/**
 * How far (in frames) a playing replay may be from the room before it
 * seeks: under a second of play at any speed, and never a seek per frame.
 */
export function driftTolerance(speed: number): number {
  return Math.max(8, Math.round(6 * speed));
}

/**
 * The server's clock, from the times its messages carry. A message's `now`
 * minus the local time it arrived is the offset less the time it took to
 * come, so the largest of the recent ones is the best guess.
 */
export class ServerTime {
  private samples: number[] = [];

  constructor(private readonly local: () => number = Date.now) {}

  sample(serverNow: number): void {
    this.samples.push(serverNow - this.local());
    if (this.samples.length > 20) this.samples.shift();
  }

  /** The server's time now (the local clock until a message has come). */
  now(): number {
    if (this.samples.length === 0) return this.local();
    return this.local() + Math.max(...this.samples);
  }
}

/** What WatchSync drives: the replay viewer's ReplayPlayback has it all. */
export interface SyncPlayback {
  /** The frame on screen (-1 before the first). */
  readonly frame: number;
  /** Frames that can be played so far. */
  readonly totalFrames: number;
  readonly playing: boolean;
  readonly speed: number;
  /** More frames are still coming (the game is still being processed). */
  readonly live: boolean;
  play(): void;
  pause(): void;
  seek(frame: number): Promise<void>;
  setSpeed(speed: number): void;
}

export class WatchSync {
  /** Called when anything the room shows changes. */
  onChange: (() => void) | null = null;
  /** A reaction came: who sent it and which (an emoji table index). */
  onReact: ((from: WatchMember | null, e: number) => void) | null = null;

  you = 0;
  host = 0;
  ctl = 0;
  members: WatchMember[] = [];
  clock: WatchClock | null = null;
  /** The room is ahead of what this browser has processed so far. */
  behind = false;
  /** The room played on past the end of the replay. */
  ended = false;

  private playback: SyncPlayback | null = null;
  private seq = 0;
  /** The last change this viewer sent (its echo is the one to keep). */
  private sentSeq = 0;
  private lastCheck = -Infinity;
  private lastSeekSent = -Infinity;
  private pendingSeek: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly send: (msg: WatchClientMessage) => void,
    readonly time: ServerTime = new ServerTime(),
    private readonly localNow: () => number = Date.now,
  ) {}

  get inControl(): boolean {
    return this.you !== 0 && this.ctl === this.you;
  }

  get isHost(): boolean {
    return this.you !== 0 && this.host === this.you;
  }

  member(id: number): WatchMember | null {
    return this.members.find((m) => m.id === id) ?? null;
  }

  /** Who holds the controls, by name. */
  controllerName(): string {
    return this.member(this.ctl)?.name ?? "";
  }

  /** Where the room's clock puts the replay now (null before the room's word). */
  roomFrame(): number | null {
    return this.clock === null
      ? null
      : clockFrameAt(this.clock, this.time.now());
  }

  /** The server's word. */
  receive(msg: WatchServerMessage): void {
    this.time.sample(msg.now);
    switch (msg.t) {
      case "welcome":
        this.welcome(msg.you, msg.room);
        break;
      case "clock":
        // A change of ours that a later one of ours has overtaken: keep the
        // later one (its echo is on the way).
        if (
          msg.by === this.you &&
          msg.seq !== undefined &&
          msg.seq < this.sentSeq
        )
          return;
        this.clock = msg.clock;
        this.ended = false;
        this.apply();
        break;
      case "members":
        this.members = msg.members;
        this.host = msg.host;
        this.ctl = msg.ctl;
        break;
      case "react":
        this.onReact?.(this.member(msg.from), msg.e);
        return;
      default:
        return;
    }
    this.onChange?.();
  }

  private welcome(you: number, room: WatchRoomView): void {
    this.you = you;
    this.members = room.members;
    this.host = room.host;
    this.ctl = room.ctl;
    this.clock = room.clock;
    this.sentSeq = 0;
    this.ended = false;
    this.apply();
  }

  /** The replay is open: follow the room from now on. */
  attach(playback: SyncPlayback): void {
    this.playback = playback;
    this.apply();
    this.onChange?.();
  }

  detach(): void {
    this.playback = null;
    if (this.pendingSeek !== null) clearTimeout(this.pendingSeek);
    this.pendingSeek = null;
  }

  /** From the viewer's animation loop: stay where the room is. */
  tick(): void {
    const now = this.localNow();
    if (now - this.lastCheck < DRIFT_CHECK_MS) return;
    this.lastCheck = now;
    const wasBehind = this.behind;
    const wasEnded = this.ended;
    this.apply();
    if (wasBehind !== this.behind || wasEnded !== this.ended) this.onChange?.();
  }

  /** Bring the playback to the room's clock. */
  apply(): void {
    const pb = this.playback;
    const clock = this.clock;
    if (pb === null || clock === null || pb.totalFrames <= 0) return;
    const last = pb.totalFrames - 1;
    const target = Math.floor(clockFrameAt(clock, this.time.now()));
    this.behind = pb.live && target > last;
    if (pb.speed !== clock.speed) pb.setSpeed(clock.speed);
    if (!clock.playing) {
      if (pb.playing) pb.pause();
      const at = Math.min(target, last);
      if (pb.frame !== at) void pb.seek(at);
      return;
    }
    if (target >= last && !pb.live) {
      // Played past the end: everyone stops on the last frame.
      this.ended = true;
      if (pb.playing) pb.pause();
      if (pb.frame !== last) void pb.seek(last);
      return;
    }
    this.ended = false;
    const at = Math.min(target, last);
    if (Math.abs(pb.frame - at) > driftTolerance(clock.speed)) {
      void pb.seek(at);
    }
    if (!pb.playing) pb.play();
  }

  // ---- whoever holds the controls

  private change(op: "play" | "pause" | "seek" | "speed", next: WatchClock) {
    this.clock = next;
    this.ended = false;
    this.seq += 1;
    this.sentSeq = this.seq;
    const msg: WatchClientMessage = {
      t: "ctl",
      op,
      frame: Math.max(0, Math.floor(next.frame)),
      seq: this.seq,
      ...(op === "speed" ? { speed: next.speed } : {}),
    };
    this.send(msg);
    this.apply();
    this.onChange?.();
  }

  /** The frame this viewer is on (where a change starts from). */
  private here(): number {
    const pb = this.playback;
    if (pb !== null && pb.frame >= 0) return pb.frame;
    return Math.floor(this.roomFrame() ?? 0);
  }

  togglePlay(): void {
    if (!this.inControl || this.clock === null) return;
    const playing = this.clock.playing && !this.ended;
    let frame = this.here();
    // At the end of the replay, play starts it over.
    const pb = this.playback;
    if (!playing && pb !== null && !pb.live && frame >= pb.totalFrames - 1)
      frame = 0;
    this.change(playing ? "pause" : "play", {
      frame,
      playing: !playing,
      speed: this.clock.speed,
      at: this.time.now(),
    });
  }

  seek(frame: number): void {
    if (!this.inControl || this.clock === null) return;
    const next: WatchClock = {
      frame: Math.max(0, Math.floor(frame)),
      playing: this.clock.playing,
      speed: this.clock.speed,
      at: this.time.now(),
    };
    // Dragging the timeline: this viewer follows every move, the room the
    // latest every SEEK_SEND_MS.
    const now = this.localNow();
    if (now - this.lastSeekSent >= SEEK_SEND_MS) {
      this.lastSeekSent = now;
      if (this.pendingSeek !== null) clearTimeout(this.pendingSeek);
      this.pendingSeek = null;
      this.change("seek", next);
      return;
    }
    this.clock = next;
    this.apply();
    this.onChange?.();
    if (this.pendingSeek !== null) clearTimeout(this.pendingSeek);
    this.pendingSeek = setTimeout(
      () => {
        this.pendingSeek = null;
        if (!this.inControl || this.clock === null) return;
        this.lastSeekSent = this.localNow();
        this.change("seek", { ...this.clock, at: this.time.now() });
      },
      SEEK_SEND_MS - (now - this.lastSeekSent),
    );
  }

  setSpeed(speed: number): void {
    if (!this.inControl || this.clock === null) return;
    if (!(WATCH_SPEEDS as readonly number[]).includes(speed)) return;
    this.change("speed", {
      frame: this.here(),
      playing: this.clock.playing,
      speed,
      at: this.time.now(),
    });
  }

  /** Hand the controls to someone (the host, or whoever holds them). */
  handTo(id: number): void {
    if (!this.inControl && !this.isHost) return;
    this.send({ t: "hand", to: id });
  }

  /** The host takes the controls back. */
  takeControl(): void {
    if (!this.isHost || this.inControl) return;
    this.send({ t: "take" });
  }

  react(e: number): void {
    this.send({ t: "react", e });
  }
}
