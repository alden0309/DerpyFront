import {
  Difficulty,
  PlayerType,
  Relation,
} from "@openfront/engine-api/game/GameTypes";
import type {
  AllianceOutlook,
  Opinion,
} from "@openfront/engine-api/game/Opinion";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { opinionOfViewer } from "@openfront/engine/execution/nation/NationOpinion";
import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { playerInfo, setup } from "../util/Setup";
import { executeTicks } from "../util/utils";

// The panel's real English text, with {params} filled in.
vi.mock("../../src/client/Utils", async () => {
  const en = (await import("../../resources/lang/en.json")).default;
  const lookup = (key: string): unknown =>
    key
      .split(".")
      .reduce<unknown>(
        (o, k) => (o as Record<string, unknown> | undefined)?.[k],
        en,
      );
  return {
    translateText: (key: string, params: Record<string, unknown> = {}) => {
      const msg = lookup(key);
      if (typeof msg !== "string") return key;
      return msg.replace(/\{(\w+)\}/g, (_, k: string) =>
        k in params ? String(params[k]) : `{${k}}`,
      );
    },
    renderDuration: (s: number) => `${s}s`,
  };
});

import { renderOpinionSection } from "../../src/client/hud/layers/OpinionSection";
import {
  allianceView,
  chanceText,
  OpinionContext,
  opinionTips,
  opinionView,
} from "../../src/client/hud/layers/OpinionView";

const MINUS = "−";

function ctx(o: Partial<OpinionContext> = {}): OpinionContext {
  return {
    difficulty: Difficulty.Medium,
    tribe: false,
    allied: false,
    embargoing: false,
    traitorSeconds: null,
    yourAlliances: 0,
    ...o,
  };
}

const REQUEST: AllianceOutlook = {
  situation: "request",
  chance: 0,
  outcomes: [{ gate: "relation_low", accept: false, chance: 1 }],
};

function opinion(o: Partial<Opinion> = {}): Opinion {
  return {
    value: -32,
    relation: Relation.Distrustful,
    reasons: [
      { reason: "attacked", amount: -52 },
      { reason: "gift_gold", amount: 20 },
    ],
    attackPenalty: -70,
    goldPerStep: 5_500,
    troopsForBonus: 91_000,
    alliance: REQUEST,
    ...o,
  };
}

describe("the opinion breakdown", () => {
  it("reads as the label and value with signed reasons, largest first", () => {
    const view = opinionView(opinion(), ctx());
    expect(view.relationLabel).toBe("Distrustful");
    expect(view.value).toBe(`${MINUS}32`);
    expect(view.reasons.map((r) => [r.label, r.amount, r.tone])).toEqual([
      ["You attacked them", `${MINUS}52`, "bad"],
      ["You sent them gold", "+20", "good"],
    ]);
    expect(view.fading).toBe("Fading toward neutral by 30 a minute");
    expect(view.meter).toBe(34);
  });

  it("says when there's nothing to fade", () => {
    const view = opinionView(
      opinion({ value: 0, relation: Relation.Neutral, reasons: [] }),
      ctx(),
    );
    expect(view.reasons).toEqual([]);
    expect(view.fading).toBeNull();
  });
});

describe("how to improve it", () => {
  it("stops what hurts first, then waiting, gifts and the alliance", () => {
    expect(opinionTips(opinion(), ctx())).toEqual([
      "Stop attacking them: every attack costs 70.",
      "Wait: it fades back to neutral in about 64s.",
      "Get their opinion up to Neutral (0) and they'll consider an alliance.",
    ]);
    // Once an alliance is on the table, gifts are the way up.
    expect(
      opinionTips(
        opinion({
          value: 10,
          relation: Relation.Neutral,
          reasons: [],
          alliance: {
            situation: "request",
            chance: 1,
            outcomes: [{ gate: "early_game", accept: true, chance: 1 }],
          },
        }),
        ctx(),
      ),
    ).toEqual(["Once you're allies, gifts of gold or troops raise it."]);
  });

  it("quotes the gift rules when you're allies", () => {
    const tips = opinionTips(
      opinion({ value: 20, relation: Relation.Neutral, reasons: [] }),
      ctx({ allied: true }),
    );
    expect(tips).toContain(
      "Send gold (+5 for every 5.50K, up to +100) or 9.10K+ troops at once (+50).",
    );
  });

  it("asks you to trade again while you embargo them", () => {
    const tips = opinionTips(
      opinion({
        reasons: [
          { reason: "embargo", amount: -12 },
          { reason: "targeted", amount: -20 },
        ],
      }),
      ctx({ embargoing: true }),
    );
    expect(tips.slice(0, 2)).toEqual([
      "Don't mark them as a target: it costs 40 each time.",
      "Trade with them again: that gives back 20.",
    ]);
  });

  it("names the betrayal, the nukes and the rude emojis", () => {
    const tips = opinionTips(
      opinion({
        value: -100,
        relation: Relation.Hostile,
        reasons: [
          { reason: "broke_alliance", amount: -60 },
          { reason: "nuked", amount: -30 },
          { reason: "rude_emoji", amount: -10 },
        ],
      }),
      ctx(),
    );
    expect(tips.slice(0, 2)).toEqual([
      "Keep your alliances: a betrayal costs 100 with your ally and 40 with everyone next to you.",
      "Don't nuke them: a hit that hurts costs 100.",
    ]);
  });

  it("offers the kind emoji on Easy only", () => {
    const kind = "Send a kind emoji (🕊️ 🏳️ ❤️ 🥰 👏): +15 on Easy.";
    expect(
      opinionTips(opinion(), ctx({ difficulty: Difficulty.Easy })),
    ).toContain(kind);
    expect(opinionTips(opinion(), ctx())).not.toContain(kind);
  });

  it("has nothing to say about tribes but that they don't care", () => {
    const view = opinionView(
      opinion({
        alliance: {
          situation: "request",
          tribe: true,
          chance: 1,
          outcomes: [],
        },
      }),
      ctx({ tribe: true }),
    );
    expect(view.tips).toEqual([]);
    expect(view.tribeNote).toBe(
      "Tribes act the same whatever they think of you.",
    );
    expect(view.alliance.verdict).toBe("They'd accept");
    expect(view.alliance.note).toBe("Tribes accept every alliance request.");
  });
});

describe("would they accept an alliance?", () => {
  it("says chances plainly", () => {
    expect(chanceText(1 / 3)).toBe("about 1 in 3");
    expect(chanceText(0.12)).toBe("about 1 in 8");
    expect(chanceText(0.5)).toBe("about 1 in 2");
    expect(chanceText(0.67)).toBe("about 67%");
    expect(chanceText(0.0125)).toBe("about 1%");
    expect(chanceText(0.999)).toBe("about 99%");
  });

  it("explains a refusal from the engine's own odds", async () => {
    // A Hard nation you just attacked.
    const game = await setup("plains", { difficulty: Difficulty.Hard }, [
      playerInfo("me", PlayerType.Human),
      playerInfo("nation", PlayerType.Nation),
    ]);
    const me = game.player("me");
    const nation = game.player("nation");
    me.conquer(game.ref(0, 0));
    nation.conquer(game.ref(1, 0));
    executeTicks(game, game.config().numSpawnPhaseTurns() + 1);
    game.addExecution(new AttackExecution(10, me, nation.id()));
    game.executeNextTick();

    const o = opinionOfViewer(game, nation, me)!;
    const view = opinionView(o, ctx({ difficulty: Difficulty.Hard }));
    expect(view.relationLabel).toBe("Hostile");
    expect(view.value).toBe(`${MINUS}80`);
    expect(view.reasons[0].label).toBe("You attacked them");
    // Refused, bar Hard's 1-in-40 coin flip coming up heads.
    expect(view.alliance.verdict).toBe("Chance they'd accept: about 1%");
    expect(view.alliance.tone).toBe("bad");
    expect(view.alliance.rows.map((r) => [r.label, r.share])).toEqual([
      ["Their opinion of you is below Neutral", "98%"],
      ["Hard nations sometimes decide by coin flip (1 in 40)", "3%"],
    ]);
    expect(view.tips).toContain(
      "Get their opinion up to Neutral (0) and they'll consider an alliance.",
    );
  });

  it("is honest about luck", () => {
    const view = allianceView(
      opinion({
        value: 60,
        relation: Relation.Friendly,
        alliance: {
          situation: "request",
          chance: 0.67,
          outcomes: [
            { gate: "friendly", accept: true, chance: 0.67 },
            { gate: "similar_strength", accept: false, chance: 0.33 },
          ],
        },
      }),
      ctx({ difficulty: Difficulty.Impossible }),
    );
    expect(view.verdict).toBe("Chance they'd accept: about 67%");
    expect(view.tone).toBe("neutral");
    expect(view.rows.map((r) => [r.label, r.share, r.tone])).toEqual([
      ["They're Friendly toward you", "67%", "good"],
      ["They think you're too weak to be worth it", "33%", "bad"],
    ]);
  });

  it("explains traitors, caps and team games with the real numbers", () => {
    const view = allianceView(
      opinion({
        alliance: {
          situation: "request",
          chance: 0.1,
          allianceCap: 3,
          outcomes: [
            { gate: "traitor", accept: false, chance: 0.6 },
            { gate: "too_many_alliances", accept: false, chance: 0.2 },
            { gate: "team_game", accept: false, chance: 0.1 },
            { gate: "early_game", accept: true, chance: 0.1 },
          ],
        },
      }),
      ctx({
        difficulty: Difficulty.Hard,
        traitorSeconds: 24,
        yourAlliances: 4,
      }),
    );
    expect(view.rows.map((r) => r.label)).toEqual([
      "You're a traitor for 24s more: they refuse traitors 90% of the time",
      "You have 4 alliances; they refuse anyone with 3 or more (50% of the players)",
      "Team game: they turn down 75% of requests",
      "It's early in the game: they're open to allies",
    ]);
    expect(view.verdict).toBe("Chance they'd accept: about 1 in 10");
  });

  it("covers requests in flight, cooldowns, renewals and their requests", () => {
    const at = (alliance: AllianceOutlook) =>
      allianceView(opinion({ alliance }), ctx());
    expect(at({ ...REQUEST, situation: "pending" }).note).toBe(
      "You've asked. They'll answer on their next turn.",
    );
    expect(
      at({ ...REQUEST, situation: "cooldown", cooldownTicks: 115 }).note,
    ).toBe("You can ask again in 12s.");
    const renewal = at({ ...REQUEST, situation: "renewal" });
    expect(renewal.title).toBe("Renewing your alliance");
    const asked = at({ situation: "they_asked", chance: 1, outcomes: [] });
    expect(asked.verdict).toBe("They've asked you for an alliance!");
    expect(asked.note).toBe(
      "Accept and you're allies, and their opinion of you jumps by 100.",
    );
    expect(
      at({
        situation: "blocked",
        blocker: "alliances_disabled",
        chance: 0,
        outcomes: [],
      }).verdict,
    ).toBe("Alliances are off in this game");
  });
});

describe("<the opinion section>", () => {
  it("renders the value, reasons, tips and alliance verdict", () => {
    const host = document.createElement("div");
    render(renderOpinionSection(opinionView(opinion(), ctx())), host);
    const text = (sel: string) =>
      host.querySelector(sel)?.textContent?.replace(/\s+/g, " ").trim();
    expect(text("#opinion-title")).toBe("Their opinion of you");
    expect(text("[data-testid=opinion-value]")).toBe(
      `Distrustful (${MINUS}32)`,
    );
    const rows = [...host.querySelectorAll("[data-reason]")].map((li) =>
      li.textContent?.replace(/\s+/g, " ").trim(),
    );
    expect(rows).toEqual([
      `You attacked them ${MINUS}52`,
      "You sent them gold +20",
    ]);
    expect(host.querySelectorAll("[data-testid=opinion-tips] li").length).toBe(
      3,
    );
    expect(text("[data-testid=opinion-verdict]")).toBe(
      "They'd refuse right now",
    );
    expect(text("[data-gate=relation_low]")).toBe(
      "✕ Their opinion of you is below Neutral",
    );
    const meter = host.querySelector("[role=meter]")!;
    expect(meter.getAttribute("aria-valuenow")).toBe("-32");
  });
});
