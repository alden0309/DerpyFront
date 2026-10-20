// Mr. Based's sound (r25 BSTORY): the place's beds (rain outside, heavier
// under the awning and muffled indoors, the city far off, the bar's murmur
// and glasses, the lobby's hush and its clock, the television's hum while
// it's on), footsteps on what's underfoot, doors and the bar's bell, the
// story's own sounds (the lift's dead button, the rope, a key), paper, the
// dice and their stings, and a little score that plays a cue for the
// street, the bar and the night's end, then rests, and goes quiet under
// dialogue.
//
// Web Audio, four buses (music, ambience, effects, under a master) with the
// settings' levels; nothing plays before the first click or key (the
// browser's rule), and it all pauses while the tab is hidden. Sounds are
// fetched through the gated API when first wanted, so starting never waits
// for them. A place says what it sounds like (`sound` in its data); one
// that doesn't plays the story's `@ambient`.

import type {
  PlaceDef,
  PlaceSound,
  RandomSound,
  SoundBed,
} from "../engine/Place";
import { media } from "./Api";
import { CUES, EFFECTS, LOOPS, MP3_DELAY, SPRITES } from "./SoundTable";
import type { StepSurface } from "./world/World";

export interface Levels {
  master: number;
  music: number;
  ambience: number;
  effects: number;
  muted: boolean;
}

interface Playing {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

const FADE = 1.2;

export class Soundscape {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Record<"music" | "ambience" | "effects", GainNode> | null =
    null;
  /** Under dialogue the music goes quiet. */
  private duck: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private levels: Levels = {
    master: 0.7,
    music: 0.6,
    ambience: 0.8,
    effects: 0.8,
    muted: false,
  };
  private place: PlaceDef | null = null;
  private storyAmbient: string | null = null;
  /** Beds by key: what's playing, at what gain it wants. */
  private beds = new Map<string, Playing & { want: number }>();
  private listener = { x: 0, z: 0, area: null as string | null };
  private rain = 1;
  private tvOn = false;
  private dialogue = false;
  private music: { cue: string; playing: Playing | null; rest: number } | null =
    null;
  private randomAt = new Map<string, number>();
  private hidden = false;
  private ticker = 0;
  private lastTick = 0;

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisible);
    }
  }

  // --- the context -----------------------------------------------------------

  /** Call from a click or a key: browsers only allow sound after one. */
  unlock(): void {
    if (this.ctx === null) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.duck = ctx.createGain();
      this.buses = {
        music: ctx.createGain(),
        ambience: ctx.createGain(),
        effects: ctx.createGain(),
      };
      this.buses.music.connect(this.duck).connect(this.master);
      this.buses.ambience.connect(this.master);
      this.buses.effects.connect(this.master);
      this.applyLevels(true);
      this.lastTick = performance.now();
      this.ticker = window.setInterval(() => this.tick(), 250);
    }
    if (!this.hidden) void this.ctx.resume();
    this.refresh();
  }

  setLevels(l: Levels): void {
    this.levels = { ...l };
    this.applyLevels();
  }

  /** r22 callers: one volume and on or off. */
  setVolume(volume: number, muted: boolean): void {
    this.setLevels({ ...this.levels, master: volume, muted });
  }

  private applyLevels(now = false): void {
    if (!this.ctx || !this.master || !this.buses) return;
    const t = this.ctx.currentTime;
    const set = (g: GainNode, v: number) =>
      now ? g.gain.setValueAtTime(v, t) : g.gain.setTargetAtTime(v, t, 0.12);
    set(this.master, this.levels.muted ? 0 : this.levels.master);
    set(this.buses.music, this.levels.music * 0.8);
    set(this.buses.ambience, this.levels.ambience);
    set(this.buses.effects, this.levels.effects);
  }

  private onVisible = () => {
    this.hidden = document.visibilityState === "hidden";
    if (!this.ctx) return;
    // Phones (and everyone): nothing plays while the tab is hidden.
    if (this.hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  };

  private buffer(key: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(key);
    if (p === undefined) {
      p = (async () => {
        if (!this.ctx) return null;
        try {
          const url = await media("audio", key);
          const data = await (await fetch(url)).arrayBuffer();
          return await this.ctx.decodeAudioData(data);
        } catch {
          return null;
        }
      })();
      this.buffers.set(key, p);
    }
    return p;
  }

  // --- what the world tells it -------------------------------------------------

  /** The place he's in (its `sound`), or null. */
  setPlace(def: PlaceDef | null): void {
    if (this.place?.key === def?.key) return;
    this.place = def;
    this.randomAt.clear();
    this.refresh();
  }

  /** The story's `@ambient`, for a place that says nothing of its sound. */
  setStoryAmbient(key: string | null): void {
    this.storyAmbient = key;
    this.refresh();
  }

  /** Where he is, and in which room. */
  setListener(x: number, z: number, area: string | null): void {
    const moved = area !== this.listener.area;
    this.listener = { x, z, area };
    if (moved) this.refresh();
    else this.mixSpots();
  }

  /** How hard it's raining where the world is (0 to 1). */
  setRain(k: number): void {
    if (Math.abs(k - this.rain) < 0.02) return;
    this.rain = k;
    this.refresh();
  }

  /** The television: on while it has news, off once it's switched off. */
  setTv(on: boolean): void {
    if (on === this.tvOn) return;
    this.tvOn = on;
    this.refresh();
  }

  /** Lines and choices on screen: the music steps back. */
  setDialogue(on: boolean): void {
    if (on === this.dialogue) return;
    this.dialogue = on;
    if (this.ctx && this.duck) {
      this.duck.gain.setTargetAtTime(on ? 0.32 : 1, this.ctx.currentTime, 0.6);
    }
  }

  stop(): void {
    this.place = null;
    this.storyAmbient = null;
    this.refresh();
    this.stopMusic();
  }

  // --- the beds ----------------------------------------------------------------

  private get sound(): PlaceSound | null {
    return this.place?.sound ?? null;
  }

  /** What should be playing now, by key, at what gain (before the spots). */
  private wanted(): Map<string, { bed: SoundBed; gain: number }> {
    const out = new Map<string, { bed: SoundBed; gain: number }>();
    const s = this.sound;
    const add = (b: SoundBed, k = 1) => {
      const g = b.gain * k * (b.rain ? this.rain : 1);
      const was = out.get(b.key);
      out.set(b.key, { bed: b, gain: Math.max(was?.gain ?? 0, g) });
    };
    if (!s) {
      if (this.storyAmbient) add({ key: this.storyAmbient, gain: 0.7 });
      return out;
    }
    for (const b of s.beds ?? []) add(b);
    const area = this.listener.area ? s.areas?.[this.listener.area] : undefined;
    for (const b of area?.beds ?? []) add(b);
    for (const sp of s.spots ?? []) add(sp, this.spotK(sp));
    if (s.tv && this.tvOn) {
      const d = Math.hypot(
        this.listener.x - s.tv.at[0],
        this.listener.z - s.tv.at[1],
      );
      add({ key: s.tv.key, gain: s.tv.gain * Math.max(0, 1 - d / s.tv.r) });
    }
    return out;
  }

  private spotK(sp: { at: [number, number]; r: number }): number {
    const d = Math.hypot(
      this.listener.x - sp.at[0],
      this.listener.z - sp.at[1],
    );
    return Math.max(0, 1 - d / sp.r) ** 1.5;
  }

  /** Starts, fades and stops the beds to match what's wanted now. */
  private refresh(): void {
    if (!this.ctx || !this.buses) return;
    const want = this.wanted();
    for (const [key, p] of this.beds) {
      if (!want.has(key) || want.get(key)!.gain <= 0.001) {
        p.gain.gain.setTargetAtTime(0, this.ctx.currentTime, FADE / 3);
        p.src.stop(this.ctx.currentTime + FADE * 3);
        this.beds.delete(key);
      }
    }
    for (const [key, w] of want) {
      if (w.gain <= 0.001) continue;
      const p = this.beds.get(key);
      if (p) {
        p.want = w.gain;
        p.gain.gain.setTargetAtTime(w.gain, this.ctx.currentTime, 0.5);
      } else void this.startBed(key, w.bed, w.gain);
    }
    this.chooseCue();
  }

  /** Near the awning or the TV: only the gains move. */
  private mixSpots(): void {
    if (!this.ctx) return;
    const want = this.wanted();
    for (const [key, p] of this.beds) {
      const w = want.get(key)?.gain ?? 0;
      if (Math.abs(w - p.want) < 0.01) continue;
      p.want = w;
      p.gain.gain.setTargetAtTime(w, this.ctx.currentTime, 0.4);
    }
    // A spot or the TV coming into earshot.
    for (const [key, w] of want) {
      if (!this.beds.has(key) && w.gain > 0.001)
        void this.startBed(key, w.bed, w.gain);
    }
  }

  private starting = new Set<string>();

  private async startBed(
    key: string,
    bed: SoundBed,
    gain: number,
  ): Promise<void> {
    if (this.starting.has(key)) return;
    this.starting.add(key);
    const buf = await this.buffer(key);
    this.starting.delete(key);
    const ctx = this.ctx;
    if (!buf || !ctx || !this.buses || this.beds.has(key)) return;
    const now = this.wanted().get(key)?.gain ?? 0;
    if (now <= 0.001) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const len = LOOPS[key];
    if (len && buf.duration > len + 0.01) {
      // A decoder that kept the encoder's delay: loop the intended stretch.
      src.loopStart = Math.min(MP3_DELAY, buf.duration - len);
      src.loopEnd = src.loopStart + len;
    } else if (!len) {
      // Older loops (the rain): MP3s carry a little silence at each end.
      src.loopStart = Math.min(0.06, buf.duration / 4);
      src.loopEnd = Math.max(buf.duration - 0.06, src.loopStart + 0.1);
    }
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(now, ctx.currentTime, FADE / 3);
    let out: AudioNode = g;
    if (bed.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = bed.lowpass;
      g.connect(f);
      out = f;
    }
    src.connect(g);
    out.connect(this.buses.ambience);
    // Each bed starts somewhere in its loop, so two never line up.
    src.start(
      0,
      (src.loopStart || 0) + Math.random() * (len ?? buf.duration / 2) * 0.9,
    );
    this.beds.set(key, { src, gain: g, want: gain });
  }

  // --- now and then ------------------------------------------------------------

  private tick(): void {
    const t = performance.now();
    const dt = (t - this.lastTick) / 1000;
    this.lastTick = t;
    if (!this.ctx || this.hidden || this.ctx.state !== "running") return;
    const s = this.sound;
    const list: RandomSound[] = [
      ...(s?.random ?? []),
      ...((this.listener.area
        ? s?.areas?.[this.listener.area]?.random
        : undefined) ?? []),
    ];
    for (const r of list) {
      const id = r.key;
      const next = this.randomAt.get(id);
      if (next === undefined) {
        this.randomAt.set(id, rand(r.every[0] * 0.3, r.every[1] * 0.6));
        continue;
      }
      const left = next - dt;
      if (left > 0) {
        this.randomAt.set(id, left);
        continue;
      }
      this.randomAt.set(id, rand(r.every[0], r.every[1]));
      if (EFFECTS[id]) this.effect(id, r.gain / EFFECTS[id].gain);
      else void this.oneShot(id, r.gain, this.buses!.ambience);
    }
    // The score's rest between cues.
    if (this.music && !this.music.playing) {
      this.music.rest -= dt;
      if (this.music.rest <= 0) void this.playCue(this.music.cue);
    }
  }

  private async oneShot(
    key: string,
    gain: number,
    bus: AudioNode,
    rate = 1,
  ): Promise<void> {
    const buf = await this.buffer(key);
    const ctx = this.ctx;
    if (!buf || !ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(bus);
    src.start();
  }

  // --- the score ---------------------------------------------------------------

  /** The cue for where he is, if it changed: the old one fades, the new one starts. */
  private chooseCue(): void {
    const s = this.sound;
    const m = s?.music;
    const want =
      typeof m === "string"
        ? m
        : m && this.listener.area
          ? (m[this.listener.area] ?? null)
          : null;
    if (!want) {
      // A flat scene (no place): let the cue finish where it is.
      if (s) this.stopMusic();
      return;
    }
    if (this.music?.cue === want) return;
    this.stopMusic();
    this.music = { cue: want, playing: null, rest: 1.5 };
  }

  private stopMusic(): void {
    const ctx = this.ctx;
    const p = this.music?.playing;
    if (ctx && p) {
      p.gain.gain.setTargetAtTime(0, ctx.currentTime, 1.0);
      p.src.stop(ctx.currentTime + 4);
    }
    this.music = null;
  }

  private async playCue(cue: string): Promise<void> {
    const file = CUES[cue];
    const m = this.music;
    if (!file || !m || m.cue !== cue || !this.ctx || !this.buses) return;
    m.rest = 1e9; // until it ends
    const buf = await this.buffer(file);
    const ctx = this.ctx;
    if (!buf || this.music !== m) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 1;
    src.connect(g).connect(this.buses.music);
    src.onended = () => {
      if (this.music === m && m.playing?.src === src) {
        m.playing = null;
        // Then a rest, as a score does: the rain and the room for a while.
        m.rest = rand(40, 90);
      }
    };
    src.start();
    m.playing = { src, gain: g };
  }

  // --- effects -----------------------------------------------------------------

  /** A named effect (a door, a bell, paper, the dice...), once. */
  effect(name: string, k = 1, rate = 1): void {
    if (name === "siren") {
      if (this.buses) void this.oneShot("siren", 0.35 * k, this.buses.ambience);
      return;
    }
    const e = EFFECTS[name];
    if (!e) return;
    void this.slot(
      e.sprite,
      e.names[Math.floor(Math.random() * e.names.length)],
      e.gain * k,
      rate,
    );
  }

  private async slot(
    sprite: string,
    name: string,
    gain: number,
    rate = 1,
  ): Promise<void> {
    const sp = SPRITES[sprite];
    const i = sp?.names.indexOf(name) ?? -1;
    if (!this.ctx || !this.buses || i < 0 || this.hidden) return;
    const buf = await this.buffer(sprite);
    const ctx = this.ctx;
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.buses.effects);
    // A decoder that kept the encoder's delay shifts every slot a little.
    const shift =
      buf.duration > sp.slot * sp.names.length + 0.01 ? MP3_DELAY : 0;
    src.start(0, i * sp.slot + shift, sp.slot - 0.01);
  }

  /** A footfall: on what, walking or running, his or someone else's. */
  step(s: {
    surface: StepSurface;
    run: boolean;
    hero: boolean;
    wet: number;
    x: number;
    z: number;
  }): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    const kind = s.surface === "stone" && s.wet > 0.25 ? "wet" : s.surface;
    const d = Math.hypot(s.x - this.listener.x, s.z - this.listener.z);
    const gain = s.hero
      ? s.run
        ? 0.62
        : 0.42
      : (s.run ? 0.3 : 0.18) / (1 + d / 2.5);
    if (gain < 0.02) return;
    const n = 1 + Math.floor(Math.random() * 4);
    void this.slot(`steps_${kind}`, `s${n}`, gain, rand(0.92, 1.07));
  }
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
