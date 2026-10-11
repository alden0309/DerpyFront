// HOME (r12): the family tree. Everyone who belongs on it (grandparents,
// parents, brothers and sisters, husbands and wives past and present, lovers
// who gave you children, children and their husbands and wives,
// grandchildren, and your husband's or wife's parents and brothers and
// sisters), each with how they're kin to you, laid out in generations like
// a genealogist's chart: couples side by side, children under the couple
// they came of. Positions are in slots (one card wide) and rows (one
// generation); the page draws them.

import { heirOf, meOf, siblingsOf } from "./LifeQueries";
import { ageOf } from "./Queries";
import type { Character, GameState, Life } from "./Types";

export type KinKind =
  | "you"
  | "parent"
  | "grandparent"
  | "sibling"
  | "spouse"
  | "former"
  | "lover"
  | "child"
  | "lovechild"
  | "grandchild"
  | "inlaw";

export interface KinNode {
  c: number;
  /** Generation: −2 grandparents … 0 you … +2 grandchildren. */
  gen: number;
  /** Slot (centre of the card), in card widths. */
  x: number;
  kind: KinKind;
  /** How they're kin to you, in words: "Your father", "Grandmother". */
  label: string;
  heir: boolean;
}

export interface KinCouple {
  a: number;
  b: number;
  /** Married (living or widowed), lovers, or parted. */
  kind: "married" | "lovers";
  /** Next to each other, or with others between. */
  near: boolean;
  /** Order among couples with others between (to stack their lines). */
  lane: number;
}

export interface KinDescent {
  /** Parents on the tree (one or two). */
  parents: number[];
  children: number[];
  /** A child not owned to (a lover's child kept secret). */
  hidden?: boolean;
}

export interface KinTree {
  nodes: KinNode[];
  couples: KinCouple[];
  descents: KinDescent[];
  /** Leftmost and rightmost slots, and the generations shown. */
  minX: number;
  maxX: number;
  minGen: number;
  maxGen: number;
  /** The family name, for the title. */
  family: string;
}

const he = (c: Character, m: string, f: string) => (c.female ? f : m);

/** A row's items placed in order, as near their wish as they'll go. */
function place(items: { want: number; w: number }[], gap = 0.15): number[] {
  const xs: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    let x = it.want;
    if (i > 0) {
      const prev = items[i - 1];
      x = Math.max(x, xs[i - 1] + prev.w / 2 + it.w / 2 + gap);
    }
    xs.push(x);
  }
  // Pushed right: shift the lot back so on average it sits where it wished.
  if (items.length) {
    const drift =
      xs.reduce((m, x, i) => m + (x - items[i].want), 0) / items.length;
    for (let i = 0; i < xs.length; i++) xs[i] -= drift;
    // But never back over a neighbour that had to be there.
    for (let i = 1; i < xs.length; i++)
      xs[i] = Math.max(
        xs[i],
        xs[i - 1] + items[i - 1].w / 2 + items[i].w / 2 + gap,
      );
  }
  return xs;
}

export function familyTree(s: GameState, life: Life): KinTree | null {
  const me = meOf(s, life);
  if (!me) return null;
  const ch = (id: number): Character | undefined =>
    id >= 0 ? s.chars[id] : undefined;
  const heir = heirOf(s, life);
  const nodes = new Map<number, KinNode>();
  const add = (
    c: Character | undefined,
    gen: number,
    kind: KinKind,
    label: string,
  ): boolean => {
    if (!c || nodes.has(c.id)) return false;
    nodes.set(c.id, { c: c.id, gen, x: 0, kind, label, heir: c.id === heir });
    return true;
  };
  const couples: KinCouple[] = [];
  const descents: KinDescent[] = [];
  const byBirth = (a: Character, b: Character) =>
    a.born - b.born || a.id - b.id;

  // ---------------------------------------------------------------- who

  const father = ch(me.father);
  const mother = ch(me.mother);
  const sibs = siblingsOf(s, me).sort(byBirth);
  // Partners: your husband or wife, then the other parents of your children.
  const spouse = ch(me.spouse);
  const affairKids = new Map<number, number>();
  for (const a of life.affairs ?? [])
    for (const k of a.kids)
      if (!me.children.includes(k)) affairKids.set(k, a.c);
  const kids = [...me.children, ...affairKids.keys()]
    .map(ch)
    .filter((c): c is Character => !!c)
    .sort(byBirth);
  const otherParent = (k: Character): number =>
    affairKids.has(k.id)
      ? affairKids.get(k.id)!
      : k.father === me.id
        ? k.mother
        : k.father;
  const partners: Character[] = [];
  if (spouse) partners.push(spouse);
  for (const k of kids) {
    const p = ch(otherParent(k));
    if (p && !partners.includes(p)) partners.push(p);
  }
  const lovers = new Set(
    (life.affairs ?? []).map((a) => a.c).filter((c) => c !== me.spouse),
  );
  const spouseSibs = spouse ? siblingsOf(s, spouse).sort(byBirth) : [];

  // ---------------------------------------------------------------- the middle row

  add(me, 0, "you", "You");
  for (const sb of sibs)
    add(
      sb,
      0,
      "sibling",
      sb.father === me.father && sb.mother === me.mother
        ? he(sb, "Your brother", "Your sister")
        : he(sb, "Your half-brother", "Your half-sister"),
    );
  for (const p of partners) {
    const kind: KinKind =
      p === spouse ? "spouse" : lovers.has(p.id) ? "lover" : "former";
    add(
      p,
      0,
      kind,
      p === spouse
        ? he(p, "Your husband", "Your wife")
        : kind === "lover"
          ? "Your lover"
          : p.alive
            ? he(p, "Your former husband", "Your former wife")
            : he(p, "Your late husband", "Your late wife"),
    );
  }
  for (const sb of spouseSibs)
    add(sb, 0, "inlaw", he(sb, "Brother-in-law", "Sister-in-law"));

  // Order: your brothers and sisters, you, your husband or wife and theirs,
  // then other partners.
  const row0: number[] = [
    ...sibs.map((c) => c.id).filter((id) => nodes.get(id)?.gen === 0),
    me.id,
    ...(spouse ? [spouse.id] : []),
    ...spouseSibs
      .map((c) => c.id)
      .filter((id) => nodes.get(id)?.kind === "inlaw"),
    ...partners.filter((p) => p !== spouse).map((p) => p.id),
  ];
  row0.forEach((id, i) => (nodes.get(id)!.x = i));
  const meX = nodes.get(me.id)!.x;

  // ---------------------------------------------------------------- children and grandchildren

  // By partner (the children of no known other parent first), each child
  // with their husband or wife beside them and their children beneath.
  const groups: { partner: number; kids: Character[] }[] = [];
  const groupOf = (pid: number) => {
    let gr = groups.find((x) => x.partner === pid);
    if (!gr) {
      gr = { partner: pid, kids: [] };
      groups.push(gr);
    }
    return gr;
  };
  for (const k of kids) {
    const p = otherParent(k);
    groupOf(partners.some((x) => x.id === p) ? p : -1).kids.push(k);
  }
  groups.sort(
    (a, b) =>
      (a.partner < 0 ? -1 : row0.indexOf(a.partner)) -
      (b.partner < 0 ? -1 : row0.indexOf(b.partner)),
  );
  const childUnits: {
    kid: Character;
    mate?: Character;
    grand: Character[];
    want: number;
    w: number;
  }[] = [];
  for (const gr of groups) {
    const px = gr.partner >= 0 ? nodes.get(gr.partner)!.x : meX;
    const mid = (meX + px) / 2;
    const units = gr.kids.map((k) => {
      const mate = ch(k.spouse);
      const grand = k.children
        .map(ch)
        .filter((c): c is Character => !!c)
        .sort(byBirth);
      const w = Math.max(mate ? 2 : 1, grand.length);
      return { kid: k, mate, grand, want: 0, w };
    });
    const total =
      units.reduce((m, u) => m + u.w, 0) + 0.15 * (units.length - 1);
    let x = mid - total / 2;
    for (const u of units) {
      u.want = x + u.w / 2;
      x += u.w + 0.15;
      childUnits.push(u);
    }
  }
  const unitX = place(
    childUnits.map((u) => ({ want: u.want, w: u.w })),
    0.3,
  );
  childUnits.forEach((u, i) => {
    const cx = unitX[i];
    const own = me.children.includes(u.kid.id);
    add(
      u.kid,
      1,
      own ? "child" : "lovechild",
      u.kid.id === heir
        ? he(u.kid, "Your son and heir", "Your daughter and heir")
        : own
          ? he(u.kid, "Your son", "Your daughter")
          : he(u.kid, "Your son, unowned", "Your daughter, unowned"),
    );
    const kidNode = nodes.get(u.kid.id)!;
    if (u.mate && !nodes.has(u.mate.id)) {
      kidNode.x = cx - 0.5;
      add(u.mate, 1, "inlaw", he(u.mate, "Son-in-law", "Daughter-in-law"));
      nodes.get(u.mate.id)!.x = cx + 0.5;
      couples.push({
        a: u.kid.id,
        b: u.mate.id,
        kind: "married",
        near: true,
        lane: 0,
      });
    } else kidNode.x = cx;
    const parentsX =
      u.mate && nodes.get(u.mate.id)?.gen === 1
        ? (kidNode.x + nodes.get(u.mate.id)!.x) / 2
        : kidNode.x;
    const gw = u.grand.length;
    u.grand.forEach((gc, j) => {
      if (add(gc, 2, "grandchild", he(gc, "Grandson", "Granddaughter")))
        nodes.get(gc.id)!.x = parentsX - (gw - 1) / 2 + j;
    });
    if (u.grand.length)
      descents.push({
        parents: [
          u.kid.id,
          ...(u.mate && nodes.get(u.mate.id)?.gen === 1 ? [u.mate.id] : []),
        ],
        children: u.grand.map((c) => c.id),
      });
  });
  for (const gr of groups) {
    const ids = gr.kids
      .map((k) => k.id)
      .filter((id) => nodes.get(id)?.gen === 1);
    if (!ids.length) continue;
    descents.push({
      parents: gr.partner >= 0 ? [me.id, gr.partner] : [me.id],
      children: ids,
      hidden: gr.kids.some((k) => affairKids.has(k.id)),
    });
  }

  // ---------------------------------------------------------------- couples in the middle row

  let lane = 0;
  for (const p of partners) {
    const near = Math.abs(nodes.get(p.id)!.x - meX) <= 1.01;
    couples.push({
      a: me.id,
      b: p.id,
      kind: lovers.has(p.id) && p !== spouse ? "lovers" : "married",
      near,
      lane: near ? 0 : lane++,
    });
  }

  // ---------------------------------------------------------------- parents and grandparents

  const sibIds = [me.id, ...sibs.map((c) => c.id)];
  const sibXs = sibIds.map((id) => nodes.get(id)!.x);
  const sibMid = (Math.min(...sibXs) + Math.max(...sibXs)) / 2;
  const row1: { id: number; want: number; kind: KinKind; label: string }[] = [];
  if (father)
    row1.push({
      id: father.id,
      want: mother ? sibMid - 0.5 : sibMid,
      kind: "parent",
      label: "Your father",
    });
  if (mother)
    row1.push({
      id: mother.id,
      want: father ? sibMid + 0.5 : sibMid,
      kind: "parent",
      label: "Your mother",
    });
  const sf = spouse ? ch(spouse.father) : undefined;
  const sm = spouse ? ch(spouse.mother) : undefined;
  if (spouse) {
    const group = [spouse.id, ...spouseSibs.map((c) => c.id)].filter((id) =>
      nodes.has(id),
    );
    const xs = group.map((id) => nodes.get(id)!.x);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    if (sf)
      row1.push({
        id: sf.id,
        want: sm ? mid - 0.5 : mid,
        kind: "inlaw",
        label: "Father-in-law",
      });
    if (sm)
      row1.push({
        id: sm.id,
        want: sf ? mid + 0.5 : mid,
        kind: "inlaw",
        label: "Mother-in-law",
      });
  }
  const row1Fresh = row1.filter((r) => !nodes.has(r.id));
  const row1X = place(row1Fresh.map((r) => ({ want: r.want, w: 1 })));
  row1Fresh.forEach((r, i) => {
    add(s.chars[r.id], -1, r.kind, r.label);
    nodes.get(r.id)!.x = row1X[i];
  });
  if (father && mother && nodes.get(father.id)?.gen === -1)
    couples.push({
      a: father.id,
      b: mother.id,
      kind: "married",
      near: true,
      lane: 0,
    });
  if (sf && sm && nodes.get(sf.id)?.gen === -1)
    couples.push({ a: sf.id, b: sm.id, kind: "married", near: true, lane: 0 });
  // Descents to the middle row: each brother or sister from the parents they share with you.
  const parentIds = [father?.id, mother?.id].filter(
    (x): x is number => x !== undefined && nodes.get(x)?.gen === -1,
  );
  if (parentIds.length) {
    const full = sibIds.filter((id) => {
      const c = s.chars[id];
      return parentIds.every((p) => c.father === p || c.mother === p);
    });
    if (full.length) descents.push({ parents: parentIds, children: full });
    for (const p of parentIds) {
      const half = sibIds.filter((id) => {
        const c = s.chars[id];
        return !full.includes(id) && (c.father === p || c.mother === p);
      });
      if (half.length) descents.push({ parents: [p], children: half });
    }
  }
  if (spouse) {
    const inl = [sf?.id, sm?.id].filter(
      (x): x is number => x !== undefined && nodes.get(x)?.gen === -1,
    );
    const kidsOf = [spouse.id, ...spouseSibs.map((c) => c.id)].filter((id) =>
      nodes.has(id),
    );
    if (inl.length) descents.push({ parents: inl, children: kidsOf });
  }

  // Grandparents above each of your parents.
  const row2: { id: number; want: number; label: string }[] = [];
  for (const par of [father, mother]) {
    if (!par || nodes.get(par.id)?.gen !== -1) continue;
    const px = nodes.get(par.id)!.x;
    const gf = ch(par.father);
    const gm = ch(par.mother);
    if (gf)
      row2.push({ id: gf.id, want: gm ? px - 0.5 : px, label: "Grandfather" });
    if (gm)
      row2.push({ id: gm.id, want: gf ? px + 0.5 : px, label: "Grandmother" });
  }
  const row2Fresh = row2.filter((r) => !nodes.has(r.id));
  const row2X = place(row2Fresh.map((r) => ({ want: r.want, w: 1 })));
  row2Fresh.forEach((r, i) => {
    add(s.chars[r.id], -2, "grandparent", r.label);
    nodes.get(r.id)!.x = row2X[i];
  });
  for (const par of [father, mother]) {
    if (!par || nodes.get(par.id)?.gen !== -1) continue;
    const gs = [par.father, par.mother].filter(
      (x) => x >= 0 && nodes.get(x)?.gen === -2,
    );
    if (gs.length === 2)
      couples.push({
        a: gs[0],
        b: gs[1],
        kind: "married",
        near: true,
        lane: 0,
      });
    if (gs.length) descents.push({ parents: gs, children: [par.id] });
  }

  // ---------------------------------------------------------------- bounds

  const list = [...nodes.values()];
  const xs = list.map((n) => n.x);
  const minX = Math.min(...xs);
  for (const n of list) n.x = Math.round((n.x - minX) * 100) / 100;
  return {
    nodes: list,
    couples: couples.filter((c) => nodes.has(c.a) && nodes.has(c.b)),
    descents: descents.filter(
      (d) => d.children.length > 0 && d.parents.every((p) => nodes.has(p)),
    ),
    minX: 0,
    maxX: Math.max(...list.map((n) => n.x)),
    minGen: Math.min(...list.map((n) => n.gen)),
    maxGen: Math.max(...list.map((n) => n.gen)),
    family: me.family,
  };
}

/** Born and died (or the age now), as a genealogist writes it. */
export function lifeSpan(
  s: GameState,
  c: Character,
  year: (day: number) => number,
): string {
  const b = year(c.born);
  if (c.alive) return `b. ${b}, aged ${ageOf(s, c)}`;
  return `${b} – ${c.died ? year(c.died.day) : "?"}`;
}

/** How someone is kin to the character you play, in a word or two, if they are. */
export function kinWord(
  s: GameState,
  life: Life | null | undefined,
  c: Character,
): string | null {
  const me = life ? meOf(s, life) : undefined;
  if (!me || c.id === me.id) return null;
  const f = c.female;
  const isParentOf = (p: Character | undefined, k: Character | undefined) =>
    !!p && !!k && (k.father === p.id || k.mother === p.id);
  if (me.spouse === c.id) return f ? "Your wife" : "Your husband";
  if (isParentOf(me, c)) return f ? "Your daughter" : "Your son";
  if (isParentOf(c, me)) return f ? "Your mother" : "Your father";
  if (
    (me.father >= 0 && c.father === me.father) ||
    (me.mother >= 0 && c.mother === me.mother)
  )
    return f ? "Your sister" : "Your brother";
  const parent = (k: Character, which: "father" | "mother") =>
    s.chars[k[which]];
  if (
    isParentOf(me, parent(c, "father")) ||
    isParentOf(me, parent(c, "mother"))
  )
    return f ? "Your granddaughter" : "Your grandson";
  if (
    isParentOf(c, parent(me, "father")) ||
    isParentOf(c, parent(me, "mother"))
  )
    return f ? "Your grandmother" : "Your grandfather";
  const sp = s.chars[me.spouse];
  if (sp && isParentOf(c, sp)) return f ? "Mother-in-law" : "Father-in-law";
  if (s.chars[c.spouse] && isParentOf(me, s.chars[c.spouse]))
    return f ? "Daughter-in-law" : "Son-in-law";
  return null;
}
