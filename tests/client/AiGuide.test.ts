// SITE (r22): the Derp Store's guide to DerpyFront's AI personality packs
// says what the engine really does. Its numbers come from the engine's
// tuning, its words match en.json, and what it says of each pack matches
// the pack's personas.

import {
  AI_PERSONALITY_PACKS,
  TEMPERAMENT_TUNING,
  TEMPERAMENTS,
} from "@openfront/engine-lib/game/AiPersonalities";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";
import {
  AI_ASPECTS,
  AI_GUIDE_EN,
  GUIDE_COLUMNS,
  guideEn,
  guideParams,
  guideShares,
  pacePercent,
  packMix,
  samePlayAs,
  USUAL_DEFENSE_THREAT,
  USUAL_MAX_SILOS,
  USUAL_SHARES,
} from "../../src/derpland/AiGuide";
import { TEMPERAMENT_TEXT } from "../../src/derpland/StorePreviews";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const en = JSON.parse(
  fs.readFileSync(path.join(ROOT, "resources/lang/en.json"), "utf8"),
);
const source = (f: string) =>
  fs.readFileSync(path.join(ROOT, "packages/engine/src", f), "utf8");

const PACKS = AI_PERSONALITY_PACKS.map((p) => p.id);

describe("the guide's words", () => {
  test("en.json has them word for word (DerpyFront's store page)", () => {
    expect(en.ai_personalities.guide).toEqual(AI_GUIDE_EN);
  });

  test("every temperament, the usual AI and every pack, on every aspect", () => {
    for (const a of AI_ASPECTS) {
      expect(AI_GUIDE_EN[`aspect_${a}`]).toBeTruthy();
      for (const c of GUIDE_COLUMNS) {
        expect(AI_GUIDE_EN[`${c}_${a}`], `${c}_${a}`).toBeTruthy();
      }
      for (const p of PACKS) {
        expect(AI_GUIDE_EN[`${p}_${a}`], `${p}_${a}`).toBeTruthy();
      }
    }
    for (const p of PACKS) {
      expect(AI_GUIDE_EN[`${p}_lean`]).toBeTruthy();
      expect(AI_GUIDE_EN[`${p}_short`]).toBeTruthy();
    }
  });

  test("every number is filled in", () => {
    for (const c of GUIDE_COLUMNS) {
      for (const a of AI_ASPECTS) {
        expect(guideEn(`${c}_${a}`, guideParams(c))).not.toMatch(/[{}]/);
      }
    }
  });

  test("the temperaments' hints match en.json's", () => {
    for (const t of TEMPERAMENTS) {
      expect(TEMPERAMENT_TEXT[t].hint).toBe(en.derpy[`temperament_hint_${t}`]);
      expect(TEMPERAMENT_TEXT[t].label).toBe(en.derpy[`temperament_${t}`]);
    }
  });
});

describe("the numbers are the engine's", () => {
  test("a nation's usual shares are what NationExecution draws", () => {
    const exec = source("execution/NationExecution.ts");
    const draw = (name: string, [lo, hi]: readonly [number, number]) =>
      `this.${name}Ratio = this.random.nextInt(${Math.round(lo * 100)}, ${Math.round(hi * 100) + 1}) / 100;`;
    expect(exec).toContain(draw("trigger", USUAL_SHARES.trigger));
    expect(exec).toContain(draw("reserve", USUAL_SHARES.reserve));
    expect(exec).toContain(draw("expand", USUAL_SHARES.expand));
  });

  test("the usual buildings are NationStructureBehavior's", () => {
    const sb = source("execution/nation/NationStructureBehavior.ts");
    expect(sb).toContain(`const MAX_MISSILE_SILOS = ${USUAL_MAX_SILOS};`);
    expect(sb).toContain(
      `const UNDER_ATTACK_THREAT_RATIO = ${USUAL_DEFENSE_THREAT};`,
    );
    // "the first at 3 cities"; a Nuker's at 2.
    expect(sb).toContain("const FIRST_MISSILE_SILO_RATIO = 0.4;");
    expect(Math.floor(3 * 0.4)).toBe(1);
    expect(Math.floor(2 * 0.4)).toBe(0);
    expect(Math.floor(2 * TEMPERAMENT_TUNING.nuker.firstSiloRatio)).toBe(1);
    expect(Math.floor(1 * TEMPERAMENT_TUNING.nuker.firstSiloRatio)).toBe(0);
    // "3 for every 4 cities"; silos 0.2 a city, a Nuker's one for every 2.
    expect(sb).toMatch(
      /\[UnitType\.Port\]: \{ ratioPerCity: 0\.75[\s\S]*ratioPerCity: 0\.75,[\s\S]*\[UnitType\.MissileSilo\]: \{\s*ratioPerCity: 0\.2,/,
    );
    expect(0.2 * TEMPERAMENT_TUNING.nuker.structures["Missile Silo"]!).toBe(
      0.5,
    );
    // "half the missile silos", "twice the SAMs".
    expect(TEMPERAMENT_TUNING.trader.structures["Missile Silo"]).toBe(0.5);
    expect(TEMPERAMENT_TUNING.turtle.structures["Missile Silo"]).toBe(0.5);
    expect(TEMPERAMENT_TUNING.turtle.structures["SAM Launcher"]).toBe(2);
  });

  test("the shares each temperament plays by", () => {
    expect(guideShares("usual")).toEqual({
      trigger: [0.5, 0.59],
      reserve: [0.3, 0.39],
      expand: [0.1, 0.19],
    });
    const p = (c: (typeof GUIDE_COLUMNS)[number]) => guideParams(c);
    expect([p("aggressive").trigger, p("aggressive").reserve]).toEqual([
      "38–47%",
      "22–31%",
    ]);
    expect([p("trader").trigger, p("trader").reserve]).toEqual([
      "58–67%",
      "35–44%",
    ]);
    expect([
      p("turtle").trigger,
      p("turtle").reserve,
      p("turtle").expand,
    ]).toEqual(["65–74%", "42–51%", "7–16%"]);
    expect([p("nuker").trigger, p("nuker").silos]).toEqual(["55–64%", "6"]);
    expect([p("opportunist").trigger, p("opportunist").expand]).toEqual([
      "44–53%",
      "15–24%",
    ]);
    expect(p("turtle").threat).toBe("21%");
    expect(p("trader").ports).toBe("60%");
    expect(p("aggressive").sams).toBe("60%");
  });

  test("faster and slower say which way the pace goes", () => {
    for (const t of TEMPERAMENTS) {
      const rate = TEMPERAMENT_TUNING[t].attackRate;
      const words = AI_GUIDE_EN[`${t}_expands`];
      if (rate < 1) expect(words, t).toContain("{pace}% faster");
      else if (rate > 1) expect(words, t).toContain("{pace}% slower");
      else expect(words, t).toContain("the usual pace");
    }
    expect(pacePercent(0.8)).toBe(20);
    expect(pacePercent(1.25)).toBe(25);
  });

  test("who never embargoes and who nukes only attackers", () => {
    for (const t of TEMPERAMENTS) {
      const tune = TEMPERAMENT_TUNING[t];
      expect(
        AI_GUIDE_EN[`${t}_allies`].includes("never starts an embargo"),
      ).toBe(!tune.embargoes);
      expect(
        AI_GUIDE_EN[`${t}_nukes`].includes("only at a player attacking it"),
      ).toBe(tune.nukesOnlyAttackers);
    }
  });
});

describe("what it says of each pack", () => {
  const ALL_NAMES = AI_PERSONALITY_PACKS.flatMap((p) => p.personas);

  test("it names only the pack's own personas", () => {
    for (const p of PACKS) {
      const words = [...AI_ASPECTS.map((a) => `${p}_${a}`), `${p}_lean`]
        .map((k) => AI_GUIDE_EN[k])
        .join(" ");
      for (const x of ALL_NAMES) {
        if (x.pack !== p)
          expect(words, `${p}: ${x.name}`).not.toContain(x.name);
      }
    }
  });

  test("the personas that never embargo, or nuke only attackers, are named", () => {
    for (const pack of AI_PERSONALITY_PACKS) {
      const allies = AI_GUIDE_EN[`${pack.id}_allies`];
      for (const x of pack.personas) {
        if (!TEMPERAMENT_TUNING[x.temperament].embargoes) {
          expect(allies, x.name).toContain(x.name);
        }
      }
      // Either every one that nukes only attackers is named, or every one
      // that doesn't ("only Monopolia and The Tollgate Barons nuke…").
      const nukes = AI_GUIDE_EN[`${pack.id}_nukes`];
      const only = pack.personas.filter(
        (x) => TEMPERAMENT_TUNING[x.temperament].nukesOnlyAttackers,
      );
      const rest = pack.personas.filter((x) => !only.includes(x));
      expect(
        only.every((x) => nukes.includes(x.name)) ||
          rest.every((x) => nukes.includes(x.name)),
        pack.id,
      ).toBe(true);
    }
  });

  test("the mixes it describes", () => {
    expect(packMix("ai_pirates").aggressive).toBe(2);
    expect(packMix("ai_warlords").aggressive).toBe(2);
    expect(packMix("ai_empires")).toMatchObject({ turtle: 2, aggressive: 1 });
    expect(packMix("ai_merchants")).toMatchObject({ trader: 3, nuker: 0 });
    expect(packMix("ai_scientists").nuker).toBe(2);
    for (const p of PACKS) {
      if (p !== "ai_scientists") expect(packMix(p).nuker).toBeLessThan(2);
      expect(Object.values(packMix(p)).reduce((a, b) => a + b, 0)).toBe(6);
    }
    // Pirate Lords and Frontier Warlords play alike, and the store says so.
    expect(samePlayAs("ai_pirates")).toEqual(["ai_warlords"]);
    expect(samePlayAs("ai_warlords")).toEqual(["ai_pirates"]);
    expect(samePlayAs("ai_empires")).toEqual([]);
  });
});
