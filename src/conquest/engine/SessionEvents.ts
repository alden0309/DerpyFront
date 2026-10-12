// CHAMBER (r16): the scene of the assembly's yearly session. Where do you
// stand on the year's great question? Three real choices (each with what it
// does if the house carries it, who it pleases and who it angers, and the
// members your speech would bring over) and standing aside, which is also
// what happens if you leave it: nobody speaks for you.

import { formatDate } from "./Calendar";
import { inHouse, listWords } from "./ChamberCore";
import { registerFamily } from "./EventPacing";
import type { ConquestGame } from "./Game";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import {
  divisionNow,
  leanWords,
  pleases,
  QUESTION_BY_KEY,
  speechOf,
  standInSession,
  wouldBring,
} from "./Session";
import type { HouseSession, Life } from "./Types";

const sessOf = (g: ConquestGame, ctx: LCtx): HouseSession | undefined => {
  const sess = g.s.power?.cabinets[ctx.n]?.session;
  return sess && sess.id === ctx.id ? sess : undefined;
};

const pct = (p: number) => `${Math.round(p * 100)}%`;

function choice(i: number) {
  return {
    label: (g: ConquestGame, life: Life, ctx: LCtx) => {
      const sess = sessOf(g, ctx);
      const q = sess && QUESTION_BY_KEY.get(sess.key);
      if (!q) return "Speak";
      return `${q.choices[i].label} (Persuasion ${pct(speechOf(g.s, ctx.n, life).chance)})`;
    },
    tip: (g: ConquestGame, life: Life, ctx: LCtx) => {
      const sess = sessOf(g, ctx);
      const q = sess && QUESTION_BY_KEY.get(sess.key);
      if (!q) return "";
      const ch = q.choices[i];
      const p = pleases(g.s, ctx.n, ch);
      const w = wouldBring(g.s, ctx.n, sess!, life, i);
      const members = (k: number) =>
        k === 0 ? "nobody" : k === 1 ? "1 member" : `${k} members`;
      return `If the house carries it: ${ch.tip}${p.glad.length ? ` Speaking for it pleases ${listWords(p.glad)}` : ""}${p.sore.length ? `${p.glad.length ? "; it angers" : " Speaking for it angers"} ${listWords(p.sore)}` : ""}${p.glad.length || p.sore.length ? "." : ""} A good speech would bring ${members(w.good)} over${w.poor !== w.good ? `, a poor one ${members(w.poor)}` : ""}: those who lean only a little the other way.`;
    },
    apply: (g: ConquestGame, life: Life, ctx: LCtx) =>
      void standInSession(g, life, ctx.n, ctx.id, i),
  };
}

export const SESSION_EVENTS: LifeEventDef[] = [
  {
    key: "session-sits",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: (g, life, ctx) => {
      const pol = g.s.polities[ctx.n];
      const sess = sessOf(g, ctx);
      const q = sess && QUESTION_BY_KEY.get(sess.key);
      const house = (pol?.name ?? "the assembly").replace(/^the /, "The ");
      return q
        ? `${house} sits: ${lowerFirst(q.title(g, ctx.n, sess!.arg))}`
        : `${house} sits`;
    },
    body: (g, life, ctx) => {
      const sess = sessOf(g, ctx);
      const q = sess && QUESTION_BY_KEY.get(sess.key);
      if (!sess || !q) return "The house has risen.";
      const lean = divisionNow(g.s, ctx.n, sess);
      const where = inHouse(g.s, ctx.n, life.c)
        ? "Your vote is one; your voice may be worth more."
        : "The council sits as the upper house: you have no vote down there, but your voice carries.";
      return `${q.body(g, ctx.n, sess.arg)}\nAs the house leans now: ${leanWords(q, lean)}. It divides on ${formatDate(sess.until)}. ${where}`;
    },
    choices: [
      choice(0),
      choice(1),
      choice(2),
      {
        label: "Keep your seat and your counsel",
        tip: "Stand aside: no faction is pleased or offended, and the house divides without your voice.",
        apply: (g, life, ctx) =>
          void standInSession(g, life, ctx.n, ctx.id, -1),
      },
    ],
  },
];

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** Left unanswered, a session scene stands you aside: nobody speaks in your name. */
export const SESSION_DEFAULTS: Record<string, number> = { "session-sits": 3 };

// EVENTS (r15): the session rests in a family of its own (a year).
registerFamily("chamber", ["session-sits"], 300);
