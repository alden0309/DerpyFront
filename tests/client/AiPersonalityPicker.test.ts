// AIP (r23): the lobby's AI personality picker: Normal (free, ticked by
// default) and the four personalities, the unowned ones locked with a link
// to the store; one, several or all ticked, never none; the choice
// remembered in this browser.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiPersonalityPicker } from "../../src/client/derpy/AiPersonalityPicker";

const account = vi.hoisted(() => ({
  owned: [] as string[],
  storeOpen: true,
}));

vi.mock("../../src/client/derpy/DerpyAccount", () => ({
  DERPY_ACCOUNT_EVENT: "derpy-account-changed",
  derpyStore: async () => ({
    packs: [],
    items: account.storeOpen
      ? ["ai_mad_scientist", "ai_trader", "ai_aggressive", "ai_protector"].map(
          (name) => ({ name, category: "personalities", game: "derpyfront" }),
        )
      : [],
  }),
  derpyMe: async () => ({ owned: account.owned, coins: 0 }),
}));

const {
  initialChoices,
  ownedChoices,
  rememberedPersonalities,
  toggledChoices,
} = await import("../../src/client/derpy/AiPersonalityPicker");

describe("what the picker lets you tick", () => {
  it("Normal is free; a personality needs its store item", () => {
    expect(ownedChoices([])).toEqual(["normal"]);
    expect(
      ownedChoices([
        "pack:ai_protector",
        "pack:ai_trader",
        "pack:classics",
        // An old pack still in an inventory is no personality
        "pack:ai_pirates",
      ]),
    ).toEqual(["normal", "trader", "protector"]);
  });

  it("opens on what was ticked last time, of what you may tick now, or Normal", () => {
    const allowed = ownedChoices(["pack:ai_trader"]);
    expect(initialChoices(["trader", "protector"], allowed)).toEqual([
      "trader",
    ]);
    expect(initialChoices(["protector"], allowed)).toEqual(["normal"]);
    expect(initialChoices([], allowed)).toEqual(["normal"]);
  });

  it("one, several or all, in a fixed order, but never none, and nothing locked", () => {
    const all = ownedChoices([
      "pack:ai_mad_scientist",
      "pack:ai_trader",
      "pack:ai_aggressive",
      "pack:ai_protector",
    ]);
    let chosen = toggledChoices(["normal"], "protector", all);
    expect(chosen).toEqual(["normal", "protector"]);
    chosen = toggledChoices(chosen, "mad_scientist", all);
    expect(chosen).toEqual(["normal", "mad_scientist", "protector"]);
    chosen = toggledChoices(chosen, "normal", all);
    chosen = toggledChoices(chosen, "mad_scientist", all);
    expect(chosen).toEqual(["protector"]);
    // The last one stays ticked
    expect(toggledChoices(chosen, "protector", all)).toEqual(["protector"]);
    // Locked: no change
    expect(toggledChoices(["normal"], "trader", ["normal"])).toEqual([
      "normal",
    ]);
  });
});

describe("the picker", () => {
  type Picker = AiPersonalityPicker & {
    updateComplete: Promise<unknown>;
  };
  let picker: Picker;
  let events: string[][];

  async function mount(owned: string[]) {
    account.owned = owned;
    picker = document.createElement("ai-personality-picker") as Picker;
    events = [];
    picker.addEventListener("personalities-changed", (e) =>
      events.push((e as CustomEvent<string[]>).detail),
    );
    document.body.appendChild(picker);
    await vi.waitFor(() =>
      expect(picker.querySelector("[data-ai-personalities]")).not.toBeNull(),
    );
    await picker.updateComplete;
  }

  const choice = (c: string) =>
    picker.querySelector<HTMLElement>(`[data-choice="${c}"]`)!;

  beforeEach(() => {
    localStorage.clear();
    account.storeOpen = true;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows Normal ticked, owned ones to tick, and the rest locked with a store link", async () => {
    await mount(["pack:ai_trader"]);
    expect(choice("normal").getAttribute("aria-checked")).toBe("true");
    expect(choice("trader").tagName).toBe("BUTTON");
    expect(choice("trader").getAttribute("aria-checked")).toBe("false");
    for (const c of ["mad_scientist", "aggressive", "protector"]) {
      expect(choice(c).tagName).toBe("A");
      expect(choice(c).hasAttribute("data-locked")).toBe(true);
      expect(choice(c).getAttribute("href")).toBe(
        "/store#derpyfront/personalities",
      );
    }
    expect(picker.selected).toEqual(["normal"]);
    // Nothing to tell the lobby: Normal alone is the game's default
    expect(events).toEqual([]);
  });

  it("ticks and unticks, keeps one, and remembers the choice", async () => {
    await mount(["pack:ai_trader", "pack:ai_aggressive"]);
    choice("aggressive").click();
    await picker.updateComplete;
    choice("trader").click();
    await picker.updateComplete;
    expect(events.at(-1)).toEqual(["normal", "trader", "aggressive"]);
    choice("normal").click();
    choice("trader").click();
    await picker.updateComplete;
    expect(picker.selected).toEqual(["aggressive"]);
    // Unticking the last one doesn't, and says why
    choice("aggressive").click();
    await picker.updateComplete;
    expect(picker.selected).toEqual(["aggressive"]);
    expect(picker.textContent).toContain("ai_personalities.keep_one");
    expect(rememberedPersonalities()).toEqual(["aggressive"]);

    // The next game opens on it
    document.body.innerHTML = "";
    await mount(["pack:ai_trader", "pack:ai_aggressive"]);
    expect(picker.selected).toEqual(["aggressive"]);
  });

  it("nothing to pick on a server without the store", async () => {
    account.storeOpen = false;
    account.owned = [];
    picker = document.createElement("ai-personality-picker") as Picker;
    document.body.appendChild(picker);
    await new Promise((r) => setTimeout(r, 0));
    await picker.updateComplete;
    expect(picker.querySelector("[data-ai-personalities]")).toBeNull();
  });
});
