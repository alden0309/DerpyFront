// DFX (r26): OpenFront server features switched off on Derp Land
// (src/server/derpy/UpstreamFeatures.ts), and the one place each starts
// checking its switch.

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, test } from "vitest";
import { RANKED_MATCHMAKING_ENABLED } from "../../src/server/derpy/UpstreamFeatures";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

describe("ranked matchmaking's check-in loops", () => {
  test("are switched off", () => {
    expect(RANKED_MATCHMAKING_ENABLED).toBe(false);
  });

  test("start only from the worker, behind the switch", () => {
    const callers = sources("src/server").filter((p) =>
      /startRankedCheckinLoops\(\{/.test(readFileSync(p, "utf8")),
    );
    expect(callers.map((p) => p.replace(/\\/g, "/"))).toEqual([
      "src/server/Worker.ts",
    ]);
    const src = readFileSync("src/server/Worker.ts", "utf8");
    const call = src.indexOf("startRankedCheckinLoops({");
    const guard = src.lastIndexOf(
      "if (!RANKED_MATCHMAKING_ENABLED) return;",
      call,
    );
    expect(guard).toBeGreaterThan(0);
    // The guard opens the same callback the call is in: nothing between
    // them closes a block.
    expect(src.slice(guard, call)).not.toContain("}");
  });
});
