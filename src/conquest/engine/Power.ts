// POWER (r12): the track's round and its commands. Each day: one office at
// a time is kept, the assembly divides on its bills, trials move on, and a
// governor (a player) is asked about bills waiting on him. Each month: the
// councils (favour, dismissals, scandal, the computer's councillors at
// work, measures put to a vote), bills brought in, cases for the
// justices, debts sued for, witches and heretics in their years, and the
// newspapers. Commands come as { k: "power", act }.

import {
  answerBill,
  assemblyDaily,
  bidForSpeaker,
  BILLS,
  bringBill,
  dissolve,
  npcBills,
  prorogue,
  steerBill,
} from "./Assembly";
import { dismissLocal, usePower } from "./Authority";
import {
  councilMonthly,
  govAppoint,
  govDismiss,
  proclaim,
  seekSeat,
  signMatter,
  useSeatAction,
  voteMatter,
} from "./Council";
import { COUNCIL_ORDER } from "./CouncilTitles";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { journal } from "./LifeCore";
import { isChildLife, isPlayed, lifeOfChar, meOf } from "./LifeQueries";
import { localOfficesOf } from "./Offices";
import { oneOfficeSweep } from "./OneOffice";
import {
  buyPaper,
  fireWriter,
  foundPaper,
  hireWriter,
  licensePaper,
  orderShut,
  pressMonthly,
  printPiece,
  sellPaper,
  setStance,
  STANCE_NAMES,
} from "./Press";
import { charName } from "./Queries";
import {
  accusationsMonthly,
  debtSuits,
  openTrial,
  sessionsMonthly,
  trialsDaily,
} from "./Trials";
import type {
  CouncilSeat,
  Life,
  LifeCommand,
  Paper,
  PowerCommand,
} from "./Types";

export function powerDaily(g: ConquestGame): void {
  oneOfficeSweep(g);
  assemblyDaily(g);
  trialsDaily(g);
  askAssent(g);
}

export function powerMonthly(g: ConquestGame): void {
  councilMonthly(g);
  npcBills(g);
  sessionsMonthly(g);
  debtSuits(g);
  accusationsMonthly(g);
  pressMonthly(g);
  // Seats are offered to those at court from Politics.ts's round.
}

/** Bills waiting on a player governor: one scene at a time. */
function askAssent(g: ConquestGame): void {
  const s = g.s;
  for (const c of Object.values(s.power?.cabinets ?? {})) {
    const gov = lifeOfChar(s, s.nations[c.n]?.ruler ?? -1);
    if (!gov || gov.events.some((e) => e.key === "bill-assent")) continue;
    const b = c.bills.find((x) => x.stage === "governor");
    if (b) raiseEvent(g, gov, "bill-assent", { b: b.id, n: c.n });
  }
}

const seatOk = (x: string | undefined): x is CouncilSeat =>
  !!x && (COUNCIL_ORDER as string[]).includes(x);

/** Bring someone whose secret you know before the court. */
function accuseWithSecret(
  g: ConquestGame,
  life: Life,
  c: number,
): string | null {
  const s = g.s;
  const me = meOf(s, life);
  const ch = s.chars[c];
  if (!me || !ch?.alive) return "They're gone.";
  const secret = (life.secrets ?? []).find(
    (x) =>
      x.of === c &&
      (x.kind === "crime" || x.kind === "affair" || x.kind === "child"),
  );
  if (!secret)
    return "You know nothing against them that would stand in court.";
  if (isPlayed(s, c))
    return "Another player: they'll have to be caught by the law.";
  const p = ch.home ?? life.prov;
  const n = s.provinces[p]?.owner ?? -1;
  if (n < 0 || s.nations[n]?.kind !== "power")
    return "There's no court there to hear it.";
  if ((s.power?.trials ?? []).some((t) => t.stage < 5 && t.defendant === c))
    return `${ch.first} is before the court already.`;
  life.secrets = (life.secrets ?? []).filter((x) => x !== secret);
  openTrial(g, {
    kind: secret.kind === "crime" ? "accused" : "presentment",
    defendant: c,
    accuser: me.id,
    p,
    nation: n,
    charge:
      secret.kind === "crime"
        ? "the crime you know of"
        : secret.kind === "affair"
          ? "adultery"
          : "a bastard child",
    grade: secret.kind === "crime" ? 2 : 1,
    evidence: 9,
  });
  journal(
    g,
    life,
    `You bring ${charName(ch)} before the court with what you know. There's no taking it back now.`,
  );
  return null;
}

function powerCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "power") return undefined;
  const s = g.s;
  const x = c as PowerCommand;
  const me = meOf(s, life);
  if (!me || life.watching) return "You're watching the world now.";
  if (isChildLife(s, life)) return "Not until you're grown.";
  const id = x.id ?? -1;
  const govN = s.nations.findIndex((n) => n.alive && n.ruler === me.id);
  switch (x.act) {
    // ---- county and town offices
    case "use":
      return usePower(g, life, id, x.key ?? "", x.c ?? -1, x.side ?? 1);
    case "dismiss":
      return dismissLocal(g, life, id);
    // ---- the council
    case "seat":
      return useSeatAction(g, life, x.key ?? "", x.c ?? -1);
    case "seek":
      return seatOk(x.seat) ? seekSeat(g, life, x.seat) : "Which seat?";
    case "vote":
      return voteMatter(g, life, x.n ?? me.nation, id, x.side ?? 0);
    case "sign":
      return signMatter(g, life, x.n ?? govN, id, !!x.yes);
    case "appoint":
      return seatOk(x.seat)
        ? govAppoint(g, life, x.seat, x.c ?? -1)
        : "Which seat?";
    case "unseat":
      return seatOk(x.seat) ? govDismiss(g, life, x.seat) : "Which seat?";
    case "proclaim":
      return proclaim(g, life, x.key ?? "", x.p ?? -1);
    // ---- the assembly
    case "bill": {
      if (!BILLS[x.key ?? ""]) return "Which bill?";
      const local = localOfficesOf(s, me.id).find((o) => o.key === "burgess");
      return bringBill(
        g,
        life,
        me.nation,
        x.key!,
        x.p ?? local?.prov ?? life.home,
      );
    }
    case "steer":
      return steerBill(g, life, id);
    case "speaker":
      return bidForSpeaker(g, life);
    case "assent":
      if (govN < 0) return "Only the governor assents.";
      return answerBill(g, govN, id, !!x.yes);
    case "dissolve":
      if (govN < 0) return "Only the governor dissolves the house.";
      return dissolve(g, govN);
    case "prorogue":
      if (govN < 0) return "Only the governor prorogues the house.";
      return prorogue(g, govN);
    // ---- the press
    case "found":
      return foundPaper(g, life, stanceOk(x.stance) ? x.stance : "independent");
    case "buy":
      return buyPaper(g, life, id);
    case "sell":
      return sellPaper(g, life);
    case "hire":
      return hireWriter(g, life, x.c ?? -1);
    case "fire":
      return fireWriter(g, life, x.c ?? -1);
    case "stance":
      return stanceOk(x.stance) ? setStance(g, life, x.stance) : "What line?";
    case "print":
      return printPiece(g, life, x.on ?? "c", x.c ?? -1, x.side ?? 1);
    case "license":
      return licensePaper(g, life, id, !!x.yes);
    case "shut":
      return orderShut(g, life, id, !!x.yes);
    // ---- the law
    case "accuse":
      return accuseWithSecret(g, life, x.c ?? -1);
    default:
      return "Unknown.";
  }
}

const stanceOk = (v: string | undefined): v is Paper["stance"] =>
  !!v && v in STANCE_NAMES;

hooks.command.push(powerCommand);
