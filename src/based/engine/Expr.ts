// Conditions in a Mr. Based script: flags, relationships and comparisons.
//
//   met_penhallow
//   not tv_off and rel.anselme >= 2
//   (umbrella or coat) and count > 1
//   skill.focus >= 4                   (r21: his skill, with boosts)
//   speaks.fr, speaks.ru >= 2          (r22: he speaks French; r22 BPLAY:
//                                       his Russian is rated 2 or more)
//   has.matchbook and money >= 5       (r22 BPLAY: what he carries)
//   wears.reading_glasses or armed     (r22 BPLAY: worn, or a weapon held)
//   time >= 23:00 and weather.clear    (r22 BPLAY: the hour, the weather)

import { Expr } from "./Types";

const TOKEN =
  /\s*(>=|<=|==|!=|>|<|\(|\)|\d{1,2}:\d{2}|-?\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_.]*)/y;

/** Words a condition reads that aren't flags (r22 BPLAY). */
export const RESERVED = ["money", "armed", "time"];

function tokenize(src: string): string[] {
  const out: string[] = [];
  TOKEN.lastIndex = 0;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (m === null) {
      throw new Error(`can't read "${src.slice(pos).trim()}"`);
    }
    out.push(m[1]);
    pos = TOKEN.lastIndex;
  }
  return out;
}

export function parseExpr(src: string): Expr {
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i];
  const take = () => toks[i++];

  function or(): Expr {
    let a = and();
    while (peek() === "or") {
      take();
      a = { k: "or", a, b: and() };
    }
    return a;
  }
  function and(): Expr {
    let a = unary();
    while (peek() === "and") {
      take();
      a = { k: "and", a, b: unary() };
    }
    return a;
  }
  function unary(): Expr {
    if (peek() === "not") {
      take();
      return { k: "not", e: unary() };
    }
    return cmp();
  }
  function cmp(): Expr {
    const a = atom();
    const op = peek();
    if (
      op === ">=" ||
      op === "<=" ||
      op === ">" ||
      op === "<" ||
      op === "==" ||
      op === "!="
    ) {
      take();
      return { k: "cmp", op, a, b: atom() };
    }
    return a;
  }
  function atom(): Expr {
    const t = take();
    if (t === undefined) throw new Error("the condition ends too soon");
    if (t === "(") {
      const e = or();
      if (take() !== ")") throw new Error("a ( is never closed");
      return e;
    }
    const hm = /^(\d{1,2}):(\d{2})$/.exec(t);
    if (hm) {
      // A time of day, as minutes after midnight.
      const v = Number(hm[1]) * 60 + Number(hm[2]);
      if (Number(hm[1]) > 23 || Number(hm[2]) > 59) {
        throw new Error(`"${t}" isn't a time of day`);
      }
      return { k: "num", v };
    }
    if (/^-?\d/.test(t)) return { k: "num", v: Number(t) };
    if (t === "and" || t === "or" || t === "not" || t === ")") {
      throw new Error(`"${t}" is out of place`);
    }
    if (t.startsWith("rel.")) {
      const who = t.slice(4).toUpperCase();
      if (!/^[A-Z][A-Z0-9_]*$/.test(who)) throw new Error(`bad name "${t}"`);
      return { k: "rel", who };
    }
    if (t.startsWith("speaks.")) {
      const code = t.slice(7).toLowerCase();
      if (!/^[a-z][a-z_]*$/.test(code)) throw new Error(`bad language "${t}"`);
      return { k: "lang", code };
    }
    // r22 BPLAY: what he carries, his money, the hour and the weather.
    const item = /^(has|wears)\.(.*)$/.exec(t);
    if (item) {
      if (!/^[a-z][a-z0-9_]*$/.test(item[2])) {
        throw new Error(`items are lower_case: "${t}"`);
      }
      return item[1] === "has"
        ? { k: "has", item: item[2] }
        : { k: "wears", item: item[2] };
    }
    if (t.startsWith("weather.")) {
      const kind = t.slice(8);
      if (!["rain", "drizzle", "clear", "fog"].includes(kind)) {
        throw new Error(`"${t}": the weather is rain, drizzle, clear or fog`);
      }
      return { k: "weather", kind };
    }
    if (t === "money") return { k: "money" };
    if (t === "armed") return { k: "armed" };
    if (t === "time") return { k: "time" };
    if (t.startsWith("skill.")) {
      const id = t.slice(6).toUpperCase();
      if (!/^[A-Z][A-Z0-9_]*$/.test(id)) throw new Error(`bad skill "${t}"`);
      return { k: "skill", id };
    }
    if (!/^[a-z_][a-z0-9_]*$/.test(t)) {
      throw new Error(`flags are lower_case: "${t}"`);
    }
    return { k: "flag", name: t };
  }

  if (toks.length === 0) throw new Error("the condition is empty");
  const e = or();
  if (i < toks.length) throw new Error(`"${toks[i]}" is out of place`);
  return e;
}

export interface Values {
  flags: Record<string, number>;
  rels: Record<string, number>;
  /** Skill values, boosts included (r21). */
  skills?: Record<string, number>;
  /**
   * r22 BPLAY: his rating in each language (0 he doesn't speak it, up to
   * 3 or more), points, boosts and what he's wearing.
   */
  langs?: Readonly<Record<string, number>>;
  /** r22 BPLAY: what's in his pockets, and what he wears or holds. */
  inv?: Readonly<Record<string, number>>;
  worn?: Readonly<Record<string, string>>;
  money?: number;
  armed?: boolean;
  /** Minutes into the day, and the weather where he is. */
  time?: number;
  weather?: string;
}

/** Whether he wears or holds an item. */
function wearing(v: Values, item: string): boolean {
  for (const k in v.worn) if (v.worn[k] === item) return true;
  return false;
}

export function evalExpr(e: Expr, v: Values): number {
  switch (e.k) {
    case "num":
      return e.v;
    case "flag":
      return v.flags[e.name] ?? 0;
    case "rel":
      return v.rels[e.who] ?? 0;
    case "skill":
      return v.skills?.[e.id] ?? 0;
    case "lang":
      return v.langs?.[e.code] ?? 0;
    case "has":
      return (v.inv?.[e.item] ?? 0) > 0 || wearing(v, e.item) ? 1 : 0;
    case "wears":
      return wearing(v, e.item) ? 1 : 0;
    case "money":
      return v.money ?? 0;
    case "armed":
      return v.armed ? 1 : 0;
    case "time":
      return v.time ?? 0;
    case "weather":
      return v.weather === e.kind ? 1 : 0;
    case "not":
      return evalExpr(e.e, v) ? 0 : 1;
    case "and":
      return evalExpr(e.a, v) && evalExpr(e.b, v) ? 1 : 0;
    case "or":
      return evalExpr(e.a, v) || evalExpr(e.b, v) ? 1 : 0;
    case "cmp": {
      const a = evalExpr(e.a, v);
      const b = evalExpr(e.b, v);
      switch (e.op) {
        case ">=":
          return a >= b ? 1 : 0;
        case "<=":
          return a <= b ? 1 : 0;
        case ">":
          return a > b ? 1 : 0;
        case "<":
          return a < b ? 1 : 0;
        case "==":
          return a === b ? 1 : 0;
        default:
          return a !== b ? 1 : 0;
      }
    }
  }
}

/** Every flag and relationship a condition reads. */
export function exprReads(
  e: Expr,
  out: {
    flags: string[];
    rels: string[];
    skills?: string[];
    langs?: string[];
    /** r22 BPLAY: items read by has. and wears. */
    items?: string[];
  },
) {
  switch (e.k) {
    case "flag":
      out.flags.push(e.name);
      break;
    case "rel":
      out.rels.push(e.who);
      break;
    case "skill":
      out.skills?.push(e.id);
      break;
    case "lang":
      out.langs?.push(e.code);
      break;
    case "has":
    case "wears":
      out.items?.push(e.item);
      break;
    case "not":
      exprReads(e.e, out);
      break;
    case "and":
    case "or":
    case "cmp":
      exprReads(e.a, out);
      exprReads(e.b, out);
      break;
    default:
      break;
  }
  return out;
}
