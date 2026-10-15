// AIP (r23): who's what in a game. Each AI nation's personality comes on its
// first PlayerUpdate; the info panel shows a badge, the tooltip and the
// leaderboard its icon, and the in-game menu lists every AI nation by
// personality.

import { PlayerType } from "@openfront/engine-api/game/GameTypes";
import {
  GameUpdateType,
  PlayerUpdate,
} from "@openfront/engine-api/game/GameUpdates";
import { EventBus } from "@openfront/shared/EventBus";
import { html, render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { crazyGamesSDK } from "../../src/client/CrazyGamesSDK";
import {
  AI_CHOICE_ICON,
  aiChoiceLabel,
  aiTypeOf,
} from "../../src/client/derpy/AiPersonalityLabels";
import { PlayerPanel } from "../../src/client/hud/layers/PlayerPanel";
import { withPersonalityIcon } from "../../src/client/hud/layers/PlayerStats";
import {
  SettingsModal,
  ShowSettingsModalEvent,
} from "../../src/client/hud/layers/SettingsModal";
import { playerStaticFromUpdate } from "../../src/client/view/EntityState";
import { PlayerView } from "../../src/client/view/PlayerView";

function update(extra: Partial<PlayerUpdate>): PlayerUpdate {
  return {
    type: GameUpdateType.Player,
    id: "p1",
    smallID: 3,
    name: "Spain",
    displayName: "Spain",
    clanTag: null,
    clientID: null,
    playerType: PlayerType.Nation,
    isLobbyCreator: false,
    ...extra,
  };
}

/** A PlayerView's personality, read the way the HUD reads it. */
function personalityOf(pu: PlayerUpdate) {
  const view = { static: playerStaticFromUpdate(pu) };
  return PlayerView.prototype.aiPersonality.call(view as PlayerView);
}

/** Just enough of a PlayerView for the HUD's personality bits. */
function fakeView(name: string, type: string | null, alive = true) {
  return {
    name: () => name,
    displayName: () => name,
    type: () => (type === "tribe" ? PlayerType.Bot : PlayerType.Nation),
    aiPersonality: () => aiTypeOf(type),
    isAlive: () => alive,
  } as unknown as PlayerView;
}

describe("a nation's personality on the client", () => {
  it("comes on its first update, and nowhere else", () => {
    expect(personalityOf(update({ aiPersonality: "protector" }))).toBe(
      "protector",
    );
    expect(personalityOf(update({}))).toBeNull();
    // An unknown id (a newer server, a bad replay) shows nothing
    expect(personalityOf(update({ aiPersonality: "pirate_king" }))).toBeNull();
  });

  it("the tooltip and leaderboard show its icon; Normal nations show none", () => {
    expect(aiChoiceLabel("trader")).toBe(
      `${AI_CHOICE_ICON.trader} ai_personalities.type_trader`,
    );
    expect(withPersonalityIcon("Spain", "aggressive")).toBe(
      `${AI_CHOICE_ICON.aggressive} Spain`,
    );
    expect(withPersonalityIcon("Spain", null)).toBe("Spain");
    // Every icon is different, and none is the tribe chip's swords
    const icons = Object.values(AI_CHOICE_ICON);
    expect(new Set(icons).size).toBe(icons.length);
    expect(icons).not.toContain("⚔️");
  });

  it("the info panel shows a badge with its name, and a line on what it does", () => {
    const panel = PlayerPanel.prototype as unknown as {
      renderPersonalityBadge(p: PlayerView): ReturnType<typeof html>;
      renderPersonalityHint(p: PlayerView): ReturnType<typeof html>;
    };
    const host = document.createElement("div");
    render(
      html`${panel.renderPersonalityBadge(fakeView("Spain", "mad_scientist"))}
      ${panel.renderPersonalityHint(fakeView("Spain", "mad_scientist"))}`,
      host,
    );
    const badge = host.querySelector("[data-ai-personality]")!;
    expect(badge.getAttribute("data-ai-personality")).toBe("mad_scientist");
    expect(badge.textContent).toContain(AI_CHOICE_ICON.mad_scientist);
    expect(badge.textContent).toContain("ai_personalities.type_mad_scientist");
    expect(host.textContent).toContain("ai_personalities.hint_mad_scientist");
    const plain = document.createElement("div");
    render(
      html`${panel.renderPersonalityBadge(fakeView("Peru", null))}`,
      plain,
    );
    expect(plain.querySelector("[data-ai-personality]")).toBeNull();
  });
});

describe("the in-game menu's list of AI personalities", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  async function openMenu(players: PlayerView[]) {
    vi.spyOn(crazyGamesSDK, "gameplayStop").mockImplementation(async () => {});
    vi.spyOn(crazyGamesSDK, "gameplayStart").mockImplementation(async () => {});
    const menu = document.createElement("settings-modal") as SettingsModal & {
      updateComplete: Promise<unknown>;
    };
    document.body.appendChild(menu);
    menu.eventBus = new EventBus();
    menu.game = {
      playerViews: () => players,
    } as unknown as SettingsModal["game"];
    menu.init();
    menu.eventBus.emit(new ShowSettingsModalEvent(true, false, false));
    await menu.updateComplete;
    return menu;
  }

  it("lists every AI nation dealt a personality, by personality", async () => {
    const menu = await openMenu([
      fakeView("Spain", "protector"),
      fakeView("Chile", "protector", false),
      fakeView("Japan", "trader"),
      fakeView("Peru", null),
      fakeView("Tribe", "tribe"),
    ]);
    const list = menu.querySelector("[data-ai-personalities-list]")!;
    expect(list).not.toBeNull();
    const groups = [...list.querySelectorAll("[data-ai-personality]")];
    expect(groups.map((g) => g.getAttribute("data-ai-personality"))).toEqual([
      "trader",
      "protector",
    ]);
    expect(groups[1].textContent).toContain("Chile");
    expect(groups[1].textContent).toContain("Spain");
    expect(list.textContent).not.toContain("Peru");
    // A nation that's out is struck through
    const chile = [...groups[1].querySelectorAll("span")].find(
      (s) => s.textContent === "Chile",
    )!;
    expect(chile.className).toContain("line-through");
  });

  it("shows nothing in a game without personalities", async () => {
    const menu = await openMenu([fakeView("Peru", null)]);
    expect(menu.querySelector("[data-ai-personalities-list]")).toBeNull();
  });
});
