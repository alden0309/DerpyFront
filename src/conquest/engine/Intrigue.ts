// INTRIGUE (r15): hearts and schemes, wired in. The player's commands
// (seduce, court your husband or wife, keep or let go a lover, plot, draw in
// an accomplice, give a scheme up, plan a wedding, marry quietly, break it
// off, go to a gathering, write in your own words), and the days and months
// they run on. Loaded by Game.ts; everything else listens through the hooks.

import { attend, attendDaily, stayHome } from "./Attendance";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { intrigueChanged, tidyIntrigue } from "./IntrigueCore";
import { setTravelHook } from "./IntrigueEvents";
import { withFlow } from "./LedgerCore";
import { travelTo } from "./Life";
import { writeNote } from "./Notes";
import { dropScheme, plotWeek, recruit, startPlot } from "./Plots";
import {
  dismissKept,
  keptMonthly,
  mySchemes,
  seduce,
  seduceWeek,
  woo,
} from "./Seduction";
import type { IntrigueCommand, Life, LifeCommand } from "./Types";
import { betrothalsMonthly, jilt, planWedding, quietWedding } from "./Weddings";

setTravelHook((g, life, to) => travelTo(g, life, to, false));

const PRIVATE = { key: "cmd:intrigue", label: "Private business" };

/** A player's command for hearts and schemes. */
export function intrigueCommand(
  g: ConquestGame,
  life: Life,
  c: IntrigueCommand,
): string | null {
  switch (c.act) {
    case "seduce":
      return withFlow(g, PRIVATE, () =>
        seduce(g, life, c.c ?? -1, c.aim === "keep" ? "keep" : "lover"),
      );
    case "woo":
      return woo(g, life);
    case "unkeep":
      return dismissKept(g, life, c.c ?? -1);
    case "plot":
      return withFlow(g, PRIVATE, () =>
        startPlot(g, life, c.c ?? -1, c.method ?? "poison"),
      );
    case "recruit":
      return withFlow(g, PRIVATE, () =>
        recruit(g, life, c.id ?? -1, c.c ?? -1),
      );
    case "drop":
      return dropScheme(g, life, c.id ?? -1);
    case "plan":
      return planWedding(
        g,
        life,
        c.id ?? -1,
        c.rite ?? "church",
        Math.round(c.tier ?? 0),
        Math.round(c.days ?? 0),
        !!c.licence,
        Array.isArray(c.list) ? c.list.filter((x) => Number.isInteger(x)) : [],
      );
    case "quiet":
      return withFlow(g, { key: "intr:wedding", label: "Your wedding" }, () =>
        quietWedding(g, life, c.id ?? -1),
      );
    case "jilt":
      return jilt(g, life, c.id ?? -1);
    case "attend":
      return attend(g, life, c.id ?? -1, c.back !== false);
    case "stay":
      return stayHome(g, life);
    case "write":
      return withFlow(g, { key: "intr:post", label: "Postage" }, () =>
        writeNote(g, life, c.c ?? -1, c.subject ?? "", c.body ?? "", c.re),
      );
    default:
      return "Not that.";
  }
}

hooks.command.push((g, life, c: LifeCommand) =>
  c.k === "intrigue" ? intrigueCommand(g, life, c) : undefined,
);

/** Each day: a week of each scheme on its weekday, and the journey to a gathering. */
hooks.lifeDaily.push((g, life) => {
  const s = g.s;
  for (const x of mySchemes(s, life)) {
    if (x.status !== "on") continue;
    if (x.by !== life.c) {
      x.status = "dropped";
      x.ended = s.day;
      x.lines.push("It died with you.");
      intrigueChanged(g);
      continue;
    }
    if ((s.day - x.started) % 7 !== 0 || s.day === x.started) continue;
    if (x.kind === "seduce") seduceWeek(g, life, x);
    else plotWeek(g, life, x);
  }
  attendDaily(g, life);
});

/** Each month: kept lovers' allowances, betrothals that lapse. */
hooks.lifeMonthly.push((g, life) => {
  keptMonthly(g, life);
  betrothalsMonthly(g, life);
});

/** The month's end: the long-settled tidied away; schemes nobody plays now ended. */
hooks.monthEnd.push((g) => {
  const st = g.s.intrigue;
  if (!st) return;
  for (const x of st.schemes) {
    if (x.status !== "on" && x.status !== "strike") continue;
    const l = g.s.lives.find((y) => y.seat === x.seat);
    if (!l || l.c !== x.by || l.watching) {
      x.status = "dropped";
      x.ended = g.s.day;
      intrigueChanged(g);
      continue;
    }
    // The moment came for a player, and passed without an answer (or they died of something else).
    if (x.status === "strike") {
      const t = g.s.chars[x.target];
      const tl = g.s.lives.find((y) => y.c === x.target);
      const waiting = tl?.events.some(
        (e) => e.key === "intr-strike" && e.ctx.s === x.id,
      );
      if (!t?.alive || !waiting) {
        x.status = t?.alive ? "foiled" : "dropped";
        x.ended = g.s.day;
        intrigueChanged(g);
      }
    }
  }
  tidyIntrigue(g);
});
