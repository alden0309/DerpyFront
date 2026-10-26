import { GameMapType } from "@openfront/engine-api/game/GameTypes";
import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import { scenarioTerritory } from "@openfront/engine-lib/scenario/ScenarioTerritory";
import fs from "fs";
import { it } from "vitest";

const T = "/tmp/claude-0/-home-claude-derpyfront/9fa839b2-d958-5778-bd4a-d08567bd44f7/scratchpad/r26-dfx/tools";
it("spots", () => {
  const raw = JSON.parse(fs.readFileSync(`${T}/goals_raw.json`, "utf8"));
  let out = "";
  for (const [sid, nations] of Object.entries<any>(raw)) {
    const d = scenarioData(sid)!;
    const key = Object.keys(GameMapType).find((k) => GameMapType[k as keyof typeof GameMapType] === d.map)!;
    const dir = `resources/maps/${key.toLowerCase()}`;
    const man = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, "utf8"));
    const bin = fs.readFileSync(`${dir}/map.bin`);
    const { width: W, height: H } = man.map;
    const land = (r: number) => (bin[r] & 0x80) !== 0;
    const imp = (r: number) => land(r) && (bin[r] & 0x1f) === 31;
    const labels = scenarioTerritory(d, { width: () => W, height: () => H, isLand: land, isImpassable: imp }, 1);
    const ownerAt = (x: number, y: number) => { const l = labels[y * W + x]; return l ? d.nations[l - 1] : null; };
    out += `== ${sid}\n`;
    for (const [nk, e] of Object.entries<any>(nations)) {
      const goal = e.goal;
      const n = d.nations.find((x) => x.key === nk)!;
      const at: [number, number] = goal.place.capitalOf ? d.nations.find((x) => x.key === goal.place.capitalOf)!.capital as [number, number] : goal.place.at;
      // nearest passable land
      let best: [number, number] | null = null; let r = 0;
      for (; r < 40 && !best; r++) {
        let bd = Infinity;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = at[0] + dx, y = at[1] + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const t = y * W + x; if (!land(t) || imp(t)) continue;
          const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = [x, y]; }
        }
      }
      const o = best ? ownerAt(best[0], best[1]) : null;
      const own = o?.key === nk; const sameSide = o && n.side !== null && o.side === n.side;
      let flag = "";
      if (goal.kind === "take" && (own || (goal.side && sameSide))) flag = "  <-- ALREADY HELD";
      if (goal.kind !== "take" && goal.place.capitalOf === nk && !own) flag = "  <-- NOT OWN";
      if (goal.kind === "keep" && goal.side && !sameSide && !own) flag = "  <-- SIDE DOESN'T HOLD";
      if (goal.kind === "take" && o && o.side === null && n.side === null) flag += "  (neutral vs neutral)";
      out += `  ${nk.padEnd(18)} ${goal.kind.padEnd(5)} ${(goal.place.name ?? "cap:" + goal.place.capitalOf).padEnd(22)} at=${at} land=${best} r=${r - 1} owner=${o?.key ?? "none"}(${o?.side ?? "N"})${flag}\n`;
    }
  }
  fs.writeFileSync(`${T}/spots.txt`, out);
}, 300000);
