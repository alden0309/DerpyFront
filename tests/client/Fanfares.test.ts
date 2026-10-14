// DFSTORE (r21): the victory fanfares, synthesised with WebAudio.

import { afterEach, describe, expect, test } from "vitest";
import {
  chooseFanfare,
  chosenFanfare,
  FANFARE_NAMES,
  fanfareScore,
  fanfareSeconds,
  playFanfare,
} from "../../src/client/derpy/Fanfares";

/** Just enough of an AudioContext to schedule into, counting the nodes. */
function fakeContext() {
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime(v: number) {
      if (!(v > 0)) throw new Error("exponential ramp to a non-positive value");
    },
    cancelScheduledValues() {},
  });
  const node = () => ({ connect() {}, disconnect() {} });
  const counts = { osc: 0, noise: 0 };
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    state: "running",
    destination: node(),
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator: () => {
      counts.osc++;
      return {
        ...node(),
        type: "sine",
        frequency: param(),
        detune: param(),
        start() {},
        stop() {},
      };
    },
    createBiquadFilter: () => ({
      ...node(),
      type: "lowpass",
      frequency: param(),
      Q: param(),
    }),
    createBuffer: (_c: number, n: number) => {
      const data = new Float32Array(n);
      return { sampleRate: 8000, getChannelData: () => data };
    },
    createBufferSource: () => {
      counts.noise++;
      return { ...node(), buffer: null, start() {}, stop() {} };
    },
    resume: async () => {},
  };
  return { ctx: ctx as unknown as AudioContext, counts };
}

afterEach(() => localStorage.clear());

describe("the fanfares", () => {
  test.each([...FANFARE_NAMES])("%s is a short, playable tune", (name) => {
    const s = fanfareScore(name);
    expect(s.notes.length).toBeGreaterThan(8);
    for (const [start, len, midi] of s.notes) {
      expect(start).toBeGreaterThanOrEqual(0);
      expect(len).toBeGreaterThan(0);
      expect(midi === 0 || (midi >= 36 && midi <= 96)).toBe(true);
    }
    const seconds = fanfareSeconds(name);
    expect(seconds).toBeGreaterThan(3);
    expect(seconds).toBeLessThan(10);

    const { ctx, counts } = fakeContext();
    const playback = playFanfare(name, { ctx, volume: 0.5 });
    expect(playback?.duration).toBe(seconds);
    // Cheap enough for a phone: a few hundred nodes at most.
    expect(counts.osc + counts.noise).toBeGreaterThan(5);
    expect(counts.osc + counts.noise).toBeLessThan(400);
    playback?.stop();
  });

  test("silent at no volume", () => {
    const { ctx, counts } = fakeContext();
    expect(playFanfare("fanfare_brass", { ctx, volume: 0 })).toBeNull();
    expect(counts.osc).toBe(0);
  });

  test("your choice is kept in this browser, and only real fanfares", () => {
    expect(chosenFanfare()).toBeNull();
    chooseFanfare("fanfare_shanty");
    expect(chosenFanfare()).toBe("fanfare_shanty");
    localStorage.setItem("derpy.fanfare", "fanfare_kazoo");
    expect(chosenFanfare()).toBeNull();
    chooseFanfare(null);
    expect(localStorage.getItem("derpy.fanfare")).toBeNull();
  });
});
