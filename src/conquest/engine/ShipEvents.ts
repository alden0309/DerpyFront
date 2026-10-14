// SHIPS (r21): the scenes of ships and parties, all between players and all
// raised by what a player really did (none is drawn, so nobody is put into
// a scene they didn't make): a place offered aboard a player's ship, and
// asking to travel together (either way round). Left unanswered, each is
// declined. They rest together as the "ships" family.

import { BOATS } from "./Boats";
import { registerFamily } from "./EventPacing";
import type { ConquestGame } from "./Game";
import { answerOffer, offerById, roleOf, takeGate } from "./Hiring";
import { journal } from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import { lifeOfChar, meOf } from "./LifeQueries";
import { JOBS } from "./LifeRules";
import { joinParty, partyCheck } from "./Parties";
import { charName } from "./Queries";
import { boatOf, shipProv } from "./Ships";

const nameOf = (g: ConquestGame, ctx: LCtx) => charName(g.s.chars[ctx.c]);
const firstOf = (g: ConquestGame, ctx: LCtx) =>
  g.s.chars[ctx.c]?.first ?? "They";

/** The offer of a scene, if it still stands. */
function offerOf(g: ConquestGame, ctx: LCtx) {
  return offerById(g.s, ctx.o);
}

const SCENES = (): LifeEventDef[] => [
  {
    key: "p2p-berth",
    pool: "raised",
    cooldown: 0,
    scene: "docks",
    title: (g, life, ctx) => {
      const f = offerOf(g, ctx);
      const role = f ? roleOf(f.host.ladder, f.offer.role) : undefined;
      return f && role
        ? `A place as ${role.title.toLowerCase()} of ${f.host.name}`
        : "A place aboard";
    },
    body: (g, life, ctx) => {
      const f = offerOf(g, ctx);
      if (!f) return "The offer's been taken back.";
      const { host, offer } = f;
      const role = roleOf(host.ladder, offer.role)!;
      const owner = host.owner;
      const b = boatOf(owner, host.id);
      const where =
        g.map.provinces[b ? shipProv(b) : host.prov]?.name ?? "her port";
      const apart = life.prov !== (b ? shipProv(b) : host.prov);
      const docks = JOBS.sailor.ranks[0].wage;
      const now = life.job
        ? `You'd leave your work as ${JOBS[life.job.kind].ranks[life.job.rank]?.title.toLowerCase() ?? "you are"}.`
        : "";
      return `${nameOf(g, ctx)} ${apart ? "writes" : "says"}: will you sign on the ${b ? BOATS[b.kind].name.toLowerCase() : "ship"} ${b?.name ?? ""}, lying at ${where}, as her ${role.title.toLowerCase()}, at ${offer.pay} a month?\n${role.text}\nYour pay comes from her owner, by the days you're at your post: aboard her, or where she lies. (A deckhand on the docks gets ${docks} a month.) You can leave the place from your Work page whenever you like. ${now}`.trim();
    },
    choices: [
      {
        label: "Take the place",
        tip: "It's your work from now on: your Work page shows it. Go to where she lies to be at your post.",
        blocked: (g, life, ctx) => {
          const f = offerOf(g, ctx);
          const c = takeGate(g.s, life, f?.host, f?.offer);
          return c.ok ? null : c.why;
        },
        apply: (g, life, ctx) => {
          const err = answerOffer(g, life, ctx.o, true);
          if (err) journal(g, life, err, "bad");
        },
      },
      {
        label: "Decline",
        tip: "They'll hear you said no.",
        apply: (g, life, ctx) => {
          if (offerOf(g, ctx)) answerOffer(g, life, ctx.o, false);
        },
      },
    ],
  },
  {
    key: "p2p-party-ask",
    pool: "raised",
    cooldown: 0,
    scene: "road",
    title: (g, life, ctx) => `${firstOf(g, ctx)} asks to travel with you`,
    body: (g, life, ctx) =>
      `${nameOf(g, ctx)} asks whether they may travel with you: wherever you set out for from where you both are, they'd come too. In your own boat they take one of her berths, for nothing; on a passage or the road they pay their own way. Either of you can part company whenever you like, and they can get off at any stop on the way.`,
    choices: [
      {
        label: "Take them along",
        tip: "You lead; they come where you go.",
        blocked: (g, life, ctx) => {
          const them = lifeOfChar(g.s, ctx.c);
          if (!them) return "They're gone";
          if (them.prov !== life.prov) return "They're not here any more";
          return null;
        },
        apply: (g, life, ctx) => {
          const them = lifeOfChar(g.s, ctx.c);
          const err = them ? joinParty(g, them, life) : "They're gone.";
          if (err) journal(g, life, err, "bad");
        },
      },
      {
        label: "Decline",
        tip: "They'll hear you said no.",
        apply: (g, life, ctx) => {
          const them = lifeOfChar(g.s, ctx.c);
          if (them)
            journal(
              g,
              them,
              `${charName(meOf(g.s, life))} would rather travel alone.`,
            );
        },
      },
    ],
  },
  {
    key: "p2p-party-invite",
    pool: "raised",
    cooldown: 0,
    scene: "road",
    title: (g, life, ctx) => `${firstOf(g, ctx)} asks you to travel with them`,
    body: (g, life, ctx) =>
      `${nameOf(g, ctx)} asks you to travel with them: wherever they set out for from where you both are, you'd go too. In their own boat you'd take one of her berths, for nothing; on a passage or the road you pay your own way. You can go your own way whenever you like, and get off at any stop on the way.`,
    choices: [
      {
        label: "Go with them",
        tip: "They lead; you go where they go.",
        blocked: (g, life, ctx) => {
          const them = lifeOfChar(g.s, ctx.c);
          if (!them) return "They're gone";
          const c = partyCheck(g.s, life, them, false);
          return c.ok || /asking already/.test(c.why)
            ? null
            : c.why.replace(/\.$/, "");
        },
        apply: (g, life, ctx) => {
          const them = lifeOfChar(g.s, ctx.c);
          const err = them ? joinParty(g, life, them) : "They're gone.";
          if (err) journal(g, life, err, "bad");
        },
      },
      {
        label: "Decline",
        tip: "They'll hear you said no.",
        apply: (g, life, ctx) => {
          const them = lifeOfChar(g.s, ctx.c);
          if (them)
            journal(
              g,
              them,
              `${charName(meOf(g.s, life))} would rather go their own way.`,
            );
        },
      },
    ],
  },
];

let built: LifeEventDef[] | null = null;

/** The scenes of ships and parties (LifeEvents adds them the first time it looks one up). */
export function shipEvents(): LifeEventDef[] {
  if (built) return built;
  built = SCENES();
  registerFamily(
    "ships",
    built.map((d) => d.key),
    30,
  );
  return built;
}

/** Left unanswered, each is declined (its last choice). */
export function shipQuiet(): Record<string, number> {
  return { "p2p-berth": 1, "p2p-party-ask": 1, "p2p-party-invite": 1 };
}
