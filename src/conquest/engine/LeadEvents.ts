// The moments a lead comes good: a strike to shout about or keep quiet,
// and claim jumpers at the diggings. (Only LifeEvents.ts imports this.)

import type { ConquestGame } from "./Game";
import { leadOf, startBoom } from "./Leads";
import {
  addRenown,
  addStress,
  earn,
  hurt,
  journal,
  touchLife,
} from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import type { Life } from "./Types";

const place = (g: ConquestGame, ctx: LCtx) =>
  g.map.provinces[leadOf(g.s, ctx.lead)?.p ?? 0]?.name ?? "the diggings";
const metal = (g: ConquestGame, ctx: LCtx) =>
  leadOf(g.s, ctx.lead)?.kind === "gold" ? "gold" : "silver";
const lifeLead = (life: Life, ctx: LCtx) =>
  life.leads?.find((x) => x.id === ctx.lead);

export const LEAD_EVENTS: LifeEventDef[] = [
  {
    key: "lead-strike",
    pool: "raised",
    cooldown: 0,
    title: "Pay dirt!",
    scene: "woods",
    body: (g, life, ctx) =>
      `It's real. At ${place(g, ctx)} you've taken ${ctx.got} coins' worth of ${metal(g, ctx)} out of the ground, and there's more where it came from. Nobody else knows yet. What now?`,
    choices: [
      {
        label: "Keep it quiet and keep digging",
        tip: "Stake the claim and say nothing: no rush, no crowds, more for you (for now).",
        apply: (g, life, ctx) => {
          journal(
            g,
            life,
            `You stake your claim at ${place(g, ctx)} and tell no one. Mine it when you can.`,
            "good",
          );
        },
      },
      {
        label: "Ride into town and shout it",
        tip: "Renown, and a rush: prices of tools and food jump, settlers pour in, and others come to dig beside you.",
        apply: (g, life, ctx) => {
          const lead = leadOf(g.s, ctx.lead);
          if (lead) startBoom(g, lead, life.c);
          addRenown(g, life, 6);
          journal(
            g,
            life,
            `You stood on a barrel at ${place(g, ctx)} and held up the ${metal(g, ctx)}. By morning half the county was on the road.`,
            "good",
          );
        },
      },
      {
        label: "Sell the claim to a company",
        tip: "Cash now for what's left in the ground (about a third of it), and no more digging.",
        apply: (g, life, ctx) => {
          const lead = leadOf(g.s, ctx.lead);
          const ll = lifeLead(life, ctx);
          if (!lead || !ll) return;
          const left = Math.max(0, lead.worth - lead.taken);
          const price = Math.round(left * 0.35);
          lead.taken = lead.worth;
          g.leadsChanged();
          earn(g, life, price);
          touchLife(g, life);
          ll.status = "done";
          ll.note = `Sold to a company for ${price} coins.`;
          journal(
            g,
            life,
            `Gentlemen from the city bought your claim at ${place(g, ctx)} for ${price} coins, cash.`,
            "good",
          );
        },
      },
    ],
  },
  {
    key: "lead-jumpers",
    pool: "raised",
    cooldown: 0,
    title: "Claim jumpers",
    scene: "woods",
    body: (g, life, ctx) =>
      `Four men with rifles are working your claim at ${place(g, ctx)} as if it were theirs. "Free country," says the biggest of them.`,
    choices: [
      {
        label: "Run them off",
        tip: "A fight. Win and the claim is yours again; lose and you're hurt.",
        check: { skill: "fighting", dc: 11 },
        apply: (g, life, ctx, pass) => {
          const lead = leadOf(g.s, ctx.lead);
          if (pass) {
            if (lead) {
              lead.rush = Math.max(0, lead.rush - 2);
              g.leadsChanged();
            }
            addRenown(g, life, 2);
            journal(g, life, "They went, cursing. The claim is yours.", "good");
          } else hurt(g, life, 15, "claim jumpers");
        },
      },
      {
        label: "Let them dig beside you",
        tip: "No fight, but less for you.",
        apply: (g, life, ctx) => {
          const lead = leadOf(g.s, ctx.lead);
          if (lead) {
            lead.rush++;
            g.leadsChanged();
          }
          addStress(g, life, 5);
          journal(g, life, "You share the creek. There's less in every pan.");
        },
      },
    ],
  },
];
