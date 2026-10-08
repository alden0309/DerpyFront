vi.mock("lit", () => ({
  html: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  }),
  LitElement: class extends EventTarget {
    requestUpdate() {}
  },
}));

vi.mock("lit/decorators.js", () => ({
  customElement: () => (clazz: unknown) => clazz,
  state: () => () => {},
  property: () => () => {},
  query: () => () => {},
}));

vi.mock("../../../../src/client/Utils", () => ({
  translateText: vi.fn((key: string) => key),
  renderDuration: vi.fn((s: number) => `${s}s`),
  showToast: vi.fn(),
}));

vi.mock("../../../../src/client/components/ui/ActionButton", () => ({
  actionButton: vi.fn((props: unknown) => props),
}));

vi.mock("../../../../src/client/InGameModal", () => ({
  showInGameConfirm: vi.fn(),
  showInGameAlert: vi.fn(),
}));

vi.mock("../../../../src/client/hud/layers/OpinionSection", () => ({
  renderOpinionSection: vi.fn((view: unknown) => ({ opinionSection: view })),
}));

import {
  Difficulty,
  PlayerProfile,
  PlayerType,
  Relation,
} from "@openfront/engine-api/game/GameTypes";
import type { Opinion } from "@openfront/engine-api/game/Opinion";
import { renderOpinionSection } from "../../../../src/client/hud/layers/OpinionSection";
import { PlayerPanel } from "../../../../src/client/hud/layers/PlayerPanel";
import { PlayerView } from "../../../../src/client/view";

const OPINION: Opinion = {
  value: -40,
  relation: Relation.Distrustful,
  reasons: [{ reason: "attacked", amount: -40 }],
  attackPenalty: -70,
  goldPerStep: 5_000,
  troopsForBonus: 90_000,
  alliance: {
    situation: "request",
    chance: 0,
    outcomes: [{ gate: "relation_low", accept: false, chance: 1 }],
  },
};

const me = {
  smallID: () => 1,
  isAlive: () => true,
  isAlliedWith: () => false,
  hasEmbargoAgainst: () => false,
  isTraitor: () => false,
  getTraitorRemainingTicks: () => 0,
  alliances: () => [],
  actions: () => Promise.resolve({ interaction: {} }),
} as unknown as PlayerView;

function aiPlayer(type: PlayerType) {
  const profile = vi.fn(
    (): Promise<PlayerProfile> =>
      Promise.resolve({
        relations: { 1: Relation.Distrustful },
        alliances: [],
        opinionOfViewer: type === PlayerType.Human ? undefined : OPINION,
      }),
  );
  const view = {
    smallID: () => 7,
    type: () => type,
    isPlayer: () => true,
    profile,
  } as unknown as PlayerView;
  return { view, profile };
}

describe("PlayerPanel: their opinion of you", () => {
  let panel: PlayerPanel;
  let ticks: number;

  function open(owner: PlayerView) {
    panel = new PlayerPanel();
    (panel as any).requestUpdate = vi.fn();
    (panel as any).g = {
      owner: () => owner,
      myPlayer: () => me,
      ticks: () => ticks,
      config: () => ({
        gameConfig: () => ({ difficulty: Difficulty.Hard }),
      }),
    };
    (panel as any).isVisible = true;
    (panel as any).tile = 1;
  }

  beforeEach(() => {
    ticks = 1000;
    vi.clearAllMocks();
  });

  test("asks for the profile as you, so it carries their opinion of you", async () => {
    const nation = aiPlayer(PlayerType.Nation);
    open(nation.view);
    await (panel as any).tick();
    expect(nation.profile).toHaveBeenCalledWith(me);
    expect((panel as any).otherProfile.opinionOfViewer).toEqual(OPINION);
  });

  test("keeps it fresh while open, without asking every tick", async () => {
    const nation = aiPlayer(PlayerType.Nation);
    open(nation.view);
    await (panel as any).tick();
    ticks += 2;
    await (panel as any).tick();
    expect(nation.profile).toHaveBeenCalledTimes(1);
    ticks += 3;
    await (panel as any).tick();
    expect(nation.profile).toHaveBeenCalledTimes(2);
  });

  test("shows the section for nations and tribes, not humans", async () => {
    for (const type of [PlayerType.Nation, PlayerType.Bot]) {
      const ai = aiPlayer(type);
      open(ai.view);
      await (panel as any).tick();
      const out = (panel as any).renderOpinion(ai.view, me);
      expect(out).not.toBe("");
      const view = vi.mocked(renderOpinionSection).mock.lastCall![0];
      expect(view.value).toBe("−40");
      expect(view.tribeNote === null).toBe(type === PlayerType.Nation);
    }
    const human = aiPlayer(PlayerType.Human);
    open(human.view);
    await (panel as any).tick();
    expect((panel as any).renderOpinion(human.view, me)).toBe("");
  });

  test("never shows a profile fetched for someone else", async () => {
    const nation = aiPlayer(PlayerType.Nation);
    open(nation.view);
    await (panel as any).tick();
    const other = {
      ...nation.view,
      smallID: () => 8,
      type: () => PlayerType.Nation,
    } as unknown as PlayerView;
    expect((panel as any).renderOpinion(other, me)).toBe("");
  });
});
