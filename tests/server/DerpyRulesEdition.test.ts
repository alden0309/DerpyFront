import { describe, expect, test } from "vitest";
import { withRulesEdition } from "../../src/server/derpy/DerpyGames";

describe("a saved game's rules edition", () => {
  test("games saved before editions existed replay under the first rules", () => {
    const old = { info: { config: { gameMap: "Florida - Detailed" } } };
    expect(withRulesEdition(old)).toEqual({
      info: { config: { gameMap: "Florida - Detailed", derpyRules: 1 } },
    });
  });

  test("a game saved with its edition keeps it", () => {
    const saved = { info: { config: { derpyRules: 2 } } };
    expect(withRulesEdition(saved)).toEqual({
      info: { config: { derpyRules: 2 } },
    });
  });

  test("something that isn't a record passes through", () => {
    expect(withRulesEdition(null)).toBeNull();
    expect(withRulesEdition({})).toEqual({});
  });
});
