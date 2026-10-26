import { GameMapType } from "@openfront/engine-api/game/GameTypes";
import { allScenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import { scenarioTerritory } from "@openfront/engine-lib/scenario/ScenarioTerritory";
import fs from "fs";
import { it } from "vitest";

const OUT = "/tmp/claude-0/-home-claude-derpyfront/9fa839b2-d958-5778-bd4a-d08567bd44f7/scratchpad/r26-dfx/tools/adjacency.txt";
it("adjacency", () => {
  let out = "";
  for (const d of allScenarioData()) {
    const key = Object.keys(GameMapType).find((k) => GameMapType[k as keyof typeof GameMapType] === d.map)!;
    const dir = `resources/maps/${key.toLowerCase()}`;
    const man = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, "utf8"));
    const bin = fs.readFileSync(`${dir}/map4x.bin`);
    const { width: W, height: H } = man.map4x;
    const land = (r: number) => (bin[r] & 0x80) !== 0;
    const labels = scenarioTerritory(d, { width: () => W, height: () => H, isLand: land, isImpassable: (r) => land(r) && (bin[r] & 0x1f) === 31 }, 2);
    const adj = new Map<number, Map<number, number>>();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = labels[y * W + x]; if (!a) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const xx = x + dx, yy = y + dy; if (xx >= W || yy >= H) continue;
        const b = labels[yy * W + xx]; if (!b || b === a) continue;
        for (const [p, q] of [[a, b], [b, a]]) {
          let m = adj.get(p); if (!m) adj.set(p, (m = new Map()));
          m.set(q, (m.get(q) ?? 0) + 1);
        }
      }
    }
    out += `== ${d.id}\n`;
    d.nations.forEach((n, i) => {
      const m = adj.get(i + 1) ?? new Map();
      const list = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([j, c]) => `${d.nations[j - 1].key}(${d.nations[j - 1].side ?? "N"}:${c})`);
      out += `  ${n.key} [${n.side ?? "neutral"}] -> ${list.join(", ")}\n`;
    });
  }
  fs.writeFileSync(OUT, out);
}, 120000);
