import { Difficulty, Relation } from "@openfront/engine-api/game/GameTypes";
import type {
  AllianceGate,
  AllianceOutlook,
  Opinion,
  RelationReason,
} from "@openfront/engine-api/game/Opinion";
import {
  allianceCapShare,
  confusedOdds,
  teamRejectPercent,
  TRAITOR_PASS_PERCENT,
} from "@openfront/engine-lib/execution/AllianceRules";
import {
  ALLIANCE_RELATION,
  BROKE_ALLIANCE_RELATION,
  CLOWN_EMOJI_RELATION,
  EMBARGO_RELATION,
  GOLD_RELATION_STEP,
  INSULT_EMOJI_RELATION,
  KIND_EMOJI_RELATION,
  KIND_EMOJIS,
  MAX_GOLD_GIFT_RELATION,
  NUKED_RELATION,
  RELATION_DECAY_PER_TICK,
  SAW_BETRAYAL_RELATION,
  TARGETED_RELATION,
  TROOP_GIFT_RELATION,
} from "@openfront/engine-lib/execution/RelationRules";
import { renderNumber, renderTroops } from "@openfront/engine-lib/Format";
import { renderDuration, translateText } from "../../Utils";

/**
 * Turns the engine's Opinion (a nation's or tribe's opinion of you, see
 * NationOpinion) into what the player panel shows: the reasons in plain
 * words, tips that follow from the game's real rules, and whether they'd
 * ally with you. Kept free of rendering so it can be tested on its own.
 */

const TICKS_PER_SECOND = 10;
/** How fast every opinion drifts back toward 0. */
export const FADE_PER_MINUTE = Math.round(
  RELATION_DECAY_PER_TICK * TICKS_PER_SECOND * 60,
);

export type Tone = "good" | "bad" | "neutral";

/** What the panel knows about you and them that the engine didn't send. */
export interface OpinionContext {
  difficulty: Difficulty;
  /** They're a tribe (PlayerType.Bot). */
  tribe: boolean;
  /** You're allies, so you can send them gifts. */
  allied: boolean;
  /** You've stopped trading with them. */
  embargoing: boolean;
  /** Seconds left on your traitor mark, or null. */
  traitorSeconds: number | null;
  /** How many alliances you have. */
  yourAlliances: number;
}

export interface ReasonRow {
  reason: RelationReason;
  label: string;
  /** Signed, with a real minus sign: "+12", "−40". */
  amount: string;
  tone: Tone;
}

export interface OddsRow {
  gate: AllianceGate;
  label: string;
  /** "83%", or null when it's the only way it can go. */
  share: string | null;
  tone: Tone;
}

export interface AllianceView {
  title: string;
  verdict: string;
  tone: Tone;
  note: string | null;
  rows: OddsRow[];
}

export interface OpinionViewModel {
  relation: Relation;
  relationLabel: string;
  /** "−32" */
  value: string;
  /** Where the value sits on a -100..100 meter, 0..100. */
  meter: number;
  reasons: ReasonRow[];
  /** "Fading toward neutral: …", or null at 0. */
  fading: string | null;
  tips: string[];
  /** Tribes act the same whatever they think. */
  tribeNote: string | null;
  alliance: AllianceView;
}

/** "+12", "−40", "0" (with U+2212, which lines up with "+"). */
export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${-n}`;
  return "0";
}

export function relationName(relation: Relation): string {
  switch (relation) {
    case Relation.Hostile:
      return translateText("relation.hostile");
    case Relation.Distrustful:
      return translateText("relation.distrustful");
    case Relation.Friendly:
      return translateText("relation.friendly");
    case Relation.Neutral:
    default:
      return translateText("relation.neutral");
  }
}

function difficultyName(d: Difficulty): string {
  return translateText(`difficulty.${d.toLowerCase()}`);
}

/** Seconds until an opinion of `value` fades back to 0. */
export function secondsToNeutral(value: number): number {
  return Math.ceil(
    Math.abs(value) / (RELATION_DECAY_PER_TICK * TICKS_PER_SECOND),
  );
}

/**
 * How likely, said plainly: "about 1 in 3" when it's close to that,
 * otherwise "about 83%". Never "0%" or "100%" for something uncertain.
 */
export function chanceText(p: number): string {
  if (p > 0 && p <= 0.5) {
    const n = Math.round(1 / p);
    if (n >= 2 && n <= 20 && Math.abs(1 / p - n) / n < 0.08) {
      return translateText("opinion.chance_one_in", { n });
    }
  }
  const percent = Math.min(99, Math.max(1, Math.round(p * 100)));
  return translateText("opinion.chance_percent", { percent });
}

function shareText(p: number): string {
  if (p < 0.01) return "<1%";
  return `${Math.round(p * 100)}%`;
}

function reasonRows(opinion: Opinion): ReasonRow[] {
  return opinion.reasons.map((r) => ({
    reason: r.reason,
    label: translateText(`opinion.reason.${r.reason}`),
    amount: signed(r.amount),
    tone: r.amount > 0 ? "good" : "bad",
  }));
}

/** The tip for something you did that still weighs on them. */
function stopTip(
  reason: RelationReason,
  opinion: Opinion,
  ctx: OpinionContext,
): string | null {
  switch (reason) {
    case "attacked":
      return translateText("opinion.tip.stop_attacking", {
        points: -opinion.attackPenalty,
      });
    case "nuked":
      return translateText("opinion.tip.stop_nuking", {
        points: -NUKED_RELATION,
      });
    case "targeted":
      return translateText("opinion.tip.stop_targeting", {
        points: -TARGETED_RELATION,
      });
    case "embargo":
      return ctx.embargoing
        ? translateText("opinion.tip.trade_again", {
            points: -EMBARGO_RELATION,
          })
        : null;
    case "rude_emoji":
      return translateText("opinion.tip.no_rude_emoji", {
        insult: -INSULT_EMOJI_RELATION,
        clown: -CLOWN_EMOJI_RELATION,
      });
    case "boats":
      return translateText("opinion.tip.boats");
    case "captured_trade":
      return translateText("opinion.tip.trade_ships");
    case "broke_alliance":
    case "saw_betrayal":
      return translateText("opinion.tip.keep_alliances", {
        ally: -BROKE_ALLIANCE_RELATION,
        neighbours: -SAW_BETRAYAL_RELATION,
      });
    default:
      return null;
  }
}

/** A tip for what stands between you and an alliance, if you can fix it. */
function allianceTip(opinion: Opinion, ctx: OpinionContext): string | null {
  const outlook = opinion.alliance;
  if (outlook.situation === "blocked" || outlook.situation === "they_asked") {
    return null;
  }
  // The refusal that weighs most, if it's one you can do something about.
  for (const o of outlook.outcomes) {
    if (o.accept || o.chance < 0.15) continue;
    switch (o.gate) {
      case "relation_low":
        return translateText("opinion.tip.reach_neutral");
      case "traitor":
        return ctx.traitorSeconds !== null
          ? translateText("opinion.tip.traitor_wait", {
              time: renderDuration(ctx.traitorSeconds),
            })
          : null;
      case "similar_strength":
        return translateText("opinion.tip.grow");
      case "too_many_alliances":
        return translateText("opinion.tip.fewer_alliances");
      default:
        continue;
    }
  }
  return null;
}

/**
 * "How to improve it": short and concrete, from what's weighing on them and
 * the rules that move it. Worst grievance first; at most five.
 */
export function opinionTips(opinion: Opinion, ctx: OpinionContext): string[] {
  if (ctx.tribe) return [];
  const tips: string[] = [];
  const seen = new Set<string>();
  const add = (tip: string | null) => {
    if (tip !== null && !seen.has(tip)) {
      seen.add(tip);
      tips.push(tip);
    }
  };

  // Stop what they hold against you (largest first).
  const grievances = opinion.reasons
    .filter((r) => r.amount < 0)
    .sort((a, b) => a.amount - b.amount);
  let stops = 0;
  for (const g of grievances) {
    if (stops >= 2) break;
    const tip = stopTip(g.reason, opinion, ctx);
    if (tip !== null && !seen.has(tip)) {
      add(tip);
      stops++;
    }
  }
  // Trading with them again gives the embargo's points back, even before
  // they've reacted to it.
  if (ctx.embargoing) {
    add(
      translateText("opinion.tip.trade_again", { points: -EMBARGO_RELATION }),
    );
  }

  if (opinion.value < 0) {
    add(
      translateText("opinion.tip.wait", {
        time: renderDuration(secondsToNeutral(opinion.value)),
      }),
    );
  }

  if (opinion.value < 100) {
    if (ctx.allied) {
      add(
        translateText("opinion.tip.gifts", {
          gold: renderNumber(opinion.goldPerStep),
          step: GOLD_RELATION_STEP,
          max: MAX_GOLD_GIFT_RELATION,
          troops: renderTroops(opinion.troopsForBonus),
          bonus: TROOP_GIFT_RELATION,
        }),
      );
    } else if (opinion.value >= 0) {
      // Below Neutral no alliance is on the table yet; reaching Neutral is
      // the tip that matters (allianceTip).
      add(translateText("opinion.tip.gifts_need_alliance"));
    }
  }

  add(allianceTip(opinion, ctx));

  if (ctx.difficulty === Difficulty.Easy && opinion.value < 50) {
    add(
      translateText("opinion.tip.kind_emoji", {
        emojis: KIND_EMOJIS.join(" "),
        points: KIND_EMOJI_RELATION,
      }),
    );
  }
  return tips.slice(0, 5);
}

function gateLabel(
  gate: AllianceGate,
  accept: boolean,
  outlook: AllianceOutlook,
  ctx: OpinionContext,
): string {
  switch (gate) {
    case "confused":
      return translateText("opinion.gate.confused", {
        difficulty: difficultyName(ctx.difficulty),
        n: confusedOdds(ctx.difficulty) ?? 0,
      });
    case "traitor":
      return ctx.traitorSeconds !== null
        ? translateText("opinion.gate.traitor_time", {
            time: renderDuration(ctx.traitorSeconds),
            n: 100 - TRAITOR_PASS_PERCENT,
          })
        : translateText("opinion.gate.traitor", {
            n: 100 - TRAITOR_PASS_PERCENT,
          });
    case "too_many_alliances":
      return translateText("opinion.gate.too_many_alliances", {
        count: ctx.yourAlliances,
        cap: outlook.allianceCap ?? ctx.yourAlliances,
        share: Math.round((allianceCapShare(ctx.difficulty) ?? 0) * 100),
      });
    case "team_game":
      return translateText("opinion.gate.team_game", {
        percent: teamRejectPercent(ctx.difficulty),
      });
    case "similar_strength":
      return translateText(
        accept
          ? "opinion.gate.similar_strength_yes"
          : "opinion.gate.similar_strength_no",
      );
    default:
      return translateText(`opinion.gate.${gate}`);
  }
}

/** Whether they'd ally with you now, and what decides it. */
export function allianceView(
  opinion: Opinion,
  ctx: OpinionContext,
): AllianceView {
  const outlook = opinion.alliance;
  const title = translateText(
    outlook.situation === "renewal"
      ? "opinion.renewal_title"
      : "opinion.alliance_title",
  );

  if (outlook.situation === "blocked") {
    return {
      title,
      verdict: translateText(
        `opinion.blocked.${outlook.blocker ?? "alliances_disabled"}`,
      ),
      tone: outlook.blocker === "same_team" ? "neutral" : "bad",
      note: null,
      rows: [],
    };
  }
  if (outlook.situation === "they_asked") {
    return {
      title,
      verdict: translateText("opinion.verdict_they_asked"),
      tone: "good",
      note: translateText("opinion.note.they_asked", {
        points: ALLIANCE_RELATION,
      }),
      rows: [],
    };
  }

  const p = outlook.chance;
  const verdict =
    p >= 1
      ? translateText("opinion.verdict_yes")
      : p <= 0
        ? translateText("opinion.verdict_no")
        : translateText("opinion.verdict_chance", { chance: chanceText(p) });
  const tone: Tone = p >= 0.75 ? "good" : p <= 0.25 ? "bad" : "neutral";

  let note: string | null = null;
  if (outlook.tribe) note = translateText("opinion.note.tribe");
  else if (outlook.situation === "pending") {
    note = translateText("opinion.note.pending");
  } else if (outlook.situation === "cooldown") {
    note = translateText("opinion.note.cooldown", {
      time: renderDuration(
        Math.ceil((outlook.cooldownTicks ?? 0) / TICKS_PER_SECOND),
      ),
    });
  } else if (outlook.situation === "renewal") {
    note = translateText("opinion.note.renewal");
  }

  // One row per way it can go; the coin flip's two halves read as one.
  const merged = new Map<string, OddsRow & { chance: number }>();
  for (const o of outlook.outcomes) {
    const key = o.gate === "confused" ? "confused" : `${o.gate}:${o.accept}`;
    const row = merged.get(key);
    if (row !== undefined) {
      row.chance += o.chance;
      continue;
    }
    merged.set(key, {
      gate: o.gate,
      label: gateLabel(o.gate, o.accept, outlook, ctx),
      share: null,
      tone: o.gate === "confused" ? "neutral" : o.accept ? "good" : "bad",
      chance: o.chance,
    });
  }
  const all = [...merged.values()].sort((a, b) => b.chance - a.chance);
  const shown = all.filter((r) => r.chance >= 0.005);
  const rows = shown.map(({ chance, ...row }) => ({
    ...row,
    share: all.length > 1 ? shareText(chance) : null,
  }));
  return { title, verdict, tone, note, rows };
}

export function opinionView(
  opinion: Opinion,
  ctx: OpinionContext,
): OpinionViewModel {
  const value = opinion.value;
  return {
    relation: opinion.relation,
    relationLabel: relationName(opinion.relation),
    value: signed(value),
    meter: Math.max(0, Math.min(100, (value + 100) / 2)),
    reasons: reasonRows(opinion),
    fading:
      value === 0
        ? null
        : translateText("opinion.fading", { points: FADE_PER_MINUTE }),
    tips: opinionTips(opinion, ctx),
    tribeNote: ctx.tribe ? translateText("opinion.tribe_note") : null,
    alliance: allianceView(opinion, ctx),
  };
}
