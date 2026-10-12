// POWER (r12): Society › Council. The governor's council chamber: the
// governor and eight seats (each with its colonial title, its holder, their
// party and their standing with the governor); what your own seat can do;
// the measures before the council; how to reach a seat; and, for a
// governor, the hand that appoints, dismisses, proclaims and answers the
// assembly. Below it the assembly: its speaker and its bills.

import { html, nothing, TemplateResult } from "lit";
import {
  BILL_KEYS,
  billCheck,
  BILLS,
  billTitle,
  division,
  governorLean,
} from "../../engine/Assembly";
import { formatDate, pollDay } from "../../engine/Calendar"; // FIXES (r15): pollDay
import {
  actionTargets,
  councilAdvice,
  factionOf,
  favourOf,
  MEASURES,
  mySeat,
  proclaimCheck,
  proclamationAdvice,
  PROCLAMATIONS,
  SEAT_ACTIONS,
  SEAT_SKILL,
  seatActionCheck,
  seatOdds,
  seatPool,
  seekSeatCheck,
  type SeatActionDef,
} from "../../engine/Council";
import {
  SEAT_PORTFOLIO,
  seatHolderId,
  seatsOf,
  seatTitle,
} from "../../engine/CouncilTitles";
import { isPlayed, lifeIsNative, skillLevel } from "../../engine/LifeQueries";
import { checkChance, SKILL_NAMES } from "../../engine/LifeRules";
import { giveUpWarning } from "../../engine/OneOffice";
import { charName, provincesOf } from "../../engine/Queries";
import type { CouncilSeat, Nation } from "../../engine/Types";
import { nationName } from "../Text";
import { num } from "../Tip";
import {
  action,
  bar,
  breakdownTip,
  charLink,
  GameUi,
  more,
  odds,
  section,
  token,
} from "./Context";
import { howTo, pageHead } from "./Nav";
import { price } from "./Price"; // LEDGER (r15)

/** What's picked in each select, kept between redraws. */
const picks: Record<string, number> = {};
const pickOf = (key: string, first: number) => picks[key] ?? first;
const setPick = (ui: GameUi, key: string) => (e: Event) => {
  picks[key] = Number((e.target as HTMLSelectElement).value);
  ui.redraw();
};

const shortName = (n: Nation) => nationName(n.name).replace(/^the /, "");

function chair(ui: GameUi, n: number, seat: CouncilSeat): TemplateResult {
  const s = ui.s;
  const nation = s.nations[n];
  const id = seatHolderId(s, n, seat);
  const c = s.chars[id];
  const mine = !!ui.me && id === ui.me.id;
  const fav = c?.alive ? favourOf(s, n, id) : 0;
  const party = c?.alive ? factionOf(s, n, id) : null;
  const disgraced =
    c?.alive && (s.power?.cabinets[n]?.scandal[id] ?? 0) > s.day;
  return html`<li
    class="cq-chair ${mine ? "mine" : ""} ${c?.alive ? "" : "empty"}"
    title=${SEAT_PORTFOLIO[seat]}
  >
    <div class="cq-chair-face">
      ${c?.alive
        ? token(ui, c, "small")
        : html`<span class="cq-chair-void" aria-hidden="true"></span>`}
    </div>
    <div class="cq-chair-body">
      <span class="cq-chair-title">${seatTitle(s, n, seat)}</span>
      ${c?.alive
        ? html`<span class="cq-chair-who"
            >${charLink(ui, c, false)}${mine
              ? html` <span class="cq-chip good">you</span>`
              : nothing}</span
          >`
        : html`<span class="cq-chair-who cq-muted">empty</span>`}
      ${c?.alive && nation.kind === "power" && seat === "speaker"
        ? html`<span class="cq-chair-meta"
            ><span class="cq-party house">chosen by the house</span></span
          >`
        : nothing}
      ${c?.alive && nation.kind === "power" && seat !== "speaker"
        ? html`<span class="cq-chair-meta">
            <span
              class="cq-party ${party}"
              title=${party === "court"
                ? "The court party: the governor's friends"
                : "The country party: the assembly's men, wary of the governor"}
              >${party}</span
            >
            ${num(
              `favour ${Math.round(fav)}`,
              () => ({
                title: "The governor's favour",
                notes: [
                  "Rises with votes for the governor's measures and a seat well used; falls with votes against, failures, scandal and the papers' attacks.",
                  "Below 15, a governor the computer plays may put them off the council.",
                ],
              }),
              `cq-fav ${fav < 25 ? "bad" : fav >= 60 ? "good" : ""}`,
            )}
            ${disgraced
              ? html`<span class="cq-chip bad">disgraced</span>`
              : nothing}
          </span>`
        : nothing}
    </div>
  </li>`;
}

function chamber(ui: GameUi, n: number): TemplateResult {
  const s = ui.s;
  const nation = s.nations[n];
  const gov = s.chars[nation.ruler];
  const seats = seatsOf(nation);
  const cab = s.power?.cabinets[n];
  const filled = seats.filter(
    (st) => s.chars[seatHolderId(s, n, st)]?.alive,
  ).length;
  // The speaker is the house's man, of neither party at the board.
  const partisans = seats.filter(
    (st) => st !== "speaker" && s.chars[seatHolderId(s, n, st)]?.alive,
  );
  const court = partisans.filter(
    (st) => factionOf(s, n, seatHolderId(s, n, st)) === "court",
  ).length;
  const country = partisans.length - court;
  return html`<div class="cq-chamber">
    <div class="cq-chamber-head">
      ${gov?.alive ? token(ui, gov, "xl") : nothing}
      <div>
        <p class="cq-kicker">
          ${nation.kind === "native"
            ? "The leader"
            : "His Excellency the governor"}
        </p>
        <p class="cq-chamber-gov">${charLink(ui, gov)}</p>
        <p class="cq-muted small">
          ${filled} of ${seats.length} seats
          filled${nation.kind === "power"
            ? html` · ${court} of the court party (the governor's friends),
              ${country} of the country party`
            : nothing}
          ${cab?.unpaid && cab.unpaid > s.day
            ? html` · <span class="cq-chip bad">salary withheld</span>`
            : nothing}
          ${cab?.prorogued && cab.prorogued > s.day
            ? html` · <span class="cq-chip bad">assembly prorogued</span>`
            : nothing}
        </p>
      </div>
    </div>
    <ul class="cq-chairs">
      ${seats.map((st) => chair(ui, n, st))}
    </ul>
  </div>`;
}

/** A seat's power as a row: what it does, whom, and the odds. */
function seatPowerRow(ui: GameUi, a: SeatActionDef): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const check = seatActionCheck(s, life, a.key);
  const targets = a.target !== "none" ? actionTargets(s, ui.map, life, a) : [];
  const key = `seat:${a.key}`;
  const pick = pickOf(key, targets[0]?.id ?? -1);
  const chance = a.check
    ? checkChance(skillLevel(s, life, a.check.skill), a.check.dc)
    : null;
  const ok =
    check.ok && (a.target === "none" || targets.length > 0)
      ? check
      : check.ok
        ? { ok: false as const, why: "Nobody (or nowhere) to do it to." }
        : check;
  return html`<li class="cq-pw">
    <div class="cq-pw-text">
      <b>${a.label}</b>${a.measure
        ? html` <span class="cq-chip gold">a measure: the council votes</span>`
        : nothing}
      <span class="small">${a.text}</span>
      ${a.check
        ? html`<span class="cq-muted small"
            >${SKILL_NAMES[a.check.skill]} ${odds(chance)}</span
          >`
        : nothing}
    </div>
    <div class="cq-pw-do">
      ${targets.length
        ? html`<select
            class="cq-office-pick"
            aria-label="Whom"
            @change=${setPick(ui, key)}
          >
            ${targets.map(
              (t) =>
                html`<option value=${t.id} ?selected=${t.id === pick}>
                  ${t.label}
                </option>`,
            )}
          </select>`
        : nothing}
      ${action(
        a.measure ? "Put it to the council" : "Do it",
        ok,
        () => void ui.cmd({ k: "power", act: "seat", key: a.key, c: pick }),
        "small primary",
      )}
    </div>
  </li>`;
}

function yourSeat(ui: GameUi, n: number, seat: CouncilSeat): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const fav = favourOf(s, n, life.c);
  const acts = SEAT_ACTIONS.filter((a) => a.seat === seat);
  const [sk] = SEAT_SKILL[seat];
  return section(
    html`Your seat: ${seatTitle(s, n, seat)}`,
    html`<p class="small">
        ${SEAT_PORTFOLIO[seat]} Your ${SKILL_NAMES[sk].toLowerCase()} is
        ${skillLevel(s, life, sk)}. Pay: 5 a month.
      </p>
      ${seat !== "speaker"
        ? html`<div class="cq-days">
            ${bar(fav / 100, "xp")}
            <span class="small"
              >The governor's favour: <b>${Math.round(fav)}</b>${fav < 25
                ? html` <span class="cq-chip bad"
                    >cooling: below 15 you may be put out</span
                  >`
                : nothing}</span
            >
          </div>`
        : nothing}
      ${acts.length
        ? html`<ul class="cq-pw-list">
            ${acts.map((a) => seatPowerRow(ui, a))}
          </ul>`
        : html`<p class="cq-muted small">
            The speaker's work is in the house: steer its bills (below), and
            carry its address to the governor.
          </p>`}`,
  );
}

function matters(ui: GameUi, n: number): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const cab = s.power?.cabinets[n];
  const list = (cab?.matters ?? []).slice().reverse().slice(0, 6);
  if (!list.length) return nothing;
  const sitting = !!mySeat(s, life);
  return section(
    "Before the council",
    html`<ul class="cq-matters">
        ${list.map((m) => {
          const ayes = Object.entries(m.votes).filter(
            ([k, v]) => Number(k) >= 0 && v > 0,
          ).length;
          const noes = Object.entries(m.votes).filter(
            ([k, v]) => Number(k) >= 0 && v < 0,
          ).length;
          const voted = m.votes[life.c];
          return html`<li class="cq-matter ${m.status}">
            <div>
              <b>${m.title}</b>
              <span class="cq-muted small"
                >brought by ${charName(s.chars[m.by])}, ${formatDate(m.day)} ·
                ${m.text}</span
              >
              <span class="small">
                ${m.status === "open"
                  ? html`<span class="cq-chip"
                      >divides ${formatDate(m.until)}</span
                    >`
                  : html`<span
                      class="cq-chip ${m.status === "carried" ? "good" : "bad"}"
                      >${m.undone ? "carried, not done" : m.status}</span
                    >`}
                ${ayes} aye, ${noes}
                no${m.undone ? html` · <i>${m.undone}</i>` : nothing}
              </span>
            </div>
            ${m.status === "open" &&
            sitting &&
            voted === undefined &&
            m.by !== life.c
              ? html`<div class="cq-btnrow">
                  <button
                    class="cq-btn small primary"
                    @click=${() =>
                      ui.cmd({ k: "power", act: "vote", n, id: m.id, side: 1 })}
                  >
                    Aye
                  </button>
                  <button
                    class="cq-btn small"
                    @click=${() =>
                      ui.cmd({
                        k: "power",
                        act: "vote",
                        n,
                        id: m.id,
                        side: -1,
                      })}
                  >
                    No
                  </button>
                </div>`
              : m.status === "open" && voted !== undefined
                ? html`<span class="cq-muted small"
                    >you voted
                    ${voted > 0 ? "aye" : voted < 0 ? "no" : "neither"}</span
                  >`
                : nothing}
          </li>`;
        })}
      </ul>
      <p class="cq-muted small">
        Voting with the governor's measures wins his favour (and counts you
        among his friends); against them, the country party's. A measure carried
        goes to the governor to sign.
      </p>`,
  );
}

/** How to reach each seat: your case against the bar, and a way to ask. */
function reach(ui: GameUi, n: number): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const nation = s.nations[n];
  const seats = seatsOf(nation).filter((x) => x !== "speaker");
  const atCapital = life.prov === nation.capital && !life.travel;
  return section(
    "Reaching a seat",
    html`<p class="small">
        The governor fills a seat from those he knows: your <b>renown</b>,
        <b>favour</b> at home, what he thinks of you, your <b>connections</b> (a
        patron, friends at the table, a place at court, a seat in the house or a
        county office) and your fitness for the portfolio. Ask in person at the
        governor's house in ${ui.map.provinces[nation.capital]?.name}; or be
        received at court, and wait to be offered one.
      </p>
      <ul class="cq-reach">
        ${seats.map((seat) => {
          const o = seatOdds(s, life, n, seat);
          const holder = s.chars[o.holder];
          const check = seekSeatCheck(s, life, seat);
          const warn = giveUpWarning(s, ui.w, life.c, {
            kind: "council",
            n,
            seat,
          });
          const frac =
            o.bar === Infinity
              ? 0
              : Math.max(0, Math.min(1, o.claim.total / o.bar));
          return html`<li>
            <div class="cq-reach-head">
              <b>${seatTitle(s, n, seat)}</b>
              <span class="cq-muted small"
                >${holder?.alive
                  ? html`held by ${charLink(ui, holder, false)}`
                  : "empty"}</span
              >
            </div>
            <div class="cq-days">
              ${bar(frac, "xp")}
              <span class="small"
                >your case
                ${num(
                  String(Math.round(o.claim.total)),
                  () =>
                    breakdownTip(
                      `Your case for ${seatTitle(s, n, seat).toLowerCase()}`,
                      o.claim,
                    ),
                  `cq-opinion ${o.claim.total >= o.bar ? "good" : "bad"}`,
                )}
                of ${o.bar === Infinity ? "(a player holds it)" : o.bar}</span
              >
            </div>
            ${warn ? html`<p class="cq-pw-warn small">${warn}</p>` : nothing}
            <div class="cq-btnrow">
              ${action(
                "Ask the governor for it",
                atCapital
                  ? check
                  : {
                      ok: false,
                      why: `At the governor's house in ${ui.map.provinces[nation.capital]?.name}.`,
                    },
                () => void ui.cmd({ k: "power", act: "seek", seat }),
                "small",
                undefined,
                false,
              )}
            </div>
          </li>`;
        })}
      </ul>`,
  );
}

function governorHand(ui: GameUi, n: number): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const nation = s.nations[n];
  const pool = seatPool(s, n);
  const provs = provincesOf(s, n);
  const cab = s.power?.cabinets[n];
  const waiting = (cab?.bills ?? []).filter((b) => b.stage === "governor");
  return html`${section(
    "Your council",
    html`<p class="cq-muted small">
        Appoint anyone of the colony to a seat (a player is asked and may
        refuse), and dismiss whoever has lost your confidence. The speaker is
        the house's to choose.
      </p>
      <ul class="cq-appoint">
        ${seatsOf(nation)
          .filter((x) => x !== "speaker")
          .map((seat) => {
            const id = seatHolderId(s, n, seat);
            const key = `appoint:${seat}`;
            const pick = pickOf(key, pool[0]?.id ?? -1);
            return html`<li>
              <span class="cq-appoint-seat">${seatTitle(s, n, seat)}</span>
              <span class="cq-appoint-who"
                >${s.chars[id]?.alive
                  ? charLink(ui, s.chars[id], false)
                  : html`<span class="cq-muted">empty</span>`}</span
              >
              <span class="cq-appoint-do">
                <select
                  class="cq-office-pick"
                  aria-label="Appoint whom"
                  @change=${setPick(ui, key)}
                >
                  ${pool.map(
                    (c) =>
                      html`<option value=${c.id} ?selected=${c.id === pick}>
                        ${charName(c)}${isPlayed(s, c.id) ? " (a player)" : ""}
                      </option>`,
                  )}
                </select>
                ${action(
                  "Appoint",
                  pool.length
                    ? { ok: true }
                    : { ok: false, why: "Nobody to appoint." },
                  () =>
                    void ui.cmd({ k: "power", act: "appoint", seat, c: pick }),
                  "small primary",
                  undefined,
                  false,
                )}
                ${id >= 0 && s.chars[id]?.alive
                  ? html`<button
                      class="cq-btn small quiet"
                      @click=${() =>
                        confirm(`Dismiss ${charName(s.chars[id])}?`) &&
                        void ui.cmd({ k: "power", act: "unseat", seat })}
                    >
                      Dismiss
                    </button>`
                  : nothing}
              </span>
            </li>`;
          })}
      </ul>`,
  )}
  ${section(
    "Proclamations",
    html`<ul class="cq-pw-list">
        ${PROCLAMATIONS.filter(
          (p) =>
            nation.kind === "power" ||
            !["frontier", "reward", "grace", "martial"].includes(p.key),
        ).map((p) => {
          const check = proclaimCheck(s, life, p.key);
          const advice = proclamationAdvice(s, n, p.key);
          const key = `proc:${p.key}`;
          const pick = pickOf(key, provs[0] ?? -1);
          return html`<li class="cq-pw">
            <div class="cq-pw-text">
              <b>${p.label}</b>
              <span class="small">${p.text}</span>
              ${num(
                `the council: ${advice.ayes} for, ${advice.noes} against`,
                () => ({
                  title: "The council's advice",
                  notes: advice.votes.map(
                    (v) =>
                      `${seatTitle(s, n, v.seat)}, ${charName(s.chars[v.c])}: ${v.v > 0 ? "for" : v.v < 0 ? "against" : "no view"} (${v.why})`,
                  ),
                }),
                `cq-advice small ${advice.noes > advice.ayes ? "bad" : "good"}`,
              )}
            </div>
            <div class="cq-pw-do">
              ${p.county
                ? html`<select
                    class="cq-office-pick"
                    aria-label="Which county"
                    @change=${setPick(ui, key)}
                  >
                    ${provs.map(
                      (q) =>
                        html`<option value=${q} ?selected=${q === pick}>
                          ${ui.map.provinces[q].name}
                        </option>`,
                    )}
                  </select>`
                : nothing}
              ${action(
                html`Proclaim
                it${p.cost
                  ? price(p.cost, {
                      have: nation.gold,
                      note: "from the treasury",
                    })
                  : nothing}`,
                check,
                () =>
                  void ui.cmd({
                    k: "power",
                    act: "proclaim",
                    key: p.key,
                    p: pick,
                  }),
                "small primary",
              )}
            </div>
          </li>`;
        })}
      </ul>
      <p class="cq-muted small">
        Going against the council's advice costs a little: unrest, and the
        councillors who opposed it remember.
      </p>`,
  )}
  ${nation.kind === "power"
    ? section(
        "Answering the house",
        html`${waiting.length
            ? html`<ul class="cq-matters">
                ${waiting.map(
                  (b) =>
                    html`<li class="cq-matter open">
                      <div>
                        <b>${billTitle(ui, b)}</b>
                        <span class="cq-muted small"
                          >passed ${b.ayes} to ${b.noes}, brought in by
                          ${charName(s.chars[b.by])} ·
                          ${BILLS[b.key].does}</span
                        >
                      </div>
                      <div class="cq-btnrow">
                        <button
                          class="cq-btn small primary"
                          @click=${() =>
                            ui.cmd({
                              k: "power",
                              act: "assent",
                              id: b.id,
                              yes: true,
                            })}
                        >
                          Assent
                        </button>
                        <button
                          class="cq-btn small"
                          @click=${() =>
                            ui.cmd({
                              k: "power",
                              act: "assent",
                              id: b.id,
                              yes: false,
                            })}
                        >
                          Veto
                        </button>
                      </div>
                    </li>`,
                )}
              </ul>`
            : html`<p class="cq-muted small">No bill waits on your assent.</p>`}
          <div class="cq-btnrow">
            <button
              class="cq-btn small"
              @click=${() =>
                confirm(
                  "Dissolve the assembly? A new election within the month; the house won't love you.",
                ) && void ui.cmd({ k: "power", act: "dissolve" })}
            >
              Dissolve the house
            </button>
            <button
              class="cq-btn small"
              @click=${() =>
                confirm(
                  "Prorogue the assembly for six months? No bills, and no new laws, until it sits again.",
                ) && void ui.cmd({ k: "power", act: "prorogue" })}
            >
              Prorogue it (six months)
            </button>
          </div>`,
      )
    : nothing}`;
}

function assembly(ui: GameUi, n: number): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const nation = s.nations[n];
  const pol = s.polities[n];
  if (!pol || nation.kind !== "power") return nothing;
  const cab = s.power?.cabinets[n];
  const member = pol.assembly.includes(me.id);
  const speaker = s.chars[cab?.speaker ?? -1];
  const live = (cab?.bills ?? []).filter(
    (b) => b.stage === "house" || b.stage === "governor",
  );
  const done = (cab?.bills ?? [])
    .filter((b) => b.stage !== "house" && b.stage !== "governor")
    .slice(-4)
    .reverse();
  const key = "bill:pick";
  const pick = pickOf(key, 0);
  const bk = BILL_KEYS[pick] ?? BILL_KEYS[0];
  return section(
    html`${pol.name.replace(/^the /, "The ")}`,
    html`<p class="small">
        ${pol.assembly.length} members. Speaker:
        ${speaker?.alive
          ? charLink(ui, speaker, false)
          : html`<span class="cq-muted">none chosen</span>`}.
        Next election ${formatDate(pollDay(pol.election))}.
        ${member ? html`<span class="cq-chip good">you sit</span>` : nothing}
      </p>
      ${live.length
        ? html`<ul class="cq-matters">
            ${live.map((b) => {
              const d = division(s, n, b);
              const lean = governorLean(s, n, b);
              return html`<li class="cq-matter open">
                <div>
                  <b>${billTitle(ui, b)}</b>
                  <span class="cq-muted small"
                    >brought in by ${charName(s.chars[b.by])} ·
                    ${BILLS[b.key].does}</span
                  >
                  <span class="small">
                    ${b.stage === "house"
                      ? html`<span class="cq-chip"
                            >divides ${formatDate(b.until)}</span
                          >
                          the house leans
                          <b class=${d.ayes > d.noes ? "good" : "bad"}
                            >${d.ayes} aye, ${d.noes} no</b
                          >`
                      : html`<span class="cq-chip gold"
                            >passed ${b.ayes}–${b.noes}: with the governor</span
                          >
                          ${isPlayed(s, nation.ruler)
                            ? ""
                            : lean >= 0
                              ? " he seems inclined to assent"
                              : " he seems inclined to veto"}`}
                  </span>
                </div>
                ${b.stage === "house" && cab?.speaker === me.id
                  ? action(
                      "Steer it from the chair",
                      { ok: true },
                      () => void ui.cmd({ k: "power", act: "steer", id: b.id }),
                      "small",
                    )
                  : nothing}
              </li>`;
            })}
          </ul>`
        : html`<p class="cq-muted small">No bills before the house.</p>`}
      ${done.length
        ? html`<p class="cq-muted small">
            Lately:
            ${done
              .map(
                (b) =>
                  `${billTitle(ui, b)} (${b.stage === "law" ? "law" : b.stage === "vetoed" ? "vetoed" : "thrown out"})`,
              )
              .join("; ")}.
          </p>`
        : nothing}
      ${member
        ? html`<div class="cq-bill-maker">
            <label class="cq-field">
              <span>Bring in a bill</span>
              <select @change=${setPick(ui, key)}>
                ${BILL_KEYS.map(
                  (k, i) =>
                    html`<option value=${i} ?selected=${i === pick}>
                      ${BILLS[k].title.replace(
                        "{county}",
                        ui.map.provinces[countyOf(ui)]?.name ?? "your county",
                      )}
                    </option>`,
                )}
              </select>
            </label>
            <p class="small">
              ${BILLS[bk].text} <i>As law: ${BILLS[bk].does}</i>
            </p>
            <div class="cq-btnrow">
              ${action(
                "Bring it in",
                billCheck(s, life, n, bk),
                () => void ui.cmd({ k: "power", act: "bill", key: bk }),
                "small primary",
              )}
              ${cab?.speaker !== me.id
                ? html`<button
                    class="cq-btn small quiet"
                    @click=${() => ui.cmd({ k: "power", act: "speaker" })}
                  >
                    Put your name forward for the chair
                  </button>`
                : nothing}
            </div>
          </div>`
        : html`<p class="cq-muted small">
            Members bring in bills: be elected (Society › Standing), or win your
            county's burgess seat (Society › Office).
          </p>`}`,
  );
}

/** The county a member's bill would be for: their burgess's county, or home. */
function countyOf(ui: GameUi): number {
  const life = ui.life!;
  const local = Object.values(ui.s.society?.offices ?? {})
    .flat()
    .find((o) => o.holder === life.c && o.key === "burgess");
  return local?.prov ?? life.home;
}

export function councilPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const n = me.nation;
  const nation = s.nations[n];
  const native = lifeIsNative(s, life);
  if (!nation?.alive || (nation.kind !== "power" && nation.kind !== "native"))
    return html`${pageHead("Council", "The governor's council.")}
    ${howTo("Your people keep no council you could sit on.", [])}`;
  const seat = mySeat(s, life);
  const governs = nation.ruler === me.id;
  return html`${pageHead(
    native ? "The council fire" : `The council of ${shortName(nation)}`,
    native
      ? "The leader and those who sit at the fire with them: the war chief, the speaker, the keeper of stores, the scout and the healer."
      : "The governor and eight seats, each with its portfolio. Councillors advise and vote, keep the governor's favour (or lose it), and are dismissed or disgraced. One office at a time: a seat here is your one office.",
  )}
  ${chamber(ui, n)} ${seat ? yourSeat(ui, n, seat) : nothing} ${matters(ui, n)}
  ${governs ? governorHand(ui, n) : !seat ? reach(ui, n) : nothing}
  ${assembly(ui, n)}
  ${more(
    "What each seat does",
    html`<dl class="cq-family">
        ${seatsOf(nation).map(
          (st) =>
            html`<dt>${seatTitle(s, n, st)}</dt>
              <dd class="small">
                ${SEAT_PORTFOLIO[st]}
                ${SEAT_ACTIONS.filter((a) => a.seat === st)
                  .map((a) => a.label)
                  .join("; ")}.
              </dd>`,
        )}
      </dl>
      <p class="cq-muted small">
        ${Object.keys(MEASURES).length} kinds of measure can come before the
        council;
        ${Object.keys(councilAdvice(s, n, "war", me.id).votes).length
          ? "every councillor gives advice on war, laws, taxes and works"
          : ""}.
      </p>`,
  )}`;
}
