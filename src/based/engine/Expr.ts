// Conditions in a Mr. Based script: flags, relationships and comparisons.
//
//   met_penhallow
//   not tv_off and rel.anselme >= 2
//   (umbrella or coat) and count > 1
//   skill.composure >= 4               (r21: his skill, with boosts)

import { Expr } from "./Types";

const TOKEN =
  /\s*(>=|<=|==|!=|>|<|\(|\)|-?\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_.]*)/y;

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
    if (/^-?\d/.test(t)) return { k: "num", v: Number(t) };
    if (t === "and" || t === "or" || t === "not" || t === ")") {
      throw new Error(`"${t}" is out of place`);
    }
    if (t.startsWith("rel.")) {
      const who = t.slice(4).toUpperCase();
      if (!/^[A-Z][A-Z0-9_]*$/.test(who)) throw new Error(`bad name "${t}"`);
      return { k: "rel", who };
    }
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
  out: { flags: string[]; rels: string[]; skills?: string[] },
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
