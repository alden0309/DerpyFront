// PARTNERS (r13): the scenes of a partnership. Articles put to you by
// another player (sign or refuse here; send back your own terms from the
// scene's own staging), a matter put to the partners (aye or no), and the
// troubles of trade: books that don't add up, a partner who finds you out,
// the temptation of a second set of books, a quarrel over the accounts,
// creditors at the door, a cargo or a ship lost, the town in the enemy's
// hands, and a partner's death.

import {
  buyoutPrice,
  castVote,
  DECISIONS,
  decisionWords,
  endWithOne,
  openSuit,
  putDecision,
  sellSeized,
  tally,
  windUp,
} from "./Firms";
import type { ConquestGame } from "./Game";
import {
  addRenown,
  addStress,
  earn,
  journal,
  remembers,
  spend,
} from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import { charSkill, lifeOfChar, meOf } from "./LifeQueries";
import { articlesText, refuseArticles, signArticles } from "./Partners";
import {
  CARGOES,
  firmById,
  offerById,
  partnerIn,
  partnersChanged,
} from "./PartnersCore";
import { charName } from "./Queries";
import type { Firm, Life } from "./Types";

const firmOf = (g: ConquestGame, ctx: LCtx): Firm | undefined =>
  firmById(g.s, ctx.f);
const nameOf = (g: ConquestGame, ctx: LCtx) => charName(g.s.chars[ctx.c]);
const firstOf = (g: ConquestGame, ctx: LCtx) =>
  g.s.chars[ctx.c]?.first ?? "they";
const he = (g: ConquestGame, ctx: LCtx) =>
  g.s.chars[ctx.c]?.female ? "she" : "he";
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const trading = (f: Firm | undefined): f is Firm =>
  !!f && f.status === "trading";

/** Put something to the partners from a scene (and say if it couldn't be). */
function put(
  g: ConquestGame,
  life: Life,
  f: Firm | undefined,
  key: Parameters<typeof putDecision>[3],
  arg = 0,
): void {
  if (!trading(f)) return;
  const err = putDecision(g, life, f, key, arg);
  if (err) journal(g, life, `${f.name}: ${err}`, "bad");
}

/** Buy another partner's share at its fair price. */
function buyShare(g: ConquestGame, life: Life, f: Firm, c: number): void {
  const p = partnerIn(f, c);
  const me = partnerIn(f, life.c);
  if (!p || !me) return;
  const price = buyoutPrice(g.s, f, c);
  if (life.purse < price) {
    journal(g, life, `You haven't the ${price} coins.`, "bad");
    return;
  }
  spend(g, life, price);
  const other = lifeOfChar(g.s, c);
  if (other) {
    earn(g, other, price);
    journal(g, other, `You're bought out of ${f.name} for ${price} coins.`);
  }
  me.share = Math.round((me.share + p.share) * 10) / 10;
  me.capital = Math.round((me.capital + p.capital) * 100) / 100;
  if (p.role === "managing") me.role = "managing";
  f.partners = f.partners.filter((x) => x !== p);
  journal(
    g,
    life,
    `You buy ${charName(g.s.chars[c])}'s share in ${f.name} for ${price} coins.`,
  );
  partnersChanged(g, "f");
  // Only you left: the business is yours.
  if (f.partners.length <= 1) endWithOne(g, f);
}

export const PARTNER_EVENTS: LifeEventDef[] = [
  {
    key: "p2p-articles",
    pool: "raised",
    cooldown: 0,
    scene: "market",
    title: (g, life, ctx) => {
      const o = offerById(g.s, ctx.o);
      return o && o.round > 0
        ? `${cap(nameOf(g, ctx))}'s own terms`
        : o && o.firm >= 0
          ? `A share in ${o.terms.name}`
          : "Articles of copartnership";
    },
    body: (g, life, ctx) => {
      const o = offerById(g.s, ctx.o);
      if (!o) return "The articles are gone.";
      return `${articlesText(g.s, g.map, o.terms, o.day)}\n${cap(nameOf(g, ctx))} waits for your answer: sign them, send back terms of your own, or decline.`;
    },
    choices: [
      {
        label: "Sign the articles",
        tip: "The firm is made: your capital goes into it, and your share of the profit comes out every month.",
        blocked: (g, life, ctx) => {
          const o = offerById(g.s, ctx.o);
          const mine = o?.terms.sides.find((x) => x.c === life.c);
          return mine && life.purse < mine.cap
            ? `You need ${mine.cap} coins`
            : null;
        },
        apply: (g, life, ctx) => {
          const err = signArticles(g, life, ctx.o);
          if (err) journal(g, life, err, "bad");
        },
      },
      {
        label: "Decline",
        tip: "They'll hear you said no.",
        apply: (g, life, ctx) => {
          refuseArticles(g, life, ctx.o);
        },
      },
    ],
  },
  {
    key: "p2p-firmvote",
    pool: "raised",
    cooldown: 0,
    scene: "market",
    title: (g, life, ctx) =>
      `${firmOf(g, ctx)?.name ?? "The firm"}: put to the partners`,
    body: (g, life, ctx) => {
      const f = firmOf(g, ctx);
      const d = f?.decisions.find((x) => x.id === ctx.d);
      if (!f || !d) return "It's been decided.";
      const t = tally(f, d);
      return `${cap(nameOf(g, ctx))} puts it to the partners: ${decisionWords(g.s, f, d).toLowerCase()}. ${DECISIONS[d.key].text}\nSo far ${Math.round(t.aye)} in a hundred for it, ${Math.round(t.no)} against. It's decided by ${f.rule === "unanimous" ? "all the partners together" : "the greater part in interest"}.`;
    },
    choices: [
      {
        label: "Aye",
        tip: "Your share counts for it.",
        apply: (g, life, ctx) => {
          const f = firmOf(g, ctx);
          if (f) castVote(g, life, f, ctx.d, true);
        },
      },
      {
        label: "No",
        tip: "Your share counts against it.",
        apply: (g, life, ctx) => {
          const f = firmOf(g, ctx);
          if (f) castVote(g, life, f, ctx.d, false);
        },
      },
    ],
  },
  {
    key: "pa-embezzle",
    pool: "raised",
    cooldown: 0,
    scene: "market",
    title: "The books don't add up",
    body: (g, life, ctx) => {
      const f = firmOf(g, ctx);
      return `You've been through the books of ${f?.name ?? "the firm"} by candlelight, twice. The takings entered and the takings banked don't agree: ${ctx.sum} coins short, and the hand in the ledger is ${nameOf(g, ctx)}'s.${f?.drafted === life.c ? " Your lawyer's articles give you the right to see every account." : ""}`;
    },
    choices: [
      {
        label: "Say nothing, for now",
        tip: "Keep the peace. They may go on doing it.",
        apply: (g, life) => addStress(g, life, 5),
      },
      {
        label: "Demand it back",
        tip: "Face them with it: they pay it back into the chest and give up the books to you.",
        check: {
          skill: "persuasion",
          dc: (g, life, ctx) => {
            const c = g.s.chars[ctx.c];
            return c ? 3 + Math.round(charSkill(g.s, c, "persuasion") / 2) : 5;
          },
        },
        apply: (g, life, ctx, pass) => {
          const f = firmOf(g, ctx);
          if (!trading(f)) return;
          const p = partnerIn(f, ctx.c);
          const me = partnerIn(f, life.c);
          if (!p || !me) return;
          if (pass) {
            const other = lifeOfChar(g.s, ctx.c);
            if (other) {
              spend(g, other, ctx.sum);
              journal(
                g,
                other,
                `${charName(meOf(g.s, life))} faced you with the books of ${f.name}: you paid back ${ctx.sum} coins, and gave up the books.`,
                "bad",
              );
            }
            f.chest = Math.round((f.chest + ctx.sum) * 100) / 100;
            p.cooking = false;
            p.role = "silent";
            me.role = "managing";
            journal(
              g,
              life,
              `${cap(firstOf(g, ctx))} goes red, then white, and pays back ${ctx.sum} coins. You keep the books now.`,
              "good",
            );
          } else {
            p.cooking = false;
            journal(
              g,
              life,
              `${cap(firstOf(g, ctx))} denies everything, and says so loudly. You can still go to law.`,
              "bad",
            );
            const c = g.s.chars[ctx.c];
            if (c && !lifeOfChar(g.s, c.id))
              remembers(g, life, g.char(c.id), "Called me a thief", -15, 4);
          }
          partnersChanged(g, "f");
        },
      },
      {
        label: "Take them to law",
        tip: "A suit in the county court: the case goes through its scenes. Win, and they pay it back and are put out of the firm.",
        apply: (g, life, ctx) => {
          const f = firmOf(g, ctx);
          if (!trading(f)) return;
          const err = openSuit(g, f, life.c, ctx.c, ctx.sum, "embezzle");
          if (err) journal(g, life, err, "bad");
        },
      },
      {
        label: "Dissolve the partnership",
        tip: "Wind it up now: what they took comes out of their part.",
        apply: (g, life, ctx) => {
          const f = firmOf(g, ctx);
          if (trading(f)) windUp(g, f, `${nameOf(g, ctx)} was found out`);
        },
      },
    ],
  },
  {
    key: "pa-caught",
    pool: "raised",
    cooldown: 0,
    scene: "market",
    title: "Found out",
    body: (g, life, ctx) =>
      `${cap(nameOf(g, ctx))} closes the ledger and looks at you over it. "${ctx.sum} coins, partner. I'd like them back in the chest, and I'd like the books." Nobody else is in the room.`,
    choices: [
      {
        label: "Make it good",
        tip: "Pay it back into the chest, and give up the books.",
        apply: (g, life, ctx) => {
          const f = firmOf(g, ctx);
          if (!trading(f)) return;
          spend(g, life, ctx.sum);
          f.chest = Math.round((f.chest + ctx.sum) * 100) / 100;
          const me = partnerIn(f, life.c);
          const them = partnerIn(f, ctx.c);
          if (me) {
            me.cooking = false;
            me.role = "silent";
          }
          if (them) them.role = "managing";
          addRenown(g, life, -1);
          journal(
            g,
            life,
            `You pay back ${ctx.sum} coins into ${f.name}, and hand over the books.`,
          );
          partnersChanged(g, "f");
        },
      },
      {
        label: "Deny everything",
        tip: "A clerk's error, a bad debt, a thief in the warehouse. If they don't believe you, they'll go to law.",
        check: {
          skill: "persuasion",
          dc: (g, life, ctx) => {
            const c = g.s.chars[ctx.c];
            return c ? 4 + Math.round(charSkill(g.s, c, "trade") / 2) : 6;
          },
        },
        apply: (g, life, ctx, pass) => {
          const f = firmOf(g, ctx);
          if (!trading(f)) return;
          const me = partnerIn(f, life.c);
          if (me) me.cooking = false;
          if (pass) {
            journal(
              g,
              life,
              `${cap(firstOf(g, ctx))} lets it go, for now. You keep honest books after that.`,
            );
            partnersChanged(g, "f");
          } else openSuit(g, f, ctx.c, life.c, ctx.sum, "embezzle");
        },
      },
    ],
  },
  {
    key: "pa-books",
    pool: "raised",
    cooldown: 365,
    scene: "market",
    title: "Two sets of books",
    body: (g, life, ctx) => {
      const f = firmOf(g, ctx);
      return `The books of ${f?.name ?? "the firm"} are in your hand alone. Your partners see what you write, and only that. A quarter of the takings could go into your own pocket instead of the chest, and nobody the wiser, until someone looks.`;
    },
    choices: [
      {
        label: "Keep honest books",
        tip: "Nothing changes.",
        apply: () => undefined,
      },
      {
        label: "Keep a second set",
        tip: "A quarter of the takings is yours each month. Your partners may find it out: a lawsuit, or the end of the firm. Stop it any time on the firm's page.",
        apply: (g, life, ctx) => {
          const f = firmOf(g, ctx);
          const p = f ? partnerIn(f, life.c) : undefined;
          if (!p) return;
          p.cooking = true;
          partnersChanged(g, "f");
          journal(
            g,
            life,
            `You start a second set of books for ${f!.name}.`,
            "bad",
          );
        },
      },
    ],
  },
  {
    key: "pa-dispute",
    pool: "raised",
    cooldown: 0,
    scene: "market",
    title: "A quarrel over the accounts",
    body: (g, life, ctx) => {
      const f = firmOf(g, ctx);
      return `${cap(nameOf(g, ctx))} comes in with the accounts of ${f?.name ?? "the firm"} under one arm and a grievance under the other: by ${firstOf(g, ctx)}'s reckoning you owe ${ctx.sum} coins on the last division. ${cap(he(g, ctx))} wants it, or ${he(g, ctx)}'ll have the law on you.${f?.drafted === life.c ? " Your lawyer's articles are clear on the division." : f?.drafted === ctx.c ? ` ${cap(he(g, ctx))} had the articles drawn up, and the clauses lean ${g.s.chars[ctx.c]?.female ? "her" : "his"} way.` : ""}`;
    },
    choices: [
      {
        label: "Give way and pay",
        tip: "Pay what's claimed: peace in the firm.",
        apply: (g, life, ctx) => {
          spend(g, life, ctx.sum);
          const c = g.s.chars[ctx.c];
          if (c && !lifeOfChar(g.s, c.id))
            remembers(g, life, g.char(c.id), "Paid what was owed", 6, 2);
          journal(
            g,
            life,
            `You pay ${nameOf(g, ctx)} ${ctx.sum} coins, for the sake of peace.`,
          );
        },
      },
      {
        label: "Go to arbitration (2 coins)",
        tip: "Two merchants of the town hear you both. Win and the claim is dropped; lose and you pay it and the fee.",
        check: {
          skill: "persuasion",
          dc: (g, life, ctx) => {
            const c = g.s.chars[ctx.c];
            const f = firmOf(g, ctx);
            const lean =
              f?.drafted === life.c ? -3 : f?.drafted === ctx.c ? 3 : 0;
            return (
              (c ? Math.round(charSkill(g.s, c, "persuasion") / 2) + 3 : 5) +
              lean
            );
          },
        },
        apply: (g, life, ctx, pass) => {
          spend(g, life, 2);
          if (pass)
            journal(
              g,
              life,
              `The arbitrators find for you: ${nameOf(g, ctx)} drops the claim.`,
              "good",
            );
          else {
            spend(g, life, ctx.sum);
            journal(
              g,
              life,
              `The arbitrators find for ${nameOf(g, ctx)}: you pay ${ctx.sum} coins.`,
              "bad",
            );
          }
        },
      },
      {
        label: "Let them sue",
        tip: "See it out in the county court: if they lose, the claim fails; if you lose, you pay, and the debtors' prison may follow.",
        apply: (g, life, ctx) => {
          const f = firmOf(g, ctx);
          if (!trading(f)) return;
          const err = openSuit(g, f, ctx.c, life.c, ctx.sum, "claim");
          if (err) journal(g, life, err, "bad");
        },
      },
      {
        label: "Dissolve the partnership",
        tip: "Wind it up: capital back, the rest shared out.",
        apply: (g, life, ctx) => {
          const f = firmOf(g, ctx);
          if (trading(f)) windUp(g, f, "the partners fell out");
        },
      },
    ],
  },
  {
    key: "pa-creditors",
    pool: "raised",
    cooldown: 0,
    scene: "market",
    title: "Creditors at the door",
    body: (g, life, ctx) => {
      const f = firmOf(g, ctx);
      return `${cap(nameOf(g, ctx))} has failed. ${cap(he(g, ctx))}'s creditors have an execution against everything ${he(g, ctx)} owns, and that includes ${g.s.chars[ctx.c]?.female ? "her" : "his"} share in ${f?.name ?? "the firm"}. Their man is at the counting-house door: the share is to be sold for ${ctx.price} coins.`;
    },
    choices: [
      {
        label: "Let a creditor's man buy it",
        tip: "A stranger takes the share and sits silent in the firm.",
        apply: (g, life, ctx) => {
          const f = firmOf(g, ctx);
          if (trading(f)) sellSeized(g, f, "stranger");
        },
      },
      {
        label: (g, life, ctx) => `Buy the share yourself (${ctx.price})`,
        tip: "Their share and capital are yours.",
        blocked: (g, life, ctx) =>
          life.purse < ctx.price ? `You need ${ctx.price} coins` : null,
        apply: (g, life, ctx) => {
          const f = firmOf(g, ctx);
          if (!trading(f)) return;
          const err = sellSeized(g, f, "buy", life.c);
          if (err) journal(g, life, err, "bad");
        },
      },
      {
        label: "Wind up the firm",
        tip: "The creditors are paid from the bankrupt's part; the rest of you take yours.",
        apply: (g, life, ctx) => {
          const f = firmOf(g, ctx);
          if (trading(f)) sellSeized(g, f, "wind");
        },
      },
    ],
  },
  {
    key: "pa-cargo",
    pool: "raised",
    cooldown: 0,
    scene: "docks",
    title: "Lost at sea",
    body: (g, life, ctx) => {
      const f = firmOf(g, ctx);
      return `The news comes up from the quay with the tide: the cargo of ${f?.name ?? "the firm"} is gone, every barrel of it. The insurers in London shrug. The chest is the poorer by it, and so is every partner.`;
    },
    choices: [
      {
        label: "Put it down to the sea",
        tip: "These things happen.",
        apply: (g, life) => addStress(g, life, 3),
      },
      {
        label: "Put another cargo to the partners",
        tip: "The smallest cargo the chest can bear, if it can.",
        apply: (g, life, ctx) => {
          const f = firmOf(g, ctx);
          if (!trading(f)) return;
          const sum =
            [...CARGOES].reverse().find((x) => x <= f.chest / 2) ?? CARGOES[0];
          put(g, life, f, "goods", sum);
        },
      },
    ],
  },
  {
    key: "pa-ship",
    pool: "raised",
    cooldown: 0,
    scene: "docks",
    title: (g, life, ctx) =>
      ctx.w ? "Taken by a privateer" : "Lost with all her gear",
    body: (g, life, ctx) => {
      const f = firmOf(g, ctx);
      return ctx.w
        ? `A privateer under enemy colours took the firm's ${f?.lost?.name ?? "ship"} off the capes. The crew are ashore and sore; the ship is a prize in an enemy port, and ${f?.name ?? "the firm"} has a chest and no bottom.`
        : `The firm's ${f?.lost?.name ?? "ship"} went onto the rocks in a blow, and what the sea didn't take the wreckers did. ${f?.name ?? "The firm"} has a chest and no bottom.`;
    },
    choices: [
      {
        label: "Carry on with cargoes",
        tip: "The firm trades on, shipping in other men's bottoms.",
        apply: () => undefined,
      },
      {
        label: "Fit out another (put to the partners)",
        tip: "Paid from the chest: call in capital or borrow first if it's short.",
        apply: (g, life, ctx) => put(g, life, firmOf(g, ctx), "expand"),
      },
      {
        label: "Wind up (put to the partners)",
        tip: "Sell what's left and share it out.",
        apply: (g, life, ctx) => put(g, life, firmOf(g, ctx), "sell"),
      },
    ],
  },
  {
    key: "pa-held",
    pool: "raised",
    cooldown: 0,
    scene: "market",
    title: "The enemy holds the town",
    body: (g, life, ctx) => {
      const f = firmOf(g, ctx);
      return `Enemy soldiers are quartered in the town, and nobody buys or sells but them. ${f?.name ?? "The firm"} takes nothing while they're there, and still pays its hands and its rent.`;
    },
    choices: [
      {
        label: "Wait it out",
        tip: "The chest bears the loss (and then the partners).",
        apply: () => undefined,
      },
      {
        label: "Wind up (put to the partners)",
        tip: "Sell up while there's something to sell.",
        apply: (g, life, ctx) => put(g, life, firmOf(g, ctx), "sell"),
      },
    ],
  },
  {
    key: "pa-heir",
    pool: "raised",
    cooldown: 0,
    scene: "church",
    title: "A partner dies",
    body: (g, life, ctx) => {
      const f = firmOf(g, ctx);
      const dead = charName(g.s.chars[ctx.d]);
      const p = f ? partnerIn(f, ctx.c) : undefined;
      return `${dead} is buried, and the will is read: ${dead}'s share in ${f?.name ?? "the firm"} (${p?.share ?? 0} in a hundred) passes to ${nameOf(g, ctx)}. The articles let you take the heir in, or buy them out at a fair price.`;
    },
    choices: [
      {
        label: "Welcome them into the firm",
        tip: "They take the dead partner's place.",
        apply: (g, life, ctx) =>
          journal(
            g,
            life,
            `${nameOf(g, ctx)} takes ${g.s.chars[ctx.d]?.first ?? "their"}'s place in the firm.`,
          ),
      },
      {
        label: (g, life, ctx) => {
          const f = firmOf(g, ctx);
          return `Buy them out${f ? ` (${buyoutPrice(g.s, f, ctx.c)})` : ""}`;
        },
        tip: "Their share and capital are yours, at a fair price.",
        blocked: (g, life, ctx) => {
          const f = firmOf(g, ctx);
          const price = f ? buyoutPrice(g.s, f, ctx.c) : 0;
          return life.purse < price ? `You need ${price} coins` : null;
        },
        apply: (g, life, ctx) => {
          const f = firmOf(g, ctx);
          if (trading(f)) buyShare(g, life, f, ctx.c);
        },
      },
      {
        label: "Wind up (put to the partners)",
        tip: "Sell up and share it out.",
        apply: (g, life, ctx) => put(g, life, firmOf(g, ctx), "sell"),
      },
    ],
  },
];
