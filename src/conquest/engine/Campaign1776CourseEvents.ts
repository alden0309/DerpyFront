// CQ24 (r24): a division in Congress, for a player who sits in it: the
// Declaration (1776), the Constitution (1788) and Jay's Treaty (1795). The
// computer's members divide as their counterparts did (Campaign1776Course
// steers them); players vote for themselves, and when enough of them vote
// the other way, history turns. The scene says how the house leans before
// you choose. Where it happens: Congress, wherever it sits (EVENTS r21's
// tags: anywhere, since a member may be away).

import { formatDate } from "./Calendar";
import {
  castVote,
  division,
  PLANS,
  voteKey,
  voteView,
} from "./Campaign1776Course";
import { tag } from "./EventPlaces";
import { journal } from "./LifeCore";
import type { LifeEventDef } from "./LifeEvents";

/** What each division is about, in the house's own words. */
const BODIES: Record<string, string> = {
  declaration:
    "Before Congress is the resolution Virginia's delegates moved: that these United Colonies are, and of right ought to be, free and independent states. Carried, there is no going back, and France may treat with a nation; lost, the war goes on as a quarrel with the King's ministers.",
  ratification:
    "Before the house is the Constitution signed at Philadelphia, as the states' conventions argue it out. Ratified, the union gets a government that can tax, a President and courts of its own; rejected, the Articles stand, and with them a Congress that can only ask.",
  "jay-ratified":
    "Before the house is the treaty Mr. Jay signed in London: the British leave their posts in the Northwest and open their islands' trade a little, but nothing is said of the sailors they take off American ships. Approved, there's peace with Britain; rejected, the posts stay British and war may come.",
};

const VOTE_EVENT: LifeEventDef = {
  key: "r76-vote",
  pool: "raised",
  cooldown: 0,
  scene: "governor",
  where: tag(""),
  title: (_g, _l, ctx) => {
    const key = voteKey(ctx.v) ?? "";
    return `Congress divides on ${PLANS[key]?.vote?.motion ?? "a question"}`;
  },
  body: (g, _l, ctx) => {
    const key = voteKey(ctx.v) ?? "";
    const v = voteView(g.s, key);
    if (!v) return "";
    const lean = division(g.s, key, v.spec);
    return `${BODIES[key] ?? ""}\n\nThe house divides about ${formatDate(ctx.due ?? v.due)}. As it leans now: ${lean.ayes} for and ${lean.noes} against${lean.abstain ? `, ${lean.abstain} not voting` : ""}. How will you vote?`;
  },
  choices: [
    {
      label: (_g, _l, ctx) =>
        `Aye: ${PLANS[voteKey(ctx.v) ?? ""]?.vote?.aye ?? "for"}`,
      tip: "Your vote is counted with the house's when it divides.",
      apply: (g, life, ctx) => {
        castVote(g, life.seat, voteKey(ctx.v) ?? "", 1);
        journal(g, life, "You'll vote aye when the house divides.");
      },
    },
    {
      label: (_g, _l, ctx) =>
        `No: ${PLANS[voteKey(ctx.v) ?? ""]?.vote?.no ?? "against"}`,
      tip: "Your vote is counted with the house's when it divides. Enough of you against it, and history turns.",
      apply: (g, life, ctx) => {
        castVote(g, life.seat, voteKey(ctx.v) ?? "", -1);
        journal(g, life, "You'll vote no when the house divides.");
      },
    },
    {
      label: "Keep my seat",
      tip: "You won't vote either way.",
      apply: (g, life, ctx) => castVote(g, life.seat, voteKey(ctx.v) ?? "", 0),
    },
  ],
};

/** The course's scenes, for the campaign's list (Campaign1776Events.ts). */
export function courseEvents(): LifeEventDef[] {
  return [VOTE_EVENT];
}

/** Left unanswered: you keep your seat. */
export function courseQuiet(): Record<string, number> {
  return { "r76-vote": 2 };
}
