// Derpy Conquest's sounds and music. Effects are short recordings (a quill
// on paper when a letter comes, wax pressed when you answer, the ship's bell
// when a convoy makes port, drums for war, cannon and muskets for battle);
// the music is lute, recorder and harpsichord in peacetime and fife and drum
// in war. Everything is off-able, and nothing plays until the player has
// touched the page (browsers insist).

import battleDistant from "./audio/battle_distant.mp3?url";
import cannonShot from "./audio/cannon_shot_a.mp3?url";
import coins from "./audio/coins_handle.mp3?url";
import harpsichord from "./audio/court_harpsichord_sinfonia5.mp3?url";
import fanfareBrass from "./audio/fanfare_brass_short.mp3?url";
import fanfareFife from "./audio/fanfare_fife_drum.mp3?url";
import fanfareMonteverdi from "./audio/fanfare_monteverdi.mp3?url";
import villageConsort from "./audio/map_consort_village.mp3?url";
import luteSuonatore from "./audio/map_lute_suonatore.mp3?url";
import luteTeller from "./audio/map_lute_teller.mp3?url";
import musketVolley from "./audio/musket_volley.mp3?url";
import toccata from "./audio/muster_monteverdi_toccata.mp3?url";
import pezel from "./audio/muster_pezel_bugle.mp3?url";
import paperUnfurl from "./audio/paper_unfurl.mp3?url";
import quill from "./audio/quill_scratch.mp3?url";
import bell from "./audio/ship_bell_double.mp3?url";
import achaidh from "./audio/war_achaidh_cheide.mp3?url";
import warDrums from "./audio/war_drums_loop.mp3?url";
import fifeAndDrum from "./audio/war_fife_and_drum.mp3?url";
import waxSeal from "./audio/wax_seal_stamp.mp3?url";

export type SoundKind =
  | "letter"
  | "seal"
  | "bell"
  | "drums"
  | "cannon"
  | "volley"
  | "victory"
  | "defeat"
  | "colony"
  | "coins"
  | "honour"
  | "paper";

/** Each effect: its file, how loud, and the longest it may ring on. */
const SOUNDS: Record<SoundKind, { url: string; gain: number; max?: number }> = {
  letter: { url: quill, gain: 0.8 },
  seal: { url: waxSeal, gain: 0.9 },
  bell: { url: bell, gain: 0.55 },
  drums: { url: warDrums, gain: 0.7, max: 4.5 },
  cannon: { url: cannonShot, gain: 0.6 },
  volley: { url: musketVolley, gain: 0.5 },
  victory: { url: fanfareBrass, gain: 0.55 },
  defeat: { url: battleDistant, gain: 0.5, max: 3.5 },
  colony: { url: fanfareFife, gain: 0.5 },
  coins: { url: coins, gain: 0.7 },
  honour: { url: fanfareMonteverdi, gain: 0.5 },
  paper: { url: paperUnfurl, gain: 0.6 },
};

export type Mood = "peace" | "war";

const TRACKS: Record<Mood, { url: string; title: string }[]> = {
  peace: [
    { url: luteSuonatore, title: "Suonatore di Liuto (Kevin MacLeod)" },
    { url: villageConsort, title: "Village Consort (Kevin MacLeod)" },
    { url: harpsichord, title: "Sinfonia No. 5 (Kevin MacLeod)" },
    { url: luteTeller, title: "Teller of the Tales (Kevin MacLeod)" },
    { url: pezel, title: "Pezel, Warlike Musick (Old Guard Fife and Drum)" },
  ],
  war: [
    { url: achaidh, title: "Achaidh Cheide (Kevin MacLeod)" },
    { url: toccata, title: "Monteverdi, Toccata (Old Guard Fife and Drum)" },
    { url: fifeAndDrum, title: "Fife and Drum (Kevin MacLeod)" },
  ],
};

export interface SoundSettings {
  sfx: boolean;
  music: boolean;
  /** 0 to 1. */
  sfxVolume: number;
  musicVolume: number;
}

const SETTINGS_KEY = "derpy_conquest_sound";
const DEFAULTS: SoundSettings = {
  sfx: true,
  music: true,
  sfxVolume: 0.7,
  musicVolume: 0.35,
};

let settings: SoundSettings = readSettings();

function readSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as SoundSettings) };
    // The old one-switch setting.
    if (localStorage.getItem("derpy_conquest_muted") === "1")
      return { ...DEFAULTS, sfx: false, music: false };
  } catch {
    // ignore
  }
  return { ...DEFAULTS };
}

export function soundSettings(): SoundSettings {
  return { ...settings };
}

export function setSoundSettings(next: Partial<SoundSettings>): void {
  settings = { ...settings, ...next };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
  if (sfxGain) sfxGain.gain.value = settings.sfxVolume;
  music.apply();
}

/** Kept for older callers: everything off, or on. */
export function isMuted(): boolean {
  return !settings.sfx && !settings.music;
}

export function setMuted(m: boolean): void {
  setSoundSettings({ sfx: !m, music: !m });
}

// ---------------------------------------------------------------- effects

let ac: AudioContext | null = null;
let sfxGain: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
let unlocked = false;

function context(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  if (!ac) {
    ac = new AudioContext();
    sfxGain = ac.createGain();
    sfxGain.gain.value = settings.sfxVolume;
    sfxGain.connect(ac.destination);
  }
  if (ac.state === "suspended") void ac.resume();
  return ac;
}

function load(url: string): Promise<AudioBuffer | null> {
  let p = buffers.get(url);
  if (!p) {
    const a = context();
    p = !a
      ? Promise.resolve(null)
      : fetch(url)
          .then((r) => r.arrayBuffer())
          .then((b) => a.decodeAudioData(b))
          .catch(() => null);
    buffers.set(url, p);
  }
  return p;
}

export function play(kind: SoundKind): void {
  if (!settings.sfx || !unlocked) return;
  const def = SOUNDS[kind];
  void load(def.url).then((buf) => {
    const a = context();
    if (!buf || !a || !sfxGain) return;
    const src = a.createBufferSource();
    src.buffer = buf;
    const g = a.createGain();
    g.gain.value = def.gain;
    src.connect(g).connect(sfxGain);
    src.start();
    if (def.max && buf.duration > def.max) {
      const end = a.currentTime + def.max;
      g.gain.setValueAtTime(def.gain, end - 0.8);
      g.gain.linearRampToValueAtTime(0, end);
      src.stop(end + 0.05);
    }
  });
}

// ---------------------------------------------------------------- music

class MusicPlayer {
  private el: HTMLAudioElement | null = null;
  private fading: HTMLAudioElement | null = null;
  private mood: Mood = "peace";
  private turn: Record<Mood, number> = { peace: 0, war: 0 };
  private wanted = false;
  title = "";

  /** Begin (or carry on) playing. */
  start(): void {
    this.wanted = true;
    this.apply();
  }

  stop(): void {
    this.wanted = false;
    this.fadeOut(this.el, 600);
    this.el = null;
  }

  setMood(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    // Change tune now: war shouldn't wait for the lute to finish.
    if (this.el) {
      this.fadeOut(this.el, 2500);
      this.el = null;
      this.apply();
    }
  }

  apply(): void {
    const on = this.wanted && settings.music && unlocked;
    if (!on) {
      if (this.el) this.el.pause();
      return;
    }
    if (this.el) {
      this.el.volume = settings.musicVolume;
      if (this.el.paused) void this.el.play().catch(() => {});
      return;
    }
    this.next();
  }

  private next(): void {
    const list = TRACKS[this.mood];
    const track = list[this.turn[this.mood] % list.length];
    this.turn[this.mood]++;
    const el = new Audio(track.url);
    el.preload = "auto";
    el.volume = 0;
    this.title = track.title;
    el.addEventListener("ended", () => {
      if (this.el !== el) return;
      this.el = null;
      this.apply();
    });
    this.el = el;
    void el.play().catch(() => {});
    this.fadeIn(el, 2000);
  }

  private fadeIn(el: HTMLAudioElement, ms: number): void {
    const start = performance.now();
    const step = () => {
      if (this.el !== el) return;
      const t = Math.min(1, (performance.now() - start) / ms);
      el.volume = settings.musicVolume * t;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private fadeOut(el: HTMLAudioElement | null, ms: number): void {
    if (!el) return;
    this.fading = el;
    const from = el.volume;
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      el.volume = from * (1 - t);
      if (t < 1) requestAnimationFrame(step);
      else {
        el.pause();
        if (this.fading === el) this.fading = null;
      }
    };
    requestAnimationFrame(step);
  }
}

export const music = new MusicPlayer();

/**
 * Browsers only allow sound after the player does something: call this once,
 * and the first click or key on the page switches sound on.
 */
export function unlockOnFirstGesture(): void {
  if (unlocked || typeof window === "undefined") return;
  const go = () => {
    unlocked = true;
    context();
    music.apply();
    window.removeEventListener("pointerdown", go);
    window.removeEventListener("keydown", go);
  };
  window.addEventListener("pointerdown", go);
  window.addEventListener("keydown", go);
}
