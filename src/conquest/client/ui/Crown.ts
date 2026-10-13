// CROWN (r18): the crowns' regiments and a petition for an expedition, on
// the page. Society › Standing and Society › Council: the towns your colony
// claims, and a petition to the crown to take one back (its odds before you
// begin, and as it goes: letters, friends at court, the colony's offer),
// the expedition when it sails and lands, and riding with it. For players
// who don't govern: asking the governor for it, paying into the colony's
// share, writing to court, riding with it. The World page and a nation's
// page: what each crown has sent, its garrisons, and the expeditions abroad.
// Every figure comes from engine/CrownCore.ts, the reckoning the engine
// rolls from.

import { html, nothing, TemplateResult } from "lit";
import { dateOf, formatDate } from "../../engine/Calendar";
import {
  askGovCheck,
  askOf,
  beginCheck,
  claimedTowns,
  courtCheck,
  crownMen,
  crownOf,
  EXPEDITION,
  expeditionOdds,
  expeditionSize,
  FORTS,
  garrisonArmy,
  helpable,
  lastAsk,
  lettersCheck,
  meansOf,
  OFFER,
  offerCheck,
  offerOdds,
  paidIn,
  pledgeCheck,
  regimentsWords,
  rideCheck,
  skillOdds,
  squadronGuns,
  writeCheck,
} from "../../engine/CrownCore";
import { lifeIsNative } from "../../engine/LifeQueries";
import { chanceWords } from "../../engine/Odds";
import { armyMen, charName } from "../../engine/Queries";
import type { Breakdown, CrownAsk } from "../../engine/Types";
import { nationName } from "../Text";
import { num } from "../Tip";
import {
  action,
  breakdownTip,
  charLink,
  GameUi,
  more,
  nationLink,
  odds,
  provLink,
  section,
} from "./Context";
import { price } from "./Price";
import { term } from "./Terms";

const pct = (p: number) => `${Math.round(p * 100)}%`;
const hundred = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.round(Math.abs(v) * 100)}`;
const town = (ui: GameUi, p: number) => ui.map.provinces[p]?.name ?? "the town";
const nameOf = (ui: GameUi, n: number) =>
  nationName(ui.s.nations[n]?.name ?? "someone");

/** A chance as words, with the reckoning behind it on hover. */
function chanceTip(title: string, b: Breakdown): TemplateResult {
  return num(
    chanceWords(b.total),
    () =>
      breakdownTip(title, b, (v) => `${hundred(v)} in 100`, [
        `In all: ${pct(b.total)}.`,
      ]),
    "cq-crown-chance",
  );
}

/** The colony's offer as it stands, in words. */
function offerWords(a: CrownAsk): string {
  const parts: string[] = [];
  if (a.men) parts.push(`${a.men} regiment${a.men === 1 ? "" : "s"} raised`);
  if (a.gold) parts.push(`${a.gold} gold from the treasury`);
  const paid = paidIn(a);
  if (paid) parts.push(`${paid} coins paid in`);
  return parts.length ? parts.join(", ") : "nothing yet";
}

const STAGE: Record<CrownAsk["stage"], string> = {
  gathering: "gathering support",
  sent: "before the crown",
  granted: "at sea",
  landed: "in the field",
  won: "taken back",
  failed: "failed",
  refused: "refused",
  dropped: "let drop",
};

// ---------------------------------------------------------------- the odds panel

/** A petition's odds: granted (what it would bring) or refused, and what makes the chance. */
function oddsPanel(
  ui: GameUi,
  n: number,
  p: number,
  o: Breakdown,
  a: CrownAsk | null,
): TemplateResult {
  const s = ui.s;
  const size = expeditionSize(s, ui.map, n, p);
  const guns = size.guns + squadronGuns(size.ships);
  const adj = s.nations[n]?.adjective ?? "";
  const pr = o.total;
  return html`<div class="cq-odds-panel cq-crown-odds">
    <p class="cq-odds-head">
      <b
        >${a ? "As it stands" : "If you begin"}: the crown's answer
        ${a
          ? `about ${formatDate(a.answer)}`
          : `in about ${Math.round((EXPEDITION.gather + EXPEDITION.voyage) / 30)} months`}</b
      >
    </p>
    <ul class="cq-odds-rows">
      <li>
        <span class="cq-odds-chance" title=${pct(pr)}>${chanceWords(pr)}</span>
        <span class="cq-odds-what"
          >Granted:
          ${regimentsWords(adj, size.regs, guns)}${size.ships
            ? html`, <small>a squadron of ${size.ships} ships</small>`
            : nothing}
          sail to take back ${town(ui, p)}
          <span class="cq-odds-bar"
            ><span style="width:${Math.round(pr * 100)}%"></span></span
        ></span>
        <span class="cq-odds-amt"
          >taken: renown +${EXPEDITION.wonRenown}, favour
          +${EXPEDITION.wonFavour}</span
        >
      </li>
      <li class="bad">
        <span class="cq-odds-chance" title=${pct(1 - pr)}
          >${chanceWords(1 - pr)}</span
        >
        <span class="cq-odds-what"
          >Refused
          <span class="cq-odds-bar"
            ><span style="width:${Math.round((1 - pr) * 100)}%"></span></span
        ></span>
        <span class="cq-odds-amt"
          >favour ${EXPEDITION.refusedFavour} (+${EXPEDITION.modestFavour} if
          modest)</span
        >
      </li>
    </ul>
    <details class="cq-more">
      <summary>What makes the chance (${pct(pr)})</summary>
      <ul class="cq-odds-factors">
        ${o.parts.map(
          (x) => html`<li>${x.label}: <b>${hundred(x.value)}</b> in 100</li>`,
        )}
      </ul>
    </details>
    <p class="cq-muted small">
      Each regiment the colony raises adds ${Math.round(EXPEDITION.men * 100)}
      in 100 (up to ${Math.round(EXPEDITION.menMax * 100)}), each 25 gold or
      coins paid in 1 (up to ${Math.round(EXPEDITION.goldMax * 100)}); a
      councillor's letter ${Math.round(EXPEDITION.council * 100)}, a member's
      ${Math.round(EXPEDITION.house * 100)}, a friend at court
      ${Math.round(EXPEDITION.court * 100)}. If the expedition fails, favour
      ${EXPEDITION.failedFavour} and the claim is halved.
    </p>
  </div>`;
}

// ---------------------------------------------------------------- Society › Standing, Society › Council

/** An expedition to take back a town: the petition, the expedition, riding with it. */
export function crownSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  if (!life || !me || lifeIsNative(s, life)) return nothing;
  const n = me.nation;
  if (!meansOf(s, n)) return nothing;
  const a = askOf(s, n);
  const towns = claimedTowns(s, n);
  const last = lastAsk(s, n);
  if (!a && !towns.length && !last) return nothing;
  const governs = s.nations[n].ruler === me.id;
  const head = html`${term("expedition", "An expedition to take back a town")}`;
  let body: TemplateResult;
  if (a && (a.stage === "granted" || a.stage === "landed"))
    body = expeditionPanel(ui, a);
  else if (a && governs) body = myAsk(ui, a);
  else if (a) body = theirAsk(ui, a);
  else body = governs ? beginList(ui, towns) : askList(ui, towns);
  return section(
    head,
    html`${body}
    ${last && !a
      ? html`<p class="cq-muted small">
          The last, for ${town(ui, last.p)}: ${STAGE[last.stage]}
          (${formatDate(last.ended ?? last.answer)}${last.why
            ? `, ${last.why.toLowerCase()}`
            : ""}).
        </p>`
      : nothing}`,
  );
}

/** The governor: the towns he could petition for, each with its odds and the button. */
function beginList(
  ui: GameUi,
  towns: ReturnType<typeof claimedTowns>,
): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const n = me.nation;
  if (!towns.length)
    return html`<p class="cq-muted small">
      Your colony claims no town another holds.
    </p>`;
  return html`<p class="small">
      You govern: you can petition the crown for an expedition to take back a
      town your colony lost. It gathers support for
      ${Math.round(EXPEDITION.gather / 30)} months, then sails; the answer comes
      ${Math.round(EXPEDITION.voyage / 30)} months later. One at a time.
    </p>
    <ul class="cq-crown-towns">
      ${towns.map((t) => {
        const o = expeditionOdds(s, ui.map, n, t.p, null, me.id);
        const check = beginCheck(s, life, t.p);
        return html`<li>
          <div class="cq-crown-town">
            <b>${provLink(ui, t.p)}</b>
            <span class="cq-muted small"
              >held by ${nameOf(ui, t.holder)}; claim ${Math.round(t.claim)};
              granted
              ${chanceTip(
                `Would the crown send an expedition for ${town(ui, t.p)}?`,
                o,
              )}
              as it stands</span
            >
          </div>
          <div class="cq-btnrow">
            ${action(
              html`Petition the
              crown${price(EXPEDITION.fee, { have: life.purse })}${price(
                EXPEDITION.retainer,
                { per: "month" },
              )}`,
              check,
              () => void ui.cmd({ k: "crown", act: "begin", p: t.p }),
              "small primary",
            )}
          </div>
        </li>`;
      })}
    </ul>
    ${more(
      `The odds for ${town(ui, towns[0].p)}, if you begin`,
      oddsPanel(
        ui,
        n,
        towns[0].p,
        expeditionOdds(s, ui.map, n, towns[0].p, null, me.id),
        null,
      ),
    )}`;
}

/** Someone who doesn't govern: ask the governor for one. */
function askList(
  ui: GameUi,
  towns: ReturnType<typeof claimedTowns>,
): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const gov = s.chars[s.nations[me.nation].ruler];
  if (!towns.length)
    return html`<p class="cq-muted small">
      Your colony claims no town another holds.
    </p>`;
  return html`<p class="small">
      Only the governor petitions the crown for an expedition. You can ask
      ${charLink(ui, gov, false)} to; then pay into the colony's share, write to
      court for it, and ride with it when it lands.
    </p>
    <ul class="cq-crown-towns">
      ${towns.map((t) => {
        const o = expeditionOdds(
          s,
          ui.map,
          me.nation,
          t.p,
          null,
          gov?.id ?? -1,
        );
        return html`<li>
          <div class="cq-crown-town">
            <b>${provLink(ui, t.p)}</b>
            <span class="cq-muted small"
              >held by ${nameOf(ui, t.holder)}; claim ${Math.round(t.claim)};
              the crown would grant it
              ${chanceTip(
                `Would the crown send an expedition for ${town(ui, t.p)}?`,
                o,
              )}</span
            >
          </div>
          <div class="cq-btnrow">
            ${action(
              "Ask the governor to petition",
              askGovCheck(s, life, t.p),
              () => void ui.cmd({ k: "crown", act: "ask", p: t.p }),
              "small",
              "A letter to the governor: he weighs it (the computer's sooner, and at shorter odds).",
            )}
          </div>
        </li>`;
      })}
    </ul>`;
}

/** The colony's offer, drafted before the house divides. */
const draft = { men: 1, gold: 50 };

/** The governor's own petition, as it goes. */
function myAsk(ui: GameUi, a: CrownAsk): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const o = expeditionOdds(s, ui.map, a.n, a.p, a, me.id);
  // Only what the treasury holds (the first offer, 50, may be more).
  const golds = [0, 25, 50, 100, 150, 200, 300].filter(
    (k) => k <= Math.max(0, s.nations[a.n].gold),
  );
  if (!golds.includes(draft.gold)) draft.gold = golds[golds.length - 1];
  const house = offerOdds(s, a.n, a.p, draft.men, draft.gold);
  const offerOk = offerCheck(s, life, draft.men, draft.gold);
  return html`<div class="cq-crown-mine">
      <p class="small">
        Your petition to take back <b>${provLink(ui, a.p)}</b> from
        ${nameOf(ui, a.holder)} is ${STAGE[a.stage]}:
        ${a.stage === "gathering"
          ? html`it sails on <b>${formatDate(a.sails)}</b>`
          : html`the answer comes about <b>${formatDate(a.answer)}</b>`}.
        Letters: ${a.council.length} from the council, ${a.house.length} from
        the house; friends at court ${a.court} of ${EXPEDITION.maxCourt}. The
        colony offers ${offerWords(a)}.
      </p>
    </div>
    ${oddsPanel(ui, a.n, a.p, o, a)}
    ${a.stage === "gathering"
      ? html`<div class="cq-btnrow">
            ${action(
              html`Ask the council and the house for
              letters${odds(
                skillOdds(s, life, "persuasion", EXPEDITION.lettersDc),
              )}`,
              lettersCheck(s, life),
              () => void ui.cmd({ k: "crown", act: "letters" }),
              "small",
              "Persuasion: two letters if it goes well, one if not.",
            )}
            ${action(
              html`Write to friends at
              court${price(EXPEDITION.postage, { have: life.purse })}${odds(
                skillOdds(s, life, "letters", EXPEDITION.courtDc),
              )}`,
              courtCheck(s, life),
              () => void ui.cmd({ k: "crown", act: "court" }),
              "small",
              "Letters: a friend who'll speak for it before the ministers.",
            )}
            ${action(
              html`Pay in yourself${price(10, { have: life.purse })}`,
              pledgeCheck(s, life, 10),
              () => void ui.cmd({ k: "crown", act: "pledge", coins: 10 }),
              "small",
            )}
          </div>
          <div class="cq-crown-offer">
            <p class="cq-h4">The colony's offer, put to the house</p>
            <label class="small"
              >Regiments raised
              <select
                @change=${(e: Event) => {
                  draft.men = Number((e.target as HTMLSelectElement).value);
                  ui.redraw();
                }}
              >
                ${[0, 1, 2, 3, 4].map(
                  (k) =>
                    html`<option value=${k} ?selected=${k === draft.men}>
                      ${k}
                    </option>`,
                )}
              </select></label
            >
            <label class="small"
              >Gold from the treasury
              <select
                @change=${(e: Event) => {
                  draft.gold = Number((e.target as HTMLSelectElement).value);
                  ui.redraw();
                }}
              >
                ${golds.map(
                  (k) =>
                    html`<option value=${k} ?selected=${k === draft.gold}>
                      ${k}
                    </option>`,
                )}
              </select></label
            >
            <span class="small"
              >The house would vote it
              ${chanceTip(
                "Would the house vote the colony's offer?",
                house,
              )}</span
            >
            <div class="cq-btnrow">
              ${action(
                "Put it to the house",
                offerOk,
                () =>
                  void ui.cmd({
                    k: "crown",
                    act: "offer",
                    men: draft.men,
                    gold: draft.gold,
                  }),
                "small",
                `Carried, the colony raises the men and pays the gold when the expedition sails. Turned down, the house won't hear it again for ${OFFER.again} days.`,
              )}
              ${action(
                "Let it drop",
                { ok: true },
                () =>
                  confirm(
                    "Let the petition drop? Your agent keeps his fee; what others paid in is handed back.",
                  ) && void ui.cmd({ k: "crown", act: "drop" }),
                "small quiet",
              )}
            </div>
          </div>`
      : nothing}`;
}

/** Someone else's petition (the governor's), and what you can do for it. */
function theirAsk(ui: GameUi, a: CrownAsk): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const o = expeditionOdds(s, ui.map, a.n, a.p, a, a.by);
  const mine = a.paid[life.seat] ?? 0;
  return html`<p class="small">
      ${charLink(ui, s.chars[a.by], false)} has petitioned the crown for an
      expedition to take back <b>${provLink(ui, a.p)}</b> from
      ${nameOf(ui, a.holder)}: ${STAGE[a.stage]},
      ${a.stage === "gathering"
        ? `sailing on ${formatDate(a.sails)}`
        : `the answer about ${formatDate(a.answer)}`}.
      The colony offers
      ${offerWords(a)}${mine ? ` (${mine} of them yours)` : ""}. As it stands it
      would be granted ${chanceTip(`Would the crown grant it?`, o)}.
    </p>
    ${a.stage === "gathering"
      ? html`<div class="cq-btnrow">
          ${action(
            html`Pay into the colony's share${price(10, { have: life.purse })}`,
            pledgeCheck(s, life, 10),
            () => void ui.cmd({ k: "crown", act: "pledge", coins: 10 }),
            "small",
            "Handed back if it never sails.",
          )}
          ${action(
            html`Pay in${price(25, { have: life.purse })}`,
            pledgeCheck(s, life, 25),
            () => void ui.cmd({ k: "crown", act: "pledge", coins: 25 }),
            "small",
          )}
          ${action(
            html`Write to friends at
            court${price(EXPEDITION.postage, { have: life.purse })}${odds(
              skillOdds(s, life, "letters", EXPEDITION.courtDc),
            )}`,
            courtCheck(s, life),
            () => void ui.cmd({ k: "crown", act: "court" }),
            "small",
          )}
          ${writeCheck(s, life).ok
            ? action(
                "Put your own letter to it",
                writeCheck(s, life),
                () => void ui.cmd({ k: "crown", act: "write" }),
                "small",
                "A councillor's or a member's letter.",
              )
            : nothing}
        </div>`
      : nothing}`;
}

/** The expedition at sea, or in the field: where it is, who leads it, riding with it. */
function expeditionPanel(ui: GameUi, a: CrownAsk): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const N = s.nations[a.n];
  const army = s.armies.find((x) => x.id === a.army);
  const riding = a.riders.includes(life.seat);
  const commands = army?.commander === me.id;
  const ride = rideCheck(s, life);
  return html`<div class="cq-crown-mine">
    <p class="small">
      The crown's expedition to take back <b>${provLink(ui, a.p)}</b> from
      ${nameOf(ui, a.holder)}:
      ${regimentsWords(N.adjective, a.regs ?? 0, a.guns ?? 0)}${a.ships
        ? `, with a squadron of ${a.ships} ships`
        : ""}${a.men ? `, and ${a.men} of the colony's own` : ""}.
      ${a.stage === "granted"
        ? html`At sea: it lands about <b>${formatDate(a.lands ?? s.day)}</b>.`
        : army
          ? html`In the field at ${provLink(ui, army.prov)}:
              ${Math.round(armyMen(army))} men under
              ${commands
                ? "you"
                : charLink(ui, s.chars[army.commander], false)}${s.provinces[
                a.p
              ].occupier === a.n
                ? html`; <b class="good">${town(ui, a.p)} is held</b>, waiting
                    on the peace`
                : html`; it gives up about ${formatDate(a.until ?? s.day)} if
                  the town isn't taken`}.
              <button
                class="cq-link"
                @click=${() => ui.open({ k: "army", id: army.id })}
              >
                See the army
              </button>`
          : nothing}
      ${riding ? html`<b>You ride with it.</b>` : nothing}
    </p>
    <div class="cq-btnrow">
      ${riding
        ? action(
            "Leave the expedition",
            { ok: true },
            () => void ui.cmd({ k: "crown", act: "leave" }),
            "small quiet",
          )
        : commands
          ? nothing
          : action(
              "Ride with it",
              ride,
              () => void ui.cmd({ k: "crown", act: "ride" }),
              "small primary",
              `Your character goes with its army. Taken back: renown +${EXPEDITION.riderRenown}.`,
            )}
    </div>
  </div>`;
}

// ---------------------------------------------------------------- the World page, a nation's page

/** What one crown has sent its colony, in a line. */
function sentLine(ui: GameUi, n: number): TemplateResult | typeof nothing {
  const s = ui.s;
  const st = crownOf(s);
  const rec = st.sent[n];
  const atSea = st.sailing.filter((x) => x.n === n && x.why !== "fort");
  const forts = Object.values(st.forts).filter(
    (f) => f.n === n && garrisonArmy(s, f.p),
  );
  const war = crownMen(s, n, "war");
  if (!rec?.total && !atSea.length && !forts.length && !war) return nothing;
  const garrison = forts.map((f) => {
    const a = garrisonArmy(s, f.p)!;
    return html`${provLink(ui, f.p)}
      <span class="cq-muted">(${Math.round(armyMen(a))})</span>`;
  });
  return html`<li>
    ${nationLink(ui, n)}
    <span class="cq-muted small">
      ${war
        ? `${war} of the crown's men in the field`
        : "none of the crown's men in the field"}${rec?.war
        ? `; ${rec.war} regiment${rec.war === 1 ? "" : "s"} landed in this war`
        : ""}${rec?.last
        ? html`; the last ${rec.last.regs} at ${provLink(ui, rec.last.p)},
          ${formatDate(rec.last.day)}`
        : nothing}${atSea.length
        ? `; ${atSea.reduce((m, x) => m + x.foot + x.guns, 0)} at sea, landing about ${formatDate(Math.min(...atSea.map((x) => x.arrive)))}`
        : ""};
      ${rec?.total ?? 0} in all, ${rec?.home ?? 0} gone
      home${rec?.gold
        ? `; their passage cost the colony ${Math.round(rec.gold)} gold`
        : ""}.
    </span>
    ${forts.length
      ? html`<span class="small cq-crown-forts"
          >${term("garrison", "Garrisons")}:
          ${garrison.map((x, i) => html`${i ? ", " : ""}${x}`)}</span
        >`
      : nothing}
  </li>`;
}

/** Public expeditions (at sea or in the field). */
function expeditionsAbroad(ui: GameUi, only?: number): TemplateResult[] {
  const s = ui.s;
  return crownOf(s)
    .asks.filter(
      (a) =>
        (a.stage === "granted" || a.stage === "landed") &&
        (only === undefined || a.n === only || a.holder === only),
    )
    .map(
      (a) =>
        html`<li>
          ${nationLink(ui, a.n)}
          <span class="cq-muted small"
            >sends an expedition to take back ${provLink(ui, a.p)} from
            ${nameOf(ui, a.holder)}:
            ${regimentsWords(
              s.nations[a.n].adjective,
              a.regs ?? 0,
              a.guns ?? 0,
            )}${a.ships ? `, ${a.ships} ships` : ""};
            ${a.stage === "granted"
              ? `landing about ${formatDate(a.lands ?? s.day)}`
              : "in the field"}</span
          >
        </li>`,
    );
}

/** The World page's war panel: what each crown has sent. */
export function crownWorldSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const lines = s.nations
    .filter((n) => n.kind === "power" && n.alive)
    .map((n) => sentLine(ui, n.id))
    .filter((x) => x !== nothing) as TemplateResult[];
  const abroad = expeditionsAbroad(ui);
  const past = crownOf(s)
    .past.filter((a) => a.stage === "won" || a.stage === "failed")
    .slice(-4)
    .reverse();
  if (!lines.length && !abroad.length && !past.length) return nothing;
  return section(
    html`${term("regiments", "Regiments from Europe")}`,
    html`${lines.length
      ? html`<ul class="cq-nations cq-crown-sent">
          ${lines}
        </ul>`
      : html`<p class="cq-muted small">No crown has men in America.</p>`}
    ${abroad.length
      ? html`<p class="cq-h4">Expeditions</p>
          <ul class="cq-nations">
            ${abroad}
          </ul>`
      : nothing}
    ${past.length
      ? html`<p class="cq-muted small">
          Lately:
          ${past.map(
            (a, i) =>
              html`${i ? "; " : ""}${nameOf(ui, a.n)}'s for ${town(ui, a.p)},
              ${a.stage === "won" ? "taken back" : "failed"}
              (${dateOf(a.ended ?? a.answer).year})`,
          )}.
        </p>`
      : nothing}`,
  );
}

/** A nation's page: what its crown has sent, and expeditions for or against it. */
export function nationCrown(
  ui: GameUi,
  n: number,
): TemplateResult | typeof nothing {
  const line = sentLine(ui, n);
  const abroad = expeditionsAbroad(ui, n);
  if (line === nothing && !abroad.length) return nothing;
  return section(
    "Regiments from Europe",
    html`<ul class="cq-nations cq-crown-sent">
      ${line}${abroad}
    </ul>`,
  );
}

/** The fortress ports, for the guide. */
export const FORT_NAMES = FORTS.map((f) => f.name);

/** Who governs, for a line about it. */
export const govName = (ui: GameUi, n: number) =>
  charName(ui.s.chars[ui.s.nations[n]?.ruler ?? -1]);

export { helpable };
