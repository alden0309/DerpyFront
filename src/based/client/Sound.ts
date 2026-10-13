// Ambient sound for Mr. Based: one looping bed at a time (rain outside, rain
// on the bar's windows), crossfaded when the scene changes. Web Audio, so the
// loop has no gap; it starts only after the player has clicked something.

import { media } from "./Api";

const FADE = 1.6;

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private playing: {
    key: string;
    src: AudioBufferSourceNode;
    gain: GainNode;
  } | null = null;
  private wanted: string | null = null;
  private volume = 0.7;
  private muted = false;

  /** Call from a click: browsers only allow sound after one. */
  unlock(): void {
    if (this.ctx === null) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyVolume();
    }
    void this.ctx.resume();
    if (this.wanted !== null && this.playing?.key !== this.wanted) {
      void this.play(this.wanted);
    }
  }

  setVolume(volume: number, muted: boolean): void {
    this.volume = volume;
    this.muted = muted;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (!this.ctx || !this.master) return;
    const v = this.muted ? 0 : this.volume * 0.8;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.15);
  }

  private buffer(key: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(key);
    if (p === undefined) {
      p = (async () => {
        try {
          const url = await media("audio", key);
          const data = await (await fetch(url)).arrayBuffer();
          return await this.ctx!.decodeAudioData(data);
        } catch {
          return null;
        }
      })();
      this.buffers.set(key, p);
    }
    return p;
  }

  /** The bed to play now, or null for silence. */
  async play(key: string | null): Promise<void> {
    this.wanted = key;
    if (this.ctx === null || this.master === null) return;
    if (this.playing?.key === key) return;
    const ctx = this.ctx;
    const old = this.playing;
    this.playing = null;
    if (old) {
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, FADE / 3);
      old.src.stop(ctx.currentTime + FADE * 2);
    }
    if (key === null) return;
    const buf = await this.buffer(key);
    if (buf === null || this.wanted !== key || this.playing !== null) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // MP3s carry a little silence at each end; loop inside it.
    src.loopStart = Math.min(0.06, buf.duration / 4);
    src.loopEnd = Math.max(buf.duration - 0.06, src.loopStart + 0.1);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, ctx.currentTime, FADE / 3);
    src.connect(gain).connect(this.master);
    src.start(0, src.loopStart);
    this.playing = { key, src, gain };
  }

  stop(): void {
    void this.play(null);
  }
}
