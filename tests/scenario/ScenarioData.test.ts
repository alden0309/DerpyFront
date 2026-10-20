// SCEN (r25): every scenario's data is complete: its flags exist, and the
// en.json keys its screens and game need are there and match the data.

import { allScenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const en = JSON.parse(
  fs.readFileSync(path.join(ROOT, "resources/lang/en.json"), "utf8"),
);

describe.each(allScenarioData().map((d) => [d.id, d] as const))(
  "scenario %s",
  (id, data) => {
    it("uses flags that exist in resources/flags", () => {
      const missing = data.nations
        .map((n) => n.flag)
        .filter(
          (f) => !fs.existsSync(path.join(ROOT, "resources/flags", `${f}.svg`)),
        );
      expect(missing).toEqual([]);
    });

    it("has its words in en.json", () => {
      const s = en.scenarios[id];
      expect(s?.title).toBe(data.title);
      expect(typeof s?.date).toBe("string");
      expect(typeof s?.description).toBe("string");
      for (const side of data.sides) {
        const key = side.id.toLowerCase();
        expect(en.team_colors[key]).toBe(side.name);
        expect(typeof en.scenarios.win[key]).toBe("string");
      }
      for (const n of data.nations) {
        expect(en.scenario_nation[n.key]).toBe(n.name);
      }
    });

    it("names nations, sides and win rules that exist", () => {
      const keys = new Set(data.nations.map((n) => n.key));
      expect(keys.size).toBe(data.nations.length);
      const sides = new Set(data.sides.map((s) => s.id));
      for (const n of data.nations) {
        if (n.side !== null) expect(sides.has(n.side)).toBe(true);
      }
      for (const s of data.sides) {
        for (const k of s.winByHolding?.nations ?? []) {
          expect(keys.has(k)).toBe(true);
        }
      }
    });
  },
);
