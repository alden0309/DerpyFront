// Civic life in the browser: a county's offices (who holds them, how
// they're filled, and what you can do about it), getting up a settlement,
// and setting up a new nation's government with its flag.

import { html, nothing, TemplateResult } from "lit";
import { formatDate, pollDay } from "../../engine/Calendar"; // FIXES (r15): pollDay
import {
  constituteCheck,
  firstOfficers,
  FOUND,
  foundCheck,
  setOutCheck,
  settlementSites,
  supplyCost,
  TERMS,
} from "../../engine/Founding";
import { interactionView } from "../../engine/Interactions";
// POWER (r12): office powers, one office at a time, bills, the court roll.
import { BILL_KEYS, billCheck, BILLS } from "../../engine/Assembly";
import {
  powerCheck,
  powerLabel,
  powerOdds,
  powersOf,
  powerTargets,
  subordinates,
  type OfficePower,
} from "../../engine/Authority";
import { lifeOfChar, peopleHere } from "../../engine/LifeQueries";
import { CHARGES } from "../../engine/LifeRules";
import {
  appointerOf,
  dutyCheck,
  eligible,
  leverCheck,
  leverTargets,
  officeKeysFor,
  officeName,
  OFFICES,
  pollRival,
  pollStanding,
  standLocalCheck,
} from "../../engine/Offices";
import { giveUpWarning } from "../../engine/OneOffice";
import { charName, provincesOf, tribesfolk } from "../../engine/Queries";
import { SEAT_NAMES } from "../../engine/Rules";
import { officesIn } from "../../engine/SocietyCore";
import {
  FLAG_COLORS,
  FLAG_DIVISIONS,
  GOV_FORMS,
} from "../../engine/SocietyRules";
import { courtRoll, KIND_NAMES, STAGES } from "../../engine/Trials";
import type {
  Charge,
  GovForm,
  LocalOffice,
  NationFlag,
  Seat,
} from "../../engine/Types";
import { SEATS } from "../../engine/Types";
import { customFlag, flagFor } from "../Flags";
import { play } from "../Sound";
import { GOOD_NAMES, nationName, TERRAIN_NAMES } from "../Text";
import { num } from "../Tip";
import {
  action,
  bar,
  breakdownTip,
  charLink,
  GameUi,
  nationLink,
  odds,
  section,
  token,
} from "./Context";
import { verdictChip } from "./Here";
import { price, splitPrice } from "./Price"; // LEDGER (r15)
import { steadyOrder } from "./Steady";

// ---------------------------------------------------------------- offices

const HOW: Record<string, string> = {
  elected: "chosen by the freeholders",
  governor: "the governor's commission",
  court: "named by the county court",
  council: "chosen by the town council",
  clan: "raised up by the clan mothers",
};

const leverPick: Record<number, number> = {};

function officeRow(ui: GameUi, o: LocalOffice): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const def = OFFICES[o.key];
  const holder = s.chars[o.holder];
  const by = s.chars[appointerOf(s, o)];
  const mine = !!life && o.holder === life.c;
  const iAppoint =
    !!life && appointerOf(s, o) === life.c && def.how !== "elected";
  const standing = life ? o.candidates.find((x) => x.c === life.c) : undefined;
  let acts: TemplateResult | typeof nothing = nothing;
  if (life && life.c >= 0 && !life.watching) {
    if (mine) {
      const lever = def.lever;
      const targets = lever?.who ? leverTargets(s, life, o) : [];
      const pick = leverPick[o.id] ?? targets[0]?.id ?? -1;
      // POWER (r12): the burgess's lever brings in a real bill.
      const billKey = BILL_KEYS[leverPick[-o.id] ?? 0] ?? BILL_KEYS[0];
      const billRow =
        o.key === "burgess"
          ? html`<div class="cq-btnrow">
                <select
                  class="cq-office-pick wide"
                  aria-label="Which bill"
                  @change=${(e: Event) => {
                    leverPick[-o.id] = Number(
                      (e.target as HTMLSelectElement).value,
                    );
                    ui.redraw();
                  }}
                >
                  ${BILL_KEYS.map(
                    (k, i) =>
                      html`<option value=${i} ?selected=${k === billKey}>
                        ${BILLS[k].title.replace(
                          "{county}",
                          ui.map.provinces[o.prov]?.name ?? "the county",
                        )}
                      </option>`,
                  )}
                </select>
                ${action(
                  "Bring in the bill",
                  leverCheck(s, life, o).ok
                    ? billCheck(s, life, o.nation, billKey)
                    : leverCheck(s, life, o),
                  () =>
                    ui.cmd({
                      k: "society",
                      act: "lever",
                      id: o.id,
                      arg: BILL_KEYS.indexOf(billKey),
                    }),
                  "small",
                  BILLS[billKey].does,
                )}
              </div>
              <p class="cq-muted small">As law: ${BILLS[billKey].does}</p>`
          : nothing;
      acts = html`<div class="cq-btnrow">
          ${action(
            def.duty.label,
            dutyCheck(s, life, o),
            () => ui.cmd({ k: "society", act: "duty", id: o.id }),
            "primary small",
            def.duty.text,
          )}
          ${lever && o.key !== "burgess"
            ? html`${lever.who
                ? html`<select
                    class="cq-office-pick"
                    @change=${(e: Event) => {
                      leverPick[o.id] = Number(
                        (e.target as HTMLSelectElement).value,
                      );
                      ui.redraw();
                    }}
                  >
                    ${targets.map(
                      (c) =>
                        html`<option value=${c.id} ?selected=${c.id === pick}>
                          ${charName(c)}
                        </option>`,
                    )}
                  </select>`
                : nothing}
              ${action(
                lever.label,
                leverCheck(s, life, o),
                () =>
                  ui.cmd({ k: "society", act: "lever", id: o.id, arg: pick }),
                "small",
                lever.text,
              )}`
            : nothing}
          <button
            class="cq-btn quiet small"
            @click=${() => {
              if (confirm(`Resign as ${officeName(s, o).toLowerCase()}?`))
                void ui.cmd({ k: "society", act: "resign", id: o.id });
            }}
          >
            Resign
          </button>
        </div>
        <p class="cq-muted small">
          ${def.duty.text} Once a month, in the county; neglect it and
          ${def.how === "elected"
            ? "the county grumbles"
            : "you'll be dismissed"}.
          ${o.duty ? html`Last done ${formatDate(o.duty)}.` : nothing}
        </p>
        ${billRow} ${powersBlock(ui, o)}`;
    } else if (def.how === "elected") {
      const check = standing
        ? { ok: false as const, why: "You're standing." }
        : standLocalCheck(s, life, o);
      const me = pollStanding(s, life, o);
      const rival = pollRival(s, o, life.c);
      const warn = giveUpWarning(s, ui.w, life.c, {
        kind: "local",
        n: o.nation,
        o,
      });
      acts = html`<div class="cq-btnrow">
          ${action(
            standing
              ? `Standing: ${standing.points} campaign points`
              : "Stand at the poll",
            check,
            () => ui.cmd({ k: "society", act: "stand", id: o.id }),
            standing ? "small lit" : "small",
          )}
        </div>
        ${standing || check.ok
          ? html`<p class="small">
              Your standing
              ${num(
                String(me.total),
                () => breakdownTip("Your standing at the poll", me),
                `cq-opinion ${rival && me.total > rival.score ? "good" : "bad"}`,
              )}
              ${rival
                ? html`against ${charLink(ui, s.chars[rival.c], false)} (about
                  ${Math.round(rival.score)})`
                : html`(unopposed, so far)`}.
              Canvass at the tavern, print a broadside, stand a round.
            </p>`
          : nothing}
        ${warn && (standing || check.ok)
          ? html`<p class="cq-pw-warn small">${warn}</p>`
          : nothing}`;
    } else if (iAppoint) {
      const pool = leverTargets(s, life, o).filter((c) => !lifeOfChar(s, c.id));
      const pick = leverPick[o.id] ?? pool[0]?.id ?? -1;
      const selfOk = eligible(s, life, o).ok;
      const selfWarn = selfOk
        ? giveUpWarning(s, ui.w, life.c, { kind: "local", n: o.nation, o })
        : null;
      acts = html`<div class="cq-btnrow">
          <select
            class="cq-office-pick"
            @change=${(e: Event) => {
              leverPick[o.id] = Number((e.target as HTMLSelectElement).value);
              ui.redraw();
            }}
          >
            ${selfOk
              ? html`<option value=${life.c} ?selected=${pick === life.c}>
                  Yourself
                </option>`
              : nothing}
            ${pool.map(
              (c) =>
                html`<option value=${c.id} ?selected=${c.id === pick}>
                  ${charName(c)}
                </option>`,
            )}
          </select>
          ${action(
            "Appoint",
            pick >= 0 ? { ok: true } : { ok: false, why: "Nobody to appoint." },
            () => ui.cmd({ k: "society", act: "appoint", id: o.id, c: pick }),
            "small primary",
          )}
          ${o.holder >= 0 && o.holder !== life.c
            ? html`<button
                class="cq-btn quiet small"
                @click=${() =>
                  confirm(`Dismiss ${charName(holder)}?`) &&
                  void ui.cmd({ k: "power", act: "dismiss", id: o.id })}
              >
                Dismiss ${holder?.first ?? ""}
              </button>`
            : nothing}
        </div>
        ${pick === life.c && selfWarn
          ? html`<p class="cq-pw-warn small">${selfWarn}</p>`
          : nothing}`;
    } else if (by) {
      const elig = eligible(s, life, o);
      const seekWarn = elig.ok
        ? giveUpWarning(s, ui.w, life.c, { kind: "local", n: o.nation, o })
        : null;
      const here = peopleHere(s, life.prov, life).some((c) => c.id === by.id);
      const v = here
        ? interactionView(s, ui.w, life, by.id, "seek", o.id)
        : null;
      acts = html`<div class="cq-btnrow">
          ${here && v
            ? html`<button
                class="cq-int ${v.will ? "lit" : ""}"
                ?disabled=${!v.check.ok}
                title=${v.check.ok ? "" : v.check.why}
                @click=${() =>
                  ui.modal({ k: "interact", c: by.id, act: "seek", arg: o.id })}
              >
                <span class="cq-int-label">Ask ${by.first} for it</span
                >${verdictChip(v)}
                <span class="cq-act-why">${v.check.ok ? "" : v.check.why}</span>
              </button>`
            : action(
                `Petition ${by.first} by letter`,
                elig,
                () =>
                  ui.modal({
                    k: "write",
                    c: by.id,
                    kind: "petition",
                    arg: 0,
                    about: o.id,
                  }),
                "small",
              )}
        </div>
        ${!elig.ok && !(here && v && !v.check.ok)
          ? html`<p class="cq-muted small">${elig.why}</p>`
          : nothing}
        ${seekWarn
          ? html`<p class="cq-pw-warn small">${seekWarn}</p>`
          : nothing}`;
    }
  }
  return html`<li class="cq-office ${mine ? "mine" : ""}">
    <div class="cq-office-head">
      <b class="cq-office-name">${officeName(s, o)}</b>
      <span class="cq-muted small"
        >${HOW[def.how] ?? ""}${def.how === "elected"
          ? `, every ${def.years} year${def.years > 1 ? "s" : ""}: next poll ${formatDate(pollDay(o.election))}`
          : by
            ? html`: ${charLink(ui, by, false)}`
            : ""}</span
      >
    </div>
    <div class="cq-office-holder">
      ${holder?.alive
        ? html`${token(ui, holder, "small")} ${charLink(ui, holder)}`
        : html`<span class="cq-chip gold">vacant</span>`}
      <span class="cq-muted small"
        >${def.pay} a month · renown ${def.renown}/month</span
      >
    </div>
    <p class="cq-muted small">${def.text} <i>${def.step}</i></p>
    ${acts}
  </li>`;
}

// ---------------------------------------------------------------- POWER (r12): an office's powers

const powerPick: Record<string, number> = {};
const powerSide: Record<string, number> = {};

function powerRow(ui: GameUi, o: LocalOffice, pw: OfficePower): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const key = `${o.id}:${pw.key}`;
  const targets =
    pw.target !== "none" ? powerTargets(s, ui.w, life, o, pw) : [];
  const pick = powerPick[key] ?? targets[0]?.id ?? -1;
  const side = powerSide[key] ?? 1;
  const chance = powerOdds(s, life, pw);
  return html`<li class="cq-pw">
    <div class="cq-pw-text">
      <b>${splitPrice(powerLabel(s, o, pw)).text}</b>
      <span class="small">${pw.text}</span>
      ${pw.check
        ? html`<span class="cq-muted small"
            >${pw.check.skill[0].toUpperCase()}${pw.check.skill.slice(1)}
            ${odds(chance)}</span
          >`
        : nothing}
    </div>
    <div class="cq-pw-do">
      ${targets.length
        ? html`<select
            class="cq-office-pick"
            aria-label="Whom"
            @change=${(e: Event) => {
              powerPick[key] = Number((e.target as HTMLSelectElement).value);
              ui.redraw();
            }}
          >
            ${targets.map(
              (t) =>
                html`<option value=${t.id} ?selected=${t.id === pick}>
                  ${t.label}
                </option>`,
            )}
          </select>`
        : nothing}
      ${pw.sided
        ? html`<div
            class="cq-seg small"
            role="radiogroup"
            aria-label="For or against"
          >
            <button
              role="radio"
              aria-checked=${side > 0}
              class=${side > 0 ? "on" : ""}
              @click=${() => {
                powerSide[key] = 1;
                ui.redraw();
              }}
            >
              ${pw.key === "speech" ? "With the governor" : "For"}
            </button>
            <button
              role="radio"
              aria-checked=${side < 0}
              class=${side < 0 ? "on" : ""}
              @click=${() => {
                powerSide[key] = -1;
                ui.redraw();
              }}
            >
              Against
            </button>
          </div>`
        : nothing}
      ${action(
        html`Do it${pw.cost ? price(pw.cost, { have: life.purse }) : nothing}`,
        powerCheck(s, ui.w, life, o, pw.key),
        () =>
          void ui.cmd({
            k: "power",
            act: "use",
            id: o.id,
            key: pw.key,
            c: pick,
            side,
          }),
        "small",
      )}
    </div>
  </li>`;
}

function powersBlock(
  ui: GameUi,
  o: LocalOffice,
): TemplateResult | typeof nothing {
  const list = powersOf(o);
  if (!list.length) return nothing;
  return html`<h4 class="cq-int-group">The office's powers</h4>
    <ul class="cq-pw-list">
      ${list.map((pw) => powerRow(ui, o, pw))}
    </ul>`;
}

/** Offices in your gift (whose holders you appoint and can dismiss). */
export function subordinatesSection(
  ui: GameUi,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  if (!life || life.c < 0) return nothing;
  const list = subordinates(s, life);
  if (!list.length) return nothing;
  return section(
    "Offices in your gift",
    html`<ul class="cq-list">
        ${list.map((o) => {
          const h = s.chars[o.holder];
          return html`<li>
            <b>${officeName(s, o)}</b> of ${ui.map.provinces[o.prov]?.name}:
            ${h?.alive
              ? charLink(ui, h, false)
              : html`<span class="cq-chip gold">vacant: yours to fill</span>`}
            ${h?.alive
              ? html`<button
                  class="cq-btn quiet small"
                  @click=${() =>
                    confirm(`Dismiss ${charName(h)}?`) &&
                    void ui.cmd({ k: "power", act: "dismiss", id: o.id })}
                >
                  Dismiss
                </button>`
              : nothing}
          </li>`;
        })}
      </ul>
      <p class="cq-muted small">
        You name these officers; a vacancy waits two months for your choice
        (below, on the county's list), then the county fills it.
      </p>`,
  );
}

/** The court roll: cases waiting or heard lately in a county. */
export function courtRollSection(
  ui: GameUi,
  p: number,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const list = courtRoll(s, p).slice().reverse().slice(0, 8);
  if (!list.length) return nothing;
  return section(
    "The court roll",
    html`<ul class="cq-roll">
      ${list.map((t) => {
        const d = s.chars[t.defendant];
        const judge = s.chars[t.judge];
        return html`<li class=${t.stage >= 5 ? "done" : "open"}>
          <span><b>${charName(d)}</b>, ${t.charge}</span>
          <span class="cq-muted small">
            ${KIND_NAMES[t.kind]}${judge?.alive
              ? html`, before ${charName(judge)}`
              : ""}
            ·
            ${t.stage >= 5
              ? t.verdict === "guilty"
                ? html`<span class="cq-chip bad">guilty: ${t.sentence}</span>`
                : html`<span class="cq-chip good">acquitted</span>`
              : html`<span class="cq-chip gold">${STAGES[t.stage]}</span>`}
          </span>
        </li>`;
      })}
    </ul>`,
  );
}

/** People whose secrets you know: bring them before the court. */
export function accuseSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  if (!life || life.c < 0) return nothing;
  const list = (life.secrets ?? []).filter(
    (x) =>
      (x.kind === "crime" || x.kind === "affair" || x.kind === "child") &&
      s.chars[x.of]?.alive &&
      !lifeOfChar(s, x.of),
  );
  if (!list.length) return nothing;
  return section(
    "Before the court",
    html`<p class="small">
        What you know of these people would stand in court. Bring them before
        the justices (a trial, with you as the accuser): win, and your name
        rises; lose, and they'll hate you, and your secret's spent.
      </p>
      <ul class="cq-list">
        ${list.map(
          (x) =>
            html`<li>
              ${charLink(ui, s.chars[x.of], false)}
              <span class="cq-muted small"
                >${x.kind === "crime"
                  ? "a crime"
                  : x.kind === "affair"
                    ? "adultery"
                    : "a child out of wedlock"}</span
              >
              <button
                class="cq-btn small"
                @click=${() =>
                  confirm(
                    `Bring ${charName(s.chars[x.of])} before the court?`,
                  ) && void ui.cmd({ k: "power", act: "accuse", c: x.of })}
              >
                Bring them before the court
              </button>
            </li>`,
        )}
      </ul>`,
  );
}

export function officesPage(ui: GameUi, p: number): TemplateResult {
  const s = ui.s;
  const pr = s.provinces[p];
  const list = officesIn(s, p);
  const keys = officeKeysFor(s, ui.w, p);
  const owner = pr?.owner >= 0 ? s.nations[pr.owner] : undefined;
  const native = owner?.kind === "native";
  return html`<header class="cq-panel-head">
      <p class="cq-kicker">
        ${native ? "The town's offices" : "The county's offices"}
      </p>
      <h2 class="cq-h1">${ui.map.provinces[p]?.name}</h2>
      <p class="small">${owner ? nationLink(ui, owner.id) : "Nobody's land"}</p>
      <p class="cq-muted small">
        ${native
          ? "The council, the war captain, the speaker, the sachem and the clan mothers: chosen by the town, and a road to the nation's council fire."
          : "Justices and a sheriff by the governor's commission; a constable and the watch named by the county court; selectmen, a mayor, a burgess and the churchwardens chosen by the freeholders. Office pays fees, brings renown, and leads on to the assembly, the council and the governor's chair."}
      </p>
    </header>
    ${list.length
      ? html`<ul class="cq-offices-list">
          ${steadyOrder("offices", `${ui.visit}:${p}`, list, (o) => o.id).map(
            (o) => officeRow(ui, o),
          )}
        </ul>`
      : keys.length
        ? html`<p class="cq-empty">
            The county's offices are settled when someone comes to live here (or
            at the month's end).
          </p>`
        : html`<p class="cq-empty">
            There's no government here to hold office in.
          </p>`}
    ${courtRollSection(ui, p)}`;
}

// ---------------------------------------------------------------- a settlement

const foundDraft = { terms: 1, free: false, supply: 10 };

export function foundingPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  if (!life || !me) return html`<p class="cq-empty">You're watching.</p>`;
  const f = life.founding;
  const head = html`<header class="cq-panel-head">
    <h2 class="cq-h1">A settlement of your own</h2>
    <p class="cq-muted small">
      Money, families who like you enough to come on your terms, supplies, and
      the governor's leave (or none: squatters). Choose an empty place, lead
      them there, and it becomes a real province with you its proprietor, under
      your crown, or your own colony if you dare.
    </p>
  </header>`;
  if (!f) {
    const check = foundCheck(s, ui.w, life);
    const sites = check.ok ? settlementSites(s, ui.w, life) : [];
    return html`${head}
      <ol class="cq-road small">
        <li>Choose a place: no one's land, within three months' journey.</li>
        <li>
          Find at least ${FOUND.minHouses} households willing to come (ask them:
          their card, <i>Ask them to come to your settlement</i>).
        </li>
        <li>
          Lay in supplies: ${FOUND.supplyBase} coins and ${FOUND.supplyPer} a
          household.
        </li>
        <li>
          Ask the governor for a charter (or don't), pay the families' passage,
          and set out.
        </li>
      </ol>
      ${check.ok
        ? html`<div class="cq-host-row">
              <label class="cq-field">
                <span>Terms for the families</span>
                <select
                  @change=${(e: Event) => {
                    foundDraft.terms = Number(
                      (e.target as HTMLSelectElement).value,
                    );
                    ui.redraw();
                  }}
                >
                  ${TERMS.map(
                    (t, i) =>
                      html`<option
                        value=${i}
                        ?selected=${foundDraft.terms === i}
                      >
                        ${t.name}
                      </option>`,
                  )}
                </select>
              </label>
              <label class="cq-check">
                <input
                  type="checkbox"
                  .checked=${foundDraft.free}
                  @change=${() => {
                    foundDraft.free = !foundDraft.free;
                    ui.redraw();
                  }}
                />
                Your own colony, answering to no crown (the old colony won't
                like it)
              </label>
            </div>
            <ul class="cq-sites">
              ${sites.map((x) => {
                const def = ui.map.provinces[x.p];
                return html`<li class="cq-site">
                  <span class="cq-site-name"
                    ><b>${def.name}</b>
                    <span class="cq-muted small"
                      >${TERRAIN_NAMES[def.terrain] ?? def.terrain},
                      ${GOOD_NAMES[ui.w.raw[x.p]] ?? ""} · ${x.days}
                      days${x.sea ? " by sea" : ""}</span
                    >
                    ${x.natives
                      ? html`<span class="cq-chip bad">natives live here</span>`
                      : nothing}
                  </span>
                  <button
                    class="cq-btn quiet small"
                    @click=${() => ui.focusProv(x.p)}
                  >
                    Map
                  </button>
                  <button
                    class="cq-btn small primary"
                    @click=${() =>
                      ui.cmd({
                        k: "society",
                        act: "found",
                        p: x.p,
                        free: foundDraft.free,
                        arg: foundDraft.terms,
                      })}
                  >
                    Plant it here${price(FOUND.start, { have: life.purse })}
                  </button>
                </li>`;
              })}
              ${sites.length
                ? nothing
                : html`<p class="cq-empty">No empty land within reach.</p>`}
            </ul>`
        : html`<p class="cq-callout">${check.why}</p>`}`;
  }
  const target = ui.map.provinces[f.target];
  const need = supplyCost(f);
  const go = setOutCheck(s, ui.w, life);
  const here = peopleHere(s, life.prov, life).filter(
    (c) => !lifeOfChar(s, c.id) && c.home !== undefined,
  );
  const asks = here
    .map((c) => ({ c, v: interactionView(s, ui.w, life, c.id, "settle") }))
    .filter((x) => x.v.check.ok)
    .slice(0, 12);
  const gov = s.chars[s.nations[me.nation]?.ruler ?? -1];
  const atCapital = s.nations[me.nation]?.capital === life.prov;
  return html`${head}
    <div class="cq-callout ${f.stage === "underway" ? "lit" : ""}">
      <p>
        ${f.stage === "underway"
          ? "On the way to"
          : "Getting up a settlement at"}
        <b>${target.name}</b>${f.independent ? ", your own colony" : ""}.
        ${tribesfolk(s.provinces[f.target]) > 0
          ? html`<span class="cq-chip bad">natives live there</span>`
          : nothing}
      </p>
      <button class="cq-btn quiet small" @click=${() => ui.focusProv(f.target)}>
        Show it on the map
      </button>
    </div>
    ${section(
      "Families",
      html`<p class="small">
          ${f.settlers.length} of at least ${FOUND.minHouses} households (up to
          ${FOUND.maxHouses}). Terms:
          <select
            @change=${(e: Event) =>
              ui.cmd({
                k: "society",
                act: "terms",
                arg: Number((e.target as HTMLSelectElement).value),
              })}
          >
            ${TERMS.map(
              (t, i) =>
                html`<option value=${i} ?selected=${f.terms === i}>
                  ${t.name}
                </option>`,
            )}
          </select>
        </p>
        <ul class="cq-ties">
          ${f.settlers.map((id) => html`<li>${charLink(ui, s.chars[id])}</li>`)}
        </ul>
        ${f.stage === "planning" && asks.length
          ? html`<h4 class="cq-int-group">People here you could ask</h4>
              <div class="cq-int-list">
                ${asks.map(
                  ({ c, v }) =>
                    html`<button
                      class="cq-int ${v.will ? "lit" : ""}"
                      @click=${() =>
                        ui.modal({ k: "interact", c: c.id, act: "settle" })}
                    >
                      <span class="cq-int-label">${charName(c)}</span
                      >${verdictChip(v)}<span class="cq-act-why"></span>
                    </button>`,
                )}
              </div>`
          : nothing}`,
    )}
    ${section(
      "Supplies and leave",
      html`<p class="small">
          Supplies: ${Math.floor(f.supplies)} of ${need} coins' worth.
          ${bar(f.supplies / Math.max(1, need), "xp")}
        </p>
        ${f.stage === "planning"
          ? html`<div class="cq-btnrow">
              ${action(
                html`Lay in
                supplies${price(Math.max(1, need - Math.floor(f.supplies)), {
                  have: life.purse,
                })}`,
                f.supplies >= need
                  ? { ok: false, why: "Enough laid in." }
                  : life.purse < Math.max(1, need - f.supplies)
                    ? { ok: false, why: "Not enough coins." }
                    : { ok: true },
                () =>
                  ui.cmd({
                    k: "society",
                    act: "supply",
                    arg: Math.max(1, need - Math.floor(f.supplies)),
                  }),
                "small",
              )}
            </div>`
          : nothing}
        <p class="small">
          Charter:
          ${f.charter === "granted"
            ? html`<span class="cq-chip good">granted</span>`
            : f.independent
              ? html`<span class="cq-muted"
                  >none, and none wanted: it will be your own</span
                >`
              : html`<span class="cq-chip">none yet</span> (without one you're
                  squatters: the governor's anger, and unrest)`}
        </p>
        ${f.stage === "planning" &&
        f.charter !== "granted" &&
        !f.independent &&
        gov?.alive
          ? html`<div class="cq-btnrow">
              ${action(
                `Ask ${gov.first} in person`,
                atCapital
                  ? { ok: true }
                  : {
                      ok: false,
                      why: "At the governor's house in the capital.",
                    },
                () => ui.cmd({ k: "society", act: "charter" }),
                "small",
              )}
              <button
                class="cq-btn small"
                @click=${() =>
                  ui.modal({ k: "write", c: gov.id, kind: "petition", arg: 2 })}
              >
                Petition by letter
              </button>
            </div>`
          : nothing}`,
    )}
    ${f.stage === "planning"
      ? html`<div class="cq-btnrow end">
          ${action(
            html`Set
            out${price(FOUND.passagePer * f.settlers.length, {
              have: life.purse,
              note: "the families' passage",
            })}`,
            go,
            async () => {
              if (await ui.cmd({ k: "society", act: "setout" })) play("bell");
            },
            "primary big",
          )}
          <button
            class="cq-btn quiet small"
            @click=${() => {
              if (confirm("Give up the settlement? The money's spent."))
                void ui.cmd({ k: "society", act: "abandon" });
            }}
          >
            Give it up
          </button>
        </div>`
      : html`<p class="cq-muted small">
          Lead them there: the settlement is planted when you arrive.
        </p>`}`;
}

// ---------------------------------------------------------------- the government

let gov: {
  key: string;
  name: string;
  adjective: string;
  color: string;
  flag: NationFlag;
  form: GovForm;
  capital: number;
  offices: Partial<Record<Seat, number>>;
  free: boolean;
  /** The adjective was typed in, so the name no longer suggests one. */
  adjTyped?: boolean;
} | null = null;

/** "the Commonwealth of Virginia" -> "Virginian"; "" when there's no good guess. */
function adjectiveFor(name: string): string {
  const w = name.trim().split(/\s+/).pop() ?? "";
  if (!/^[A-Z][a-z]{2,}$/.test(w)) return "";
  if (w.endsWith("ida")) return `${w.slice(0, -1)}ian`;
  if (w.endsWith("a")) return `${w}n`;
  return "";
}

const CHARGE_LIST: Charge[] = [
  "none",
  "star",
  "tree",
  "ship",
  "anchor",
  "beaver",
  "wheat",
  "bird",
  "crescent",
  "tower",
  "sword",
  "key",
  "heart",
  "fleur",
  "lion",
  "turtle",
  "wolf",
  "bear",
  "deer",
  "feather",
];

const DIV_NAMES: Record<NationFlag["division"], string> = {
  plain: "Plain",
  pale: "A pale",
  fess: "A fess",
  bend: "A bend",
  cross: "A cross",
  saltire: "A saltire",
  canton: "A canton",
  triband: "Three bands",
  stripes: "Stripes",
};

function swatches(
  pick: string,
  set: (c: string) => void,
  label: string,
): TemplateResult {
  return html`<div class="cq-swatches" role="radiogroup" aria-label=${label}>
    ${FLAG_COLORS.map(
      (c) =>
        html`<button
          role="radio"
          aria-checked=${c === pick}
          aria-label=${c}
          class="cq-swatch ${c === pick ? "on" : ""}"
          style="--sw:${c}"
          @click=${() => set(c)}
        ></button>`,
    )}
  </div>`;
}

export function constituteModal(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  if (!life || !me || !life.constitute)
    return html`<p class="cq-muted">There's no government to set up.</p>`;
  const check = constituteCheck(s, life);
  const n = s.nations[life.constitute.n];
  const key = `${ui.modalSeq}|${n.id}`;
  if (gov?.key !== key)
    gov = {
      key,
      name: n.name,
      adjective: n.adjective,
      color: FLAG_COLORS.includes(n.color) ? n.color : FLAG_COLORS[8],
      flag: n.flag ?? {
        field: FLAG_COLORS[8],
        division: "canton",
        second: FLAG_COLORS[0],
        charge: "tree",
        chargeColor: FLAG_COLORS[6],
      },
      form: n.gov ?? "republic",
      capital: n.capital,
      offices: {},
      free: life.constitute.free,
    };
  const d = gov;
  const set = (patch: Partial<typeof d>) => {
    Object.assign(d, patch);
    ui.redraw();
  };
  const setFlag = (patch: Partial<NationFlag>) =>
    set({ flag: { ...d.flag, ...patch } });
  const officers = firstOfficers(s, n.id);
  const provs = provincesOf(s, n.id);
  const title = GOV_FORMS[d.form].ruler[me.female ? 1 : 0];
  return html`<div class="cq-constitute">
    <h2 class="cq-h1">A new government</h2>
    <p class="cq-muted small">
      What is it to be called, under what flag, and how governed? The map, the
      gazettes and every nation of the Americas will know it by what you choose.
    </p>
    <div class="cq-const-grid">
      <div class="cq-const-flag">
        ${customFlag(d.flag, "cq-flag huge")}
        <p class="cq-const-name" style="--nc:${d.color}">${d.name}</p>
        <p class="cq-muted small">
          ${charName(me)}, its first ${title.toLowerCase()}
        </p>
      </div>
      <div class="cq-const-form">
        <label class="cq-field">
          <span>Name</span>
          <input
            type="text"
            maxlength="40"
            .value=${d.name}
            @input=${(e: Event) => {
              d.name = (e.target as HTMLInputElement).value;
              const adj = d.adjTyped ? "" : adjectiveFor(d.name);
              if (adj && adj !== d.adjective) {
                d.adjective = adj;
                ui.redraw();
              }
            }}
            @change=${() => ui.redraw()}
          />
        </label>
        <label class="cq-field">
          <span>Its people are called</span>
          <input
            type="text"
            maxlength="20"
            .value=${d.adjective}
            @input=${(e: Event) => {
              d.adjective = (e.target as HTMLInputElement).value;
              d.adjTyped = true;
            }}
            @change=${() => ui.redraw()}
          />
        </label>
        <div class="cq-field">
          <span>Colour on the map</span>${swatches(
            d.color,
            (c) => set({ color: c }),
            "Map colour",
          )}
        </div>
      </div>
    </div>
    <h3 class="cq-h3">The flag</h3>
    <div class="cq-flag-maker">
      <div class="cq-field">
        <span>Field</span>${swatches(
          d.flag.field,
          (c) => setFlag({ field: c }),
          "Field",
        )}
      </div>
      <div class="cq-field">
        <span>Division</span>
        <div class="cq-flag-divs">
          ${FLAG_DIVISIONS.map(
            (v) =>
              html`<button
                class="cq-flag-opt ${d.flag.division === v ? "on" : ""}"
                title=${DIV_NAMES[v]}
                @click=${() => setFlag({ division: v })}
              >
                ${customFlag(
                  { ...d.flag, division: v, charge: "none" },
                  "cq-flag sm",
                )}
              </button>`,
          )}
        </div>
      </div>
      <div class="cq-field">
        <span>Second colour</span>${swatches(
          d.flag.second,
          (c) => setFlag({ second: c }),
          "Second colour",
        )}
      </div>
      <div class="cq-field">
        <span>Charge</span>
        <div class="cq-flag-divs">
          ${CHARGE_LIST.filter((c) => c in CHARGES).map(
            (c) =>
              html`<button
                class="cq-flag-opt ${d.flag.charge === c ? "on" : ""}"
                title=${CHARGES[c]}
                @click=${() => setFlag({ charge: c })}
              >
                ${customFlag(
                  { ...d.flag, division: "plain", charge: c },
                  "cq-flag sm",
                )}
              </button>`,
          )}
        </div>
      </div>
      <div class="cq-field">
        <span>Charge colour</span>${swatches(
          d.flag.chargeColor,
          (c) => setFlag({ chargeColor: c }),
          "Charge colour",
        )}
      </div>
    </div>
    <h3 class="cq-h3">Its government</h3>
    <div class="cq-gov-forms">
      ${(Object.keys(GOV_FORMS) as GovForm[]).map(
        (k) =>
          html`<button
            class="cq-gov-form ${d.form === k ? "on" : ""}"
            @click=${() => set({ form: k })}
          >
            <b>${GOV_FORMS[k].name}</b>
            <span class="small">${GOV_FORMS[k].text}</span>
            <span class="cq-muted small"
              >Its head: ${GOV_FORMS[k].ruler[me.female ? 1 : 0]}</span
            >
          </button>`,
      )}
    </div>
    <div class="cq-host-row">
      <label class="cq-field">
        <span>Capital</span>
        <select
          @change=${(e: Event) =>
            set({ capital: Number((e.target as HTMLSelectElement).value) })}
        >
          ${provs.map(
            (p) =>
              html`<option value=${p} ?selected=${p === d.capital}>
                ${ui.map.provinces[p].name}
              </option>`,
          )}
        </select>
      </label>
      ${!n.independent && n.kind === "power"
        ? html`<label class="cq-check">
            <input
              type="checkbox"
              .checked=${d.free}
              @change=${() => set({ free: !d.free })}
            />
            Break with the crown: declare independence (the crown will send
            armies)
          </label>`
        : nothing}
    </div>
    <h3 class="cq-h3">The first officers</h3>
    <div class="cq-first-officers">
      ${SEATS.map(
        (seat) =>
          html`<label class="cq-field">
            <span>${SEAT_NAMES[seat]}</span>
            <select
              @change=${(e: Event) => {
                const v = Number((e.target as HTMLSelectElement).value);
                set({ offices: { ...d.offices, [seat]: v } });
              }}
            >
              <option value="-1">
                ${s.chars[n.council[seat]]?.alive
                  ? `Keep ${charName(s.chars[n.council[seat]])}`
                  : "Leave it empty"}
              </option>
              ${officers.map(
                (c) =>
                  html`<option
                    value=${c.id}
                    ?selected=${d.offices[seat] === c.id}
                  >
                    ${charName(c)}
                  </option>`,
              )}
            </select>
          </label>`,
      )}
    </div>
    <p class="cq-muted small">
      ${n.name} in the world now: ${flagFor(n, "cq-flag sm")}
      ${nationName(n.name)}.
    </p>
    <div class="cq-btnrow end">
      ${action(
        "Proclaim it",
        check,
        async () => {
          if (
            await ui.cmd({
              k: "society",
              act: "constitute",
              name: d.name,
              adjective: d.adjective,
              color: d.color,
              flag: d.flag,
              gov: d.form,
              p: d.capital,
              offices: d.offices,
              free: d.free,
            })
          ) {
            play("victory");
            ui.modal(null);
          }
        },
        "primary big",
      )}
      <button class="cq-btn quiet" @click=${() => ui.modal(null)}>Later</button>
    </div>
  </div>`;
}
