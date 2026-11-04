// FX (r28): the Derp Store packs' layered bursts — the theme data and the
// numbers the renderer draws them from.
import {
  BURST_CAP,
  BURST_DEBRIS,
  BURST_LOOK_COLORS,
  BURST_PARTICLE_CAP,
  BURST_RESIDUE,
  burstLookTable,
  burstPlan,
  DERPY_FX_THEMES,
  DOME_SHIMMER_CODE,
  domeStyleIndex,
  fxEffectNames,
  fxThemeIndex,
  fxThemeOfEffect,
  hexRgb01,
  luminance,
  rampAt,
} from "@openfront/shared/DerpyFx";
import { describe, expect, it } from "vitest";

const HEX = /^#[0-9a-f]{6}$/i;

describe("each pack's burst look", () => {
  it("has valid colours and kinds", () => {
    for (const t of DERPY_FX_THEMES) {
      const b = t.burst;
      const colors = [
        b.flash,
        ...b.fireball,
        b.ring,
        ...b.debris.colors,
        ...b.residue.colors,
      ];
      expect(colors, t.name).toHaveLength(BURST_LOOK_COLORS);
      for (const c of colors) expect(c, t.name).toMatch(HEX);
      expect(BURST_DEBRIS).toContain(b.debris.kind);
      expect(BURST_RESIDUE).toContain(b.residue.kind);
    }
  });

  it("gives every pack its own debris, residue and Dome shimmer", () => {
    const debris = DERPY_FX_THEMES.map((t) => t.burst.debris.kind);
    const residue = DERPY_FX_THEMES.map((t) => t.burst.residue.kind);
    const shimmer = DERPY_FX_THEMES.map((t) => t.dome.shimmer);
    expect(new Set(debris).size).toBe(DERPY_FX_THEMES.length);
    expect(new Set(residue).size).toBe(DERPY_FX_THEMES.length);
    expect(new Set(shimmer).size).toBe(DERPY_FX_THEMES.length);
    expect(new Set(Object.values(DOME_SHIMMER_CODE)).size).toBe(
      Object.keys(DOME_SHIMMER_CODE).length,
    );
  });

  it("matches the brief's characters", () => {
    const by = (name: string) =>
      DERPY_FX_THEMES.find((t) => t.name === name)!.burst;
    expect(by("fx_solar").residue.kind).toBe("flare");
    expect(by("fx_toxic").debris.kind).toBe("embers");
    expect(by("fx_toxic").residue.kind).toBe("haze");
    expect(by("fx_frost").debris.kind).toBe("shards");
    expect(by("fx_frost").residue.kind).toBe("mist");
    expect(by("fx_banana").debris.kind).toBe("confetti");
    expect(by("fx_cosmic").residue.kind).toBe("nebula");
    expect(by("fx_golden").debris.kind).toBe("coins");
    expect(by("fx_golden").residue.kind).toBe("rays");
  });

  it("cools: each fireball ramp runs from bright to dark", () => {
    for (const t of DERPY_FX_THEMES) {
      const lum = t.burst.fireball.map(luminance);
      for (let i = 1; i < lum.length; i++) {
        expect(lum[i], `${t.name} step ${i}`).toBeLessThan(lum[i - 1]);
      }
    }
  });
});

describe("rampAt", () => {
  const ramp = ["#ffffff", "#ff0000", "#000000"];
  it("starts and ends on the ramp's ends", () => {
    expect(rampAt(ramp, 0)).toEqual([1, 1, 1]);
    expect(rampAt(ramp, 1)).toEqual([0, 0, 0]);
    expect(rampAt(ramp, -3)).toEqual([1, 1, 1]);
    expect(rampAt(ramp, 9)).toEqual([0, 0, 0]);
  });
  it("blends between neighbours", () => {
    expect(rampAt(ramp, 0.5)).toEqual([1, 0, 0]);
    const q = rampAt(ramp, 0.25);
    expect(q[0]).toBeCloseTo(1);
    expect(q[1]).toBeCloseTo(0.5);
  });
  it("handles one colour, and none", () => {
    expect(rampAt(["#00ff00"], 0.7)).toEqual([0, 1, 0]);
    expect(rampAt([], 0.5)).toEqual([1, 1, 1]);
  });
});

describe("burstLookTable", () => {
  it("lays the packs out in theme order, flash first", () => {
    const table = burstLookTable();
    expect(table).toHaveLength(DERPY_FX_THEMES.length * BURST_LOOK_COLORS * 3);
    DERPY_FX_THEMES.forEach((t, k) => {
      const at = (i: number) =>
        Array.from(table.slice((k * 12 + i) * 3, (k * 12 + i) * 3 + 3));
      expect(at(0)).toEqual(hexRgb01(t.burst.flash).map((v) => Math.fround(v)));
      expect(at(5)).toEqual(hexRgb01(t.burst.ring).map((v) => Math.fround(v)));
      expect(at(11)).toEqual(
        hexRgb01(t.burst.residue.colors[2]).map((v) => Math.fround(v)),
      );
    });
  });
});

describe("burstPlan", () => {
  const theme = DERPY_FX_THEMES[0];

  it("makes a hydrogen bomb bigger and longer than an atom bomb", () => {
    const atom = burstPlan(theme, "atom", "full");
    const hydro = burstPlan(theme, "hydro", "full");
    expect(hydro.ringRadius).toBeGreaterThan(atom.ringRadius);
    expect(hydro.fireballRadius).toBeGreaterThan(atom.fireballRadius);
    expect(hydro.fireballSec).toBeGreaterThan(atom.fireballSec);
    expect(hydro.residueSec).toBeGreaterThan(atom.residueSec);
    expect(hydro.debris).toBeGreaterThan(atom.debris);
  });

  it("keeps the catalog's ring sizes", () => {
    expect(burstPlan(theme, "atom", "full").ringRadius).toBe(100);
    expect(burstPlan(theme, "hydro", "full").ringRadius).toBe(230);
    expect(burstPlan(theme, "mirvWarhead", "full").ringRadius).toBe(55);
  });

  it("keeps MIRV warheads cheap: a few sparks, no residue", () => {
    for (const t of DERPY_FX_THEMES) {
      const w = burstPlan(t, "mirvWarhead", "full");
      expect(w.debris, t.name).toBeLessThanOrEqual(12);
      expect(w.residue).toBe(0);
      expect(w.residueField).toBe(false);
    }
  });

  it("gives the Dome's burst less than an atom bomb's", () => {
    const atom = burstPlan(theme, "atom", "full");
    const stop = burstPlan(theme, "domeStop", "full");
    expect(stop.ringRadius).toBeLessThan(atom.ringRadius);
    expect(stop.debris).toBeLessThan(atom.debris);
  });

  it("scales debris with the pack's density, within bounds", () => {
    const golden = DERPY_FX_THEMES.find((t) => t.name === "fx_golden")!;
    const toxic = DERPY_FX_THEMES.find((t) => t.name === "fx_toxic")!;
    const g = burstPlan(golden, "atom", "full").debris;
    const x = burstPlan(toxic, "atom", "full").debris;
    expect(g).toBeGreaterThan(x);
    expect(g).toBeLessThanOrEqual(Math.round(90 * 1.35));
  });

  it("falls back to a lighter burst on the low setting", () => {
    for (const t of DERPY_FX_THEMES) {
      for (const kind of [
        "atom",
        "hydro",
        "mirvWarhead",
        "domeStop",
      ] as const) {
        const full = burstPlan(t, kind, "full");
        const light = burstPlan(t, kind, "light");
        expect(light.debris).toBeLessThanOrEqual(Math.ceil(full.debris * 0.4));
        expect(light.residue).toBe(0);
        expect(light.residueField).toBe(false);
        // The blast itself still reads: flash, fireball and ring stay.
        expect(light.ringRadius).toBe(full.ringRadius);
        expect(light.fireballRadius).toBe(full.fireballRadius);
        expect(light.flashSec).toBe(full.flashSec);
        expect(light.flashRadius).toBeLessThan(full.flashRadius);
      }
    }
  });

  it("fits a heavy strike inside the particle cap", () => {
    // Four atom bombs, two hydrogen bombs and a whole MIRV, all at once.
    for (const detail of ["full", "light"] as const) {
      for (const t of DERPY_FX_THEMES) {
        const n = (k: "atom" | "hydro" | "mirvWarhead") => {
          const p = burstPlan(t, k, detail);
          return p.debris + p.residue;
        };
        const total = 4 * n("atom") + 2 * n("hydro") + 350 * n("mirvWarhead");
        expect(total, `${t.name} ${detail}`).toBeLessThanOrEqual(
          BURST_PARTICLE_CAP[detail],
        );
      }
    }
    expect(BURST_PARTICLE_CAP.light).toBeLessThan(BURST_PARTICLE_CAP.full);
    expect(BURST_CAP).toBeGreaterThanOrEqual(350 + 6);
  });
});

describe("pack lookups", () => {
  it("finds the pack behind each of its effect names", () => {
    for (const t of DERPY_FX_THEMES) {
      for (const name of Object.values(fxEffectNames(t))) {
        expect(fxThemeOfEffect(name)).toBe(t);
      }
    }
    expect(fxThemeOfEffect("rainbow_trail")).toBeUndefined();
    expect(fxThemeOfEffect("")).toBeUndefined();
  });

  it("indexes packs the way the Dome renderer does", () => {
    for (const t of DERPY_FX_THEMES) {
      expect(fxThemeIndex(t)).toBe(domeStyleIndex(t.name));
      expect(fxThemeIndex(t)).toBeGreaterThan(0);
    }
    expect(fxThemeIndex(undefined)).toBe(0);
  });
});
