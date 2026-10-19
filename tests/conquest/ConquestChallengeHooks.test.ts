// CHAL (r25): the counts Derpy Conquest now keeps for two weekly challenges
// (a climb to a trade's third rung; a town retaken for your crown), kept in
// the game's state like the other achievement counts, so they survive a save
// and come down the delta.

import { describe, expect, test } from "vitest";
import { achCount, RETOOK_COUNT } from "../../src/conquest/engine/Achievements";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { milestone } from "../../src/conquest/engine/LifeCore";
import { promote, RUNG3_COUNT } from "../../src/conquest/engine/Work";
import { lifeOf, map, prov, world } from "./LifeUtil";

function farmer(g: ConquestGame, rank: number) {
  const life = lifeOf(g);
  life.job = {
    kind: "farmer",
    rank,
    prov: life.home,
    place: "fields",
    employer: -1,
    nation: -1,
    army: -1,
    since: g.s.day,
    months: 0,
    away: 0,
  };
  return life;
}

describe("the challenges' counts", () => {
  test("each promotion to a third rung is counted, once per climb", () => {
    const g = world();
    const life = farmer(g, 0);
    promote(g, life);
    expect(achCount(life, RUNG3_COUNT)).toBe(0);
    promote(g, life);
    expect(life.job!.rank).toBe(2);
    expect(achCount(life, RUNG3_COUNT)).toBe(1);
    promote(g, life);
    expect(achCount(life, RUNG3_COUNT)).toBe(1);
    // A new trade, climbed again: counted again.
    farmer(g, 1);
    promote(g, life);
    expect(achCount(life, RUNG3_COUNT)).toBe(2);
  });

  test("a town retaken in a siege, or with the crown's regiments, is counted", () => {
    const g = world();
    const life = lifeOf(g);
    const p = prov("Jamestown");
    milestone(g, life, "battle", "Took Port Royal after a siege", p);
    expect(achCount(life, RETOOK_COUNT)).toBe(0);
    milestone(g, life, "battle", "Retook St. Augustine after a siege", p);
    expect(achCount(life, RETOOK_COUNT)).toBe(1);
    milestone(
      g,
      life,
      "renown",
      "Took back St. Augustine with the crown's regiments",
      p,
    );
    expect(achCount(life, RETOOK_COUNT)).toBe(2);
    // A secret moment isn't counted (nor told).
    milestone(g, life, "battle", "Retook Havana after a siege", p, {
      sec: true,
    });
    expect(achCount(life, RETOOK_COUNT)).toBe(2);
  });

  test("the counts survive a save, and the same game plays the same", () => {
    const g = world({ seed: 11 });
    const life = farmer(g, 1);
    promote(g, life);
    milestone(g, life, "battle", "Retook Jamestown after a siege");
    const again = new ConquestGame(map, JSON.parse(JSON.stringify(g.state)));
    const l2 = lifeOf(again);
    expect(achCount(l2, RUNG3_COUNT)).toBe(1);
    expect(achCount(l2, RETOOK_COUNT)).toBe(1);
    // The delta carries them to the player.
    const d = JSON.stringify(g.takeDelta());
    expect(d).toContain(`"${RUNG3_COUNT}":1`);
    expect(d).toContain(`"${RETOOK_COUNT}":1`);
    for (let i = 0; i < 40; i++) {
      g.tick();
      again.tick();
    }
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(g.state));
  });
});
