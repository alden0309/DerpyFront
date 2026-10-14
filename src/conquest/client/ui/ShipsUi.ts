// SHIPS (r21): a ship of your own, more than a hull: her company by name
// (role, pay, promotion), the charters at her quay with their odds, a
// venture of your own cargo, sending her where you like, her voyage and a
// stay on the way, her refits, careening on a beach, her log and her name.
// And travelling together (asking, inviting, getting off on the way), your
// place aboard someone else's ship, and the way off a shore with no port.

import { html, nothing, TemplateResult } from "lit";
import { BOATS, boatRoute } from "../../engine/Boats";
import { formatDate } from "../../engine/Calendar";
import {
  askingPay,
  expectedRole,
  fitFor,
  hireGate,
  offerGate,
  prospectOf,
  roleOf,
  roleSkillWords,
  signOdds,
} from "../../engine/Hiring";
import { hasPlace, lifeOfSeat, meOf } from "../../engine/LifeQueries";
import { hasMarket, soldHere } from "../../engine/Markets";
import { partyCheck, partyLead, partyMembers, strandEmbark } from "../../engine/Parties";
import { charName } from "../../engine/Queries";
import {
  aboardShip,
  alongsideShip,
  berthsOf,
  boatOf,
  canCommand,
  careenCheck,
  careenCost,
  charterCheck,
  charterOdds,
  charterPay,
  chartersAt,
  hireWithHer,
  hiresAboard,
  hostOfBoat,
  ladingWords,
  menWithHer,
  nextStop,
  officer,
  refitCheck,
  refitCost,
  repOf,
  repWords,
  seekerChar,
  seekersAt,
  shipFx,
  shipProv,
  townSeamen,
  ventureCharter,
  ventureCost,
  ventureSale,
} from "../../engine/Ships";
import {
  CHARTER_NAMES,
  CHARTER_TEXT,
  REFIT_KEYS,
  REFITS,
  SHIP_LADDER,
  SHIP_ROLES,
  STAY_DAYS,
} from "../../engine/ShipsData";
import type { Boat, Character, Hire, Life } from "../../engine/Types";
import { GOODS } from "../../engine/Types";
import { action, bar, charLink, type GameUi, provLink } from "./Context";
import { oddsLine, oddsPanel } from "./Odds";
import { coins, price } from "./Price";

const r1 = (v: number) => Math.round(v * 10) / 10;

/** What the player picked in a form here (kept while the page is open). */
const picked = new Map<string, string | number>();
const pick = <T extends string | number>(key: string, d: T): T =>
  (picked.get(key) as T | undefined) ?? d;
const setPick = (ui: GameUi, key: string, v: string | number) => {
  picked.set(key, v);
  ui.redraw();
};

/** The roles she has room for. */
function rolesFor(ui: GameUi, owner: Life, b: Boat) {
  const host = hostOfBoat(ui.s, owner, b);
  return SHIP_ROLES.filter((r) => host.room(r.key) > 0 || r.key === "hand");
}

// ---------------------------------------------------------------- the ship card's parts

/** Everything of a ship's own beyond her standing work, for her card on Estate › Boats. */
export function shipParts(ui: GameUi, b: Boat): TemplateResult {
  const life = ui.life!;
  return html`<div class="cq-ship-parts">
    ${voyagePart(ui, life, b)} ${companyPart(ui, life, b)}
    ${chartersPart(ui, life, b)} ${refitPart(ui, life, b)}
    ${logPart(ui, b)}
  </div>`;
}

/** Her voyage: at sea, lying over, her charter. */
function voyagePart(ui: GameUi, owner: Life, b: Boat): TemplateResult | typeof nothing {
  const s = ui.s;
  const job = b.charter;
  const map = ui.map;
  const lines: TemplateResult[] = [];
  if (b.way) {
    const next = b.way.path[0];
    lines.push(
      html`<p>
        <b>At sea</b>, bound for ${provLink(ui, b.way.dest)}${next !== b.way.dest
          ? html`; next ${map.provinces[next]?.name}`
          : nothing}, about ${formatDate(b.way.arrive)}.
        ${aboardShip(owner, owner.seat, b)
          ? "You're aboard, commanding her."
          : `${capFirst(shipFx(s, owner, b).master.who)} has her.`}
      </p>`,
    );
  }
  if (b.stay) {
    const left = b.stay.since >= 0 ? STAY_DAYS - (s.day - b.stay.since) : STAY_DAYS;
    lines.push(
      html`<p>
        <b>Lying over</b> at ${map.provinces[b.stay.at]?.name} on the way to
        ${map.provinces[b.stay.dest]?.name}:
        ${b.stay.since < 0
          ? "she'll stop there."
          : html`since ${formatDate(b.stay.since)}. The voyage can go on for
            ${left} days more; after that, it's over${job ? " (and her charter forfeit)" : ""}.`}
      </p>`,
    );
  }
  if (job) {
    const c = job.c;
    lines.push(
      html`<p>
        <b>${CHARTER_NAMES[c.kind]}</b>: ${ladingWords(map, c)} (${c.by}).
        ${job.phase === "out" && ["freight", "passengers", "smuggling"].includes(c.kind)
          ? html`Due by ${formatDate(job.due)}: ${price(charterPay(b, c), { gain: true })}
              on delivery, a quarter docked if she's late.`
          : job.phase === "there"
            ? html`At work until ${formatDate(job.due)}; ${coins(job.earned)} so far.`
            : job.phase === "home"
              ? html`Making for home; ${coins(job.earned)} of it.`
              : nothing}
      </p>`,
    );
  }
  if (!lines.length) return nothing;
  const stop = nextStop(owner, b);
  const commander = canCommand(s, owner, owner, b);
  return html`<div class="cq-ship-voyage">
    ${lines}
    <div class="cq-btnrow">
      ${stop !== undefined && commander
        ? action(
            `Lie over at ${map.provinces[stop]?.name}`,
            { ok: true },
            () => void ui.cmd({ k: "ship", act: "stay", id: b.id }),
            "small",
            `Stop there as long as you like: the voyage goes on if she sails within ${STAY_DAYS} days of coming in.`,
          )
        : nothing}
      ${b.stay && b.stay.since >= 0
        ? action(
            `Sail on for ${map.provinces[b.stay.dest]?.name}`,
            commander
              ? { ok: true }
              : { ok: false, why: "Be where she lies (or have a captain aboard who's a player)" },
            () => void ui.cmd({ k: "ship", act: "resume", id: b.id }),
            "small primary",
          )
        : nothing}
      ${job && !b.way
        ? action(
            "Give up the charter",
            { ok: true },
            () => {
              if (confirm("Give up the charter? Her name on the waterfront suffers if it's a cargo or passengers not delivered."))
                void ui.cmd({ k: "ship", act: "drop", id: b.id });
            },
            "small quiet",
          )
        : nothing}
    </div>
  </div>`;
}

const capFirst = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** Her company by name: each with a role, pay and how they stand; and taking people on. */
function companyPart(ui: GameUi, owner: Life, b: Boat): TemplateResult {
  const s = ui.s;
  const hires = hiresAboard(b);
  const def = BOATS[b.kind];
  const fx = shipFx(s, owner, b);
  const pay = r1(hires.reduce((m, h) => m + h.pay, 0));
  const offers = b.roster?.offers ?? [];
  const summary = html`Her company by name
    <span class="cq-muted small"
      >${hires.length
        ? html`${hires.length}, ${price(pay, { per: "month" })}`
        : "none yet"}${offers.length ? `, ${offers.length} offered` : ""}</span
    >`;
  return html`<details class="cq-more cq-ship-company" ?open=${hires.length > 0 && hires.length < 4}>
    <summary>${summary}</summary>
    <p class="small cq-muted">
      ${capFirst(fx.master.who)} commands her (seamanship ${fx.master.skill}).
      ${menWithHer(s, owner, b)} men with her of the ${def.crew} she needs to
      sail. Taken on by name, each has a role and the pay you set; promote,
      demote, or change it whenever you like. Without you aboard, her captain
      (or her mate, or her senior hand) has her, and she works and sails without you.
    </p>
    ${hires.length
      ? html`<ul class="cq-ship-roster">
          ${hires.map((h) => hireRow(ui, owner, b, h))}
        </ul>`
      : nothing}
    ${offers.length
      ? html`<ul class="cq-ship-roster offers">
          ${offers.map((o) => {
            const role = roleOf(SHIP_LADDER, o.role);
            return html`<li>
              <span class="cq-ship-who">${charLink(ui, s.chars[o.c], false)}
                <small>offered ${role?.title.toLowerCase()} at ${coins(o.pay)} a month, till ${formatDate(o.until)}</small></span>
              ${action("Take it back", { ok: true }, () => void ui.cmd({ k: "ship", act: "unoffer", id: b.id, hire: o.id }), "small quiet")}
            </li>`;
          })}
        </ul>`
      : nothing}
    ${fx.lines.length > 1
      ? html`<ul class="cq-ship-fx small">
          ${fx.lines.map((l) => html`<li>${l}</li>`)}
        </ul>`
      : nothing}
    ${seekersPart(ui, owner, b)} ${offerPart(ui, owner, b)}
  </details>`;
}

/** One of her company: who, their role (to change), their pay (to change), how they stand. */
function hireRow(ui: GameUi, owner: Life, b: Boat, h: Hire): TemplateResult {
  const s = ui.s;
  const c = s.chars[h.c];
  const role = roleOf(SHIP_LADDER, h.role)!;
  const fit = fitFor(prospectOf(s, owner, c, SHIP_LADDER), role);
  const ask = askingPay(prospectOf(s, owner, c, SHIP_LADDER), role);
  const roles = rolesFor(ui, owner, b);
  const withHer = hireWithHer(s, owner, b, h);
  const step = (d: number) =>
    void ui.cmd({ k: "ship", act: "pay", id: b.id, hire: h.id, pay: Math.max(0.5, r1(h.pay + d)) });
  return html`<li class=${withHer ? "" : "away"}>
    <span class="cq-ship-who">
      ${charLink(ui, c, false)}${h.seat ? html` <span class="cq-chip player">player</span>` : nothing}
      <small
        >${roleSkillWords(role)} ${fit}${h.seat
          ? withHer
            ? ", with her"
            : ", not with her"
          : html`, content ${bar(h.loyalty / 100)}`}${(h.owed ?? 0) > 0
          ? html`, <b class="bad">unpaid</b>`
          : nothing}</small
      >
    </span>
    <select
      class="cq-select small"
      aria-label="Role"
      @change=${(e: Event) =>
        void ui.cmd({ k: "ship", act: "role", id: b.id, hire: h.id, role: (e.target as HTMLSelectElement).value })}
    >
      ${roles.map((r) => html`<option value=${r.key} ?selected=${r.key === h.role}>${r.title}</option>`)}
    </select>
    <span class="cq-ship-pay" title=${`They'd ask about ${coins(ask)} a month as ${role.title.toLowerCase()}`}>
      <button class="cq-btn tiny quiet" aria-label="Less pay" @click=${() => step(-0.5)}>−</button>
      ${price(h.pay, { per: "month" })}
      <button class="cq-btn tiny quiet" aria-label="More pay" @click=${() => step(0.5)}>+</button>
    </span>
    ${action(
      "Let go",
      { ok: true },
      () => {
        if (confirm(`Pay off ${charName(c)}?${h.seat ? " It's their work: they lose their place." : ""}`))
          void ui.cmd({ k: "ship", act: "dismiss", id: b.id, hire: h.id });
      },
      "small quiet",
    )}
  </li>`;
}

/** People at the quay looking for a berth, and the town's seamen: whoever would sign, at what. */
function seekersPart(ui: GameUi, owner: Life, b: Boat): TemplateResult | typeof nothing {
  const s = ui.s;
  if (!alongsideShip(owner, b) || !hasPlace(s, ui.w, b.prov, "docks")) return nothing;
  const host = hostOfBoat(s, owner, b);
  const seekers = seekersAt(s, ui.w, b.prov).filter(
    (k) => !s.lives.some((l) => l.cooldowns[`seek:${b.prov}:${Math.floor(s.day / 30)}:${k.slot}`]),
  );
  const town = townSeamen(s, b.prov);
  if (!seekers.length && !town.length) return nothing;
  const row = (key: string, c: Character, note: string, run: (role: string, pay: number) => void) => {
    const p = prospectOf(s, owner, c, SHIP_LADDER);
    const want = expectedRole(p, SHIP_LADDER);
    const roles = rolesFor(ui, owner, b);
    const roleKey = pick(`r:${key}`, roles.some((r) => r.key === want.key) ? want.key : "hand");
    const role = roleOf(SHIP_LADDER, roleKey)!;
    const pay = pick(`p:${key}:${roleKey}`, askingPay(p, role));
    const gate = hireGate(s, host, p, roleKey, pay);
    const odds = signOdds(host, p, role, pay);
    const ok = gate.ok && odds.total > 0;
    const worst = [...odds.parts].sort((a, z) => a.value - z.value)[0];
    return html`<li>
      <span class="cq-ship-who"
        ><b>${charName(c)}</b>
        <small>${note}; seamanship ${p.skills.seamanship ?? 0}, leadership ${p.skills.leadership ?? 0}${(p.skills.medicine ?? 0) > 3
          ? `, medicine ${p.skills.medicine}`
          : ""}; looks for a place as ${want.title.toLowerCase()}</small></span
      >
      <select
        class="cq-select small"
        aria-label="Role"
        @change=${(e: Event) => setPick(ui, `r:${key}`, (e.target as HTMLSelectElement).value)}
      >
        ${roles.map((r) => html`<option value=${r.key} ?selected=${r.key === roleKey}>${r.title}</option>`)}
      </select>
      <span class="cq-ship-pay">
        <button class="cq-btn tiny quiet" aria-label="Offer less" @click=${() => setPick(ui, `p:${key}:${roleKey}`, Math.max(0.5, r1(pay - 0.5)))}>−</button>
        ${price(pay, { per: "month" })}
        <button class="cq-btn tiny quiet" aria-label="Offer more" @click=${() => setPick(ui, `p:${key}:${roleKey}`, r1(pay + 0.5))}>+</button>
      </span>
      ${action(
        "Sign on",
        gate.ok ? (ok ? { ok: true } : { ok: false, why: `Won't: ${(worst?.label ?? "").toLowerCase()}` }) : gate,
        () => run(roleKey, pay),
        `small ${ok ? "primary" : ""}`,
        odds.parts.map((x) => `${x.label}: ${x.value > 0 ? "+" : ""}${x.value}`).join("; "),
      )}
    </li>`;
  };
  return html`<p class="cq-ship-sub">Looking for a berth at the quay</p>
    <ul class="cq-ship-roster hire">
      ${seekers.map((k) =>
        row(`k${b.prov}:${k.slot}`, seekerChar(s, b.prov, k), `${k.age}, ${k.note}`, (role, pay) =>
          void ui.cmd({ k: "ship", act: "hire", id: b.id, arg: k.slot, role, pay }),
        ),
      )}
      ${town.map((c) =>
        row(`c${c.id}`, c, "a seaman of the town", (role, pay) =>
          void ui.cmd({ k: "ship", act: "hire", id: b.id, c: c.id, role, pay }),
        ),
      )}
    </ul>`;
}

/** Offer a place to another player: their role and pay, as you set them. */
function offerPart(ui: GameUi, owner: Life, b: Boat): TemplateResult | typeof nothing {
  const s = ui.s;
  const players = s.lives.filter((l) => l.seat !== owner.seat && l.c >= 0 && !l.watching && !hiresAboard(b).some((h) => h.seat === l.seat));
  if (!players.length) return nothing;
  const host = hostOfBoat(s, owner, b);
  const roles = rolesFor(ui, owner, b);
  return html`<p class="cq-ship-sub">Offer a place to a player</p>
    <ul class="cq-ship-roster hire">
      ${players.map((l) => {
        const key = `pl:${l.seat}`;
        const roleKey = pick(`r:${key}`, "hand");
        const role = roleOf(SHIP_LADDER, roleKey)!;
        const pay = pick(`p:${key}:${roleKey}`, role.pay);
        const gate = offerGate(s, host, l, roleKey, pay);
        return html`<li>
          <span class="cq-ship-who"
            >${charLink(ui, meOf(s, l), false)} <span class="cq-chip player">player · ${l.name}</span>
            <small>they're asked, and may accept or decline; it's their work then</small></span
          >
          <select class="cq-select small" aria-label="Role" @change=${(e: Event) => setPick(ui, `r:${key}`, (e.target as HTMLSelectElement).value)}>
            ${roles.map((r) => html`<option value=${r.key} ?selected=${r.key === roleKey}>${r.title}</option>`)}
          </select>
          <span class="cq-ship-pay">
            <button class="cq-btn tiny quiet" aria-label="Offer less" @click=${() => setPick(ui, `p:${key}:${roleKey}`, Math.max(0.5, r1(pay - 0.5)))}>−</button>
            ${price(pay, { per: "month" })}
            <button class="cq-btn tiny quiet" aria-label="Offer more" @click=${() => setPick(ui, `p:${key}:${roleKey}`, r1(pay + 0.5))}>+</button>
          </span>
          ${action(
            "Offer the place",
            gate,
            () => void ui.cmd({ k: "ship", act: "offer", id: b.id, c: l.c, role: roleKey, pay }),
            "small",
          )}
        </li>`;
      })}
    </ul>`;
}

/** The charters at her quay, a venture of your own, and sending her somewhere. */
function chartersPart(ui: GameUi, owner: Life, b: Boat): TemplateResult | typeof nothing {
  const s = ui.s;
  if (b.way || b.charter || b.stay) return nothing;
  const here = !owner.travel && owner.prov === b.prov;
  const remote = !!(officer(s, owner, b, "captain") ?? officer(s, owner, b, "mate"));
  if (!here && !remote) return nothing;
  const list = chartersAt(s, ui.w, b.prov);
  return html`<details class="cq-more cq-ship-charters">
    <summary>
      Charters at ${ui.map.provinces[b.prov]?.name}
      <span class="cq-muted small">${list.length ? `${list.length} this month` : "none this month"}</span>
    </summary>
    ${!here
      ? html`<p class="small cq-muted">You're away: you send word to her ${officer(s, owner, b, "captain") ? "captain" : "mate"}, and she sails under him.</p>`
      : nothing}
    <ul class="cq-ship-charter-list">
      ${list.map((c) => {
        const v = charterOdds(s, ui.w, owner, b, c, false);
        const send = charterCheck(s, ui.w, owner, b, c, false);
        const sail = charterCheck(s, ui.w, owner, b, c, true);
        return html`<li>
          <p class="cq-ship-charter-head">
            <b>${CHARTER_NAMES[c.kind]}</b>: ${ladingWords(ui.map, c)}
            <span class="cq-muted small">(${c.by})</span>
            ${["freight", "passengers", "smuggling"].includes(c.kind)
              ? price(charterPay(b, c), { gain: true })
              : c.kind === "packet"
                ? price(charterPay(b, c), { gain: true, per: "month" })
                : nothing}
          </p>
          <p class="small cq-muted">${CHARTER_TEXT[c.kind]} ${v.ok ? oddsLine(v) : ""}</p>
          <details class="cq-more"><summary>Risk and reward</summary>${oddsPanel(v)}</details>
          <div class="cq-btnrow">
            ${action("Send her (her master has her)", send, () => void ui.cmd({ k: "ship", act: "charter", id: b.id, key: c.key, arg: 0 }), "small primary")}
            ${here
              ? action("Sail in her yourself", sail, () => void ui.cmd({ k: "ship", act: "charter", id: b.id, key: c.key, arg: 1 }), "small", "You command her, and go where she goes.", false)
              : nothing}
          </div>
        </li>`;
      })}
    </ul>
    ${venturePart(ui, owner, b)} ${sendPart(ui, owner, b)}
  </details>`;
}

/** Ports with a market she can reach, nearest first (for a venture). */
function marketsFrom(ui: GameUi, b: Boat): number[] {
  const out: [number, number][] = [];
  for (const [q, km] of ui.map.provinces[b.prov].sea as [number, number][])
    if (q !== b.prov && km <= BOATS[b.kind].reach && hasMarket(ui.s, ui.w, q)) out.push([q, km]);
  return out.sort((a, z) => a[1] - z[1]).slice(0, 24).map((x) => x[0]);
}

/** A venture of your own: a good bought here, sold there. */
function venturePart(ui: GameUi, owner: Life, b: Boat): TemplateResult | typeof nothing {
  const s = ui.s;
  if (owner.prov !== b.prov || owner.travel) return nothing;
  const goods = GOODS.filter((g) => soldHere(s, ui.w, b.prov, g));
  const ports = marketsFrom(ui, b);
  if (!goods.length || !ports.length) return nothing;
  const good = pick(`vg:${b.id}`, goods[0]) as string;
  const to = pick(`vt:${b.id}`, ports[0]) as number;
  const loads = Math.min(BOATS[b.kind].loads, pick(`vl:${b.id}`, Math.min(20, BOATS[b.kind].loads)) as number);
  const c = ventureCharter(s, ui.w, b, good, to, loads);
  const cost = c ? ventureCost(s, ui.w, owner, c) : 0;
  const sale = c ? ventureSale(s, ui.w, owner, c) : 0;
  const check = c ? charterCheck(s, ui.w, owner, b, c, false) : { ok: false as const, why: "She can't reach it" };
  const step = (d: number) => setPick(ui, `vl:${b.id}`, Math.max(1, Math.min(BOATS[b.kind].loads, loads + d)));
  return html`<div class="cq-ship-venture">
    <p class="cq-ship-sub">A venture of your own</p>
    <div class="cq-btnrow">
      <select class="cq-select small" aria-label="Good" @change=${(e: Event) => setPick(ui, `vg:${b.id}`, (e.target as HTMLSelectElement).value)}>
        ${goods.map((g) => html`<option value=${g} ?selected=${g === good}>${g}</option>`)}
      </select>
      <span class="cq-ship-pay">
        <button class="cq-btn tiny quiet" aria-label="Fewer loads" @click=${() => step(-5)}>−</button>
        <span class="cq-ship-loads">${loads} loads</span>
        <button class="cq-btn tiny quiet" aria-label="More loads" @click=${() => step(5)}>+</button>
      </span>
      <span class="small">for</span>
      <select class="cq-select small" aria-label="To" @change=${(e: Event) => setPick(ui, `vt:${b.id}`, Number((e.target as HTMLSelectElement).value))}>
        ${ports.map((q) => html`<option value=${q} ?selected=${q === to}>${ui.map.provinces[q].name}</option>`)}
      </select>
    </div>
    <p class="small">
      ${c
        ? html`Costs ${coins(cost)} here; about ${coins(sale)} there at today's prices
            (${sale >= cost ? "+" : "−"}${coins(Math.abs(sale - cost))}, if she isn't lost and prices hold).`
        : "She can't reach that port."}
    </p>
    <div class="cq-btnrow">
      ${action(
        html`Load and send her${price(cost, { have: owner.purse })}`,
        check,
        () => void ui.cmd({ k: "ship", act: "venture", id: b.id, key: good, to, pay: loads, arg: 0 }),
        "small",
      )}
      ${action(
        html`Load and sail in her${price(cost, { have: owner.purse })}`,
        c ? charterCheck(s, ui.w, owner, b, c, true) : check,
        () => void ui.cmd({ k: "ship", act: "venture", id: b.id, key: good, to, pay: loads, arg: 1 }),
        "small quiet",
        undefined,
        false,
      )}
    </div>
  </div>`;
}

/** Send her to a port with no charter, under her own master. */
function sendPart(ui: GameUi, owner: Life, b: Boat): TemplateResult {
  const ports: number[] = [];
  for (const [q, km] of ui.map.provinces[b.prov].sea as [number, number][])
    if (q !== b.prov && km <= BOATS[b.kind].reach * 2 && hasPlace(ui.s, ui.w, q, "docks")) ports.push(q);
  const near = ports.slice(0, 30);
  if (!near.length) return html``;
  const to = pick(`st:${b.id}`, near[0]) as number;
  const ok = !!boatRoute(ui.map, b.prov, to, b.kind);
  return html`<div class="cq-btnrow cq-ship-send">
    <span class="small">Send her to</span>
    <select class="cq-select small" aria-label="Where" @change=${(e: Event) => setPick(ui, `st:${b.id}`, Number((e.target as HTMLSelectElement).value))}>
      ${near.map((q) => html`<option value=${q} ?selected=${q === to}>${ui.map.provinces[q].name}</option>`)}
    </select>
    ${action(
      "Send her",
      ok ? { ok: true } : { ok: false, why: "Out of her reach" },
      () => void ui.cmd({ k: "ship", act: "send", id: b.id, to }),
      "small quiet",
      "Under her own master, with no charter (to where the charters are, or home).",
    )}
  </div>`;
}

/** Her refits, and careening her on a beach. */
function refitPart(ui: GameUi, owner: Life, b: Boat): TemplateResult | typeof nothing {
  const s = ui.s;
  const here = alongsideShip(owner, b);
  if (!here && !(b.refits ?? []).length) return nothing;
  const careen = careenCheck(s, owner, b);
  return html`<details class="cq-more cq-ship-refits">
    <summary>
      Refits
      <span class="cq-muted small">${(b.refits ?? []).map((k) => REFITS[k].name.toLowerCase()).join(", ") || "none"}</span>
    </summary>
    <ul class="cq-ship-roster">
      ${REFIT_KEYS.map((k) => {
        const def = REFITS[k];
        if (def.kinds && !def.kinds.includes(b.kind)) return nothing;
        const done = (b.refits ?? []).includes(k);
        const check = refitCheck(s, ui.w, owner, b, k);
        return html`<li>
          <span class="cq-ship-who"><b>${def.name}</b><small>${def.text}</small></span>
          ${done
            ? html`<span class="cq-chip good">done</span>`
            : here
              ? action(html`Refit${price(refitCost(b, k), { have: owner.purse })}`, check, () => void ui.cmd({ k: "ship", act: "refit", id: b.id, key: k }), "small")
              : nothing}
        </li>`;
      })}
    </ul>
    ${b.moor === "beach" && here
      ? html`<div class="cq-btnrow">
          ${action(html`Careen her on the beach${price(careenCost(b), { have: owner.purse })}`, careen, () => void ui.cmd({ k: "ship", act: "careen", id: b.id }), "small", "Hove down on the strand, scraped and payed: no yard, so not as good as one (85% at best).")}
        </div>`
      : nothing}
  </details>`;
}

/** Her log, her name on the waterfront, her voyages. */
function logPart(ui: GameUi, b: Boat): TemplateResult | typeof nothing {
  const log = b.log ?? [];
  const rep = repOf(b);
  return html`<details class="cq-more cq-ship-log">
    <summary>
      Her log and her name
      <span class="cq-muted small">${b.voyages ?? 0} voyage${(b.voyages ?? 0) === 1 ? "" : "s"}; ${repWords(rep)}</span>
    </summary>
    <p class="small">Her name ${bar(rep / 100)} ${rep}: delivered in time it rises, late or given up it falls. A good name pays more (×${r1(0.85 + rep / 333)}) and brings people looking for a berth.</p>
    ${log.length
      ? html`<ol class="cq-ship-logbook">
          ${[...log].reverse().slice(0, 20).map((l) => html`<li><span class="cq-muted small">${formatDate(l.day)}</span> ${l.text}</li>`)}
        </ol>`
      : html`<p class="small cq-muted">Nothing in it yet.</p>`}
  </details>`;
}

// ---------------------------------------------------------------- where she lies

/** "Beached below Kingstown" / "at anchor off ..." for a boat's card. */
export function moorWords(ui: GameUi, b: Boat): string {
  if (b.way) return `at sea, bound for ${ui.map.provinces[b.way.dest]?.name}`;
  const at = ui.map.provinces[shipProv(b)]?.name ?? "";
  return b.moor === "beach" ? `beached at ${at}` : b.moor === "anchor" ? `at anchor off ${at}` : "";
}

// ---------------------------------------------------------------- on the road

/** Aboard someone's ship, or with a party: where you're bound, and getting off at the next stop. */
export function aboardCallout(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  const t = life?.travel;
  const w = t?.with;
  if (!life || !t || !w) return nothing;
  const lead = lifeOfSeat(s, w.seat);
  const b = lead && w.boat !== undefined ? boatOf(lead, w.boat) : undefined;
  const next = t.path[0];
  const who = b
    ? html`Aboard the <b>${b.name}</b>${lead && lead.seat !== life.seat ? html` (${charName(meOf(s, lead))}'s)` : nothing}`
    : html`Travelling with <b>${charName(lead ? meOf(s, lead) : undefined)}</b>`;
  const owner = lead && b ? lead : undefined;
  const stop = owner && b ? nextStop(owner, b) : undefined;
  return html`<div class="cq-callout road cq-aboard">
    <p>
      ${who}, bound for <b>${ui.map.provinces[t.dest]?.name}</b>. Next:
      ${ui.map.provinces[next]?.name}${t.sea[0] ? " (by sea)" : ""}, on ${formatDate(t.arrive)}.
    </p>
    <div class="cq-btnrow">
      ${t.path.length > 1
        ? html`<button class="cq-btn small" @click=${() => ui.cmd({ k: "party", act: "alight" })}>
            Get off at ${ui.map.provinces[next]?.name}
          </button>`
        : nothing}
      ${owner && b && stop !== undefined && canCommand(s, life, owner, b)
        ? action(
            `Lie over at ${ui.map.provinces[stop]?.name}`,
            { ok: true },
            () => void ui.cmd({ k: "ship", act: "stay", id: b.id }),
            "small",
            `Her commander's choice: stop there as long as you like; the voyage goes on if she sails within ${STAY_DAYS} days.`,
          )
        : nothing}
    </div>
  </div>`;
}

/** Sailing your own boat: lie over at the next port on the way. */
export function captainLine(ui: GameUi): TemplateResult | typeof nothing {
  const life = ui.life;
  const t = life?.travel;
  if (!life || !t || t.boat === undefined || t.path.length < 2) return nothing;
  const b = boatOf(life, t.boat);
  if (!b) return nothing;
  return html`${action(
    `Lie over at ${ui.map.provinces[t.path[0]]?.name}`,
    { ok: true },
    () => void ui.cmd({ k: "ship", act: "stay", id: b.id }),
    "small",
    `Stop there as long as you like: the voyage to ${ui.map.provinces[t.dest]?.name} goes on if she sails within ${STAY_DAYS} days of coming in.`,
  )}`;
}

/** A ship lying over on her voyage where you are: sail on. */
export function stayCallout(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  if (!life || life.travel) return nothing;
  const out: TemplateResult[] = [];
  for (const l of s.lives)
    for (const b of l.boats ?? []) {
      if (!b.stay || b.stay.since < 0 || b.prov !== life.prov) continue;
      if (!canCommand(s, life, l, b)) continue;
      const left = STAY_DAYS - (s.day - b.stay.since);
      out.push(html`<div class="cq-callout cq-aboard">
        <p>
          The <b>${b.name}</b> lies over here on her way to
          <b>${ui.map.provinces[b.stay.dest]?.name}</b>: ${left} day${left === 1 ? "" : "s"} more and the voyage is over.
        </p>
        ${action(`Sail on for ${ui.map.provinces[b.stay.dest]?.name}`, { ok: true }, () => void ui.cmd({ k: "ship", act: "resume", id: b.id }), "small primary")}
      </div>`);
    }
  return out.length ? html`${out}` : nothing;
}

// ---------------------------------------------------------------- travelling together

/** Who you travel with, and asking the players in town. */
export function partyStrip(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  if (!life || life.c < 0 || life.watching) return nothing;
  const lead = partyLead(s, life);
  const members = partyMembers(s, life);
  const here = life.travel
    ? []
    : s.lives.filter((l) => l.seat !== life.seat && l.c >= 0 && !l.watching && !l.travel && l.prov === life.prov);
  const offers = here.filter((l) => l.party?.lead !== life.seat && life.party?.lead !== l.seat);
  if (!lead && !members.length && !offers.length) return nothing;
  return html`<div class="cq-party">
    ${lead
      ? html`<p class="small">
          You travel with <b>${charName(meOf(s, lead))}</b>: where they set out for from where you both are, you go too.
          <button class="cq-btn tiny quiet" @click=${() => ui.cmd({ k: "party", act: "leave" })}>Go your own way</button>
        </p>`
      : nothing}
    ${members.length
      ? html`<p class="small">
          With you: ${members.map(
            (m) => html`<b>${charName(meOf(s, m))}</b>
              <button class="cq-btn tiny quiet" @click=${() => ui.cmd({ k: "party", act: "part", seat: m.seat })}>Part company</button> `,
          )}
        </p>`
      : nothing}
    ${offers.length
      ? html`<div class="cq-btnrow small">
          ${offers.map((l) => {
            const name = meOf(s, l)?.first ?? l.name;
            const ask = partyCheck(s, life, l, false);
            const invite = partyCheck(s, life, l, true);
            return html`${action(`Travel with ${name}`, ask, () => void ui.cmd({ k: "party", act: "ask", seat: l.seat }), "small quiet", "They're asked: if they agree, you go where they go.", false)}
            ${action(`Ask ${name} along`, invite, () => void ui.cmd({ k: "party", act: "invite", seat: l.seat }), "small quiet", "They're asked: if they agree, they go where you go.", false)}`;
          })}
        </div>`
      : nothing}
  </div>`;
}

// ---------------------------------------------------------------- your place aboard

/** On Work › Your work: a place in a player's ship's company. */
export function berthLine(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  const bb = life?.job?.berth;
  if (!life || !bb || bb.kind !== "ship") return nothing;
  const owner = lifeOfSeat(s, bb.seat);
  const b = owner ? boatOf(owner, bb.id) : undefined;
  if (!owner || !b) return nothing;
  const h = hiresAboard(b).find((x) => x.seat === life.seat);
  const role = h ? roleOf(SHIP_LADDER, h.role) : undefined;
  const at = shipProv(b);
  const withHer = h ? hireWithHer(s, owner, b, h) : false;
  return html`<div class="cq-callout cq-berth">
    <p>
      <b>${bb.title}</b>, ${BOATS[b.kind].name.toLowerCase()} of ${berthsOf(b)} berths, ${charName(meOf(s, owner))}'s.
      ${b.way ? html`At sea, bound for ${provLink(ui, b.way.dest)}.` : html`She lies at ${provLink(ui, at)}.`}
      ${price(bb.pay, { gain: true, per: "month" })} from her owner, by the days you're at your post
      (${withHer ? "you're with her" : "you're not with her: go to where she lies"}).
    </p>
    ${role ? html`<p class="small cq-muted">${role.text} Her owner sets your role and pay, and promotes you when he likes. Leave whenever you like: "Hand in your notice" below.</p>` : nothing}
  </div>`;
}

// ---------------------------------------------------------------- a shore with no port

/** On the road there: where there's no port, how you'd take ship from here. */
export function strandLine(ui: GameUi): TemplateResult | typeof nothing {
  const life = ui.life;
  if (!life || life.travel) return nothing;
  const e = strandEmbark(ui.s, ui.map, life);
  if (!e) return nothing;
  return html`<p class="small cq-muted cq-strand">
    No port here: ${e.wait ? `you'd hail a passing coaster (about ${e.wait} days' wait, counted in the days by sea)` : `${e.why}; you can go back aboard her`}.
    ${life.lying && life.lying.until > ui.s.day ? html` She sails on ${formatDate(life.lying.until)}.` : nothing}
  </p>`;
}

export { menWithHer };
