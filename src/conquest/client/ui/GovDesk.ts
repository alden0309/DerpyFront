// GOV (r21): the governor's desk on Society › Office (below the old levers):
// the customs duties, a building programme, native affairs (a treaty
// council, the Indian trade licensed), the militia (musters, ranging
// companies), courts and pardons, the matters that come to the desk,
// expeditions at the treasury's charge and petitions for grants, and the
// question of independence (the quarrel with the crown, how the house would
// divide, the war's estimate and which counties may hold for the King). For
// every player of a colony at war with its crown: their side. Every figure
// comes from the engine's own reckoning (GovDesk.ts, Revolution.ts).

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import { expedOf } from "../../engine/ExpedCore";
import { rangersTurn } from "../../engine/Expeditions";
import {
  COUNCIL,
  councilCheck,
  deskView,
  DUTIES,
  DUTY_REST,
  DUTY_USUAL,
  dutyCheck,
  governedBy,
  LICENCE,
  MUSTERS,
  nativeNeighbours,
  prisoners,
  PROG_BY_KEY,
  PROG_EVERY,
  progCheck,
  progLeft,
  progNext,
  PROGRAMMES,
  RANGERS,
} from "../../engine/GovDesk";
import { chanceWords } from "../../engine/Odds";
import {
  atWar,
  buildCost,
  provincesOf,
  relationOf,
} from "../../engine/Queries";
import {
  holdOdds,
  motionCheck,
  quarrel,
  REV,
  revDivision,
  warOdds,
} from "../../engine/Revolution";
import type { ModFx } from "../../engine/Types";
import { BUILDING_LABELS, nationName } from "../Text";
import { num } from "../Tip";
import {
  action,
  breakdownTip,
  charLink,
  GameUi,
  more,
  nationLink,
  provLink,
  section,
} from "./Context";
import { term } from "./Terms";

const pct = (p: number) => `${Math.round(p * 100)}%`;
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;

/** A mod's effects in words: "taxes −6%, trade +4%, favour −3". */
function fxWords(fx: Partial<Record<ModFx, number>>): string {
  const out: string[] = [];
  const name: Partial<Record<ModFx, string>> = {
    tax: "taxes",
    production: "trade and work",
    favor: "the crown's favour",
    unrest: "unrest",
    disease: "sickness",
    admin: "administration",
  };
  for (const [k, v] of Object.entries(fx) as [ModFx, number][]) {
    if (!v) continue;
    const pctFx = k === "tax" || k === "production" || k === "disease";
    out.push(
      `${name[k] ?? k} ${pctFx ? `${signed(Math.round(v * 100))}%` : signed(v)}`,
    );
  }
  return out.length ? out.join(", ") : "nothing changes";
}

const desk = (ui: GameUi, cmd: Record<string, unknown>) =>
  void ui.cmd({ k: "desk", ...cmd } as never);

// ---------------------------------------------------------------- the desk

export function deskSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  if (!life) return nothing;
  const n = governedBy(s, life);
  if (n < 0) return nothing;
  const d = deskView(s, n);
  return html`${section(
    html`The governor's desk
    ${num(
      "?",
      () => ({
        title: "The governor's desk",
        notes: [
          "Levers that wait on your word month by month, besides the ones above: what each does is on it. A matter comes to the desk every month or two as a scene (in Journal › Diary, what waits on you).",
        ],
      }),
      "cq-term-mark",
    )}`,
    html`${dutiesBlock(ui, n)} ${progBlock(ui, n)} ${nativesBlock(ui, n)}
      ${militiaBlock(ui, n)} ${courtsBlock(ui, n)}
      <p class="cq-muted small">
        ${d.nextMatter && d.nextMatter > s.day
          ? `The next matter for the desk comes about ${formatDate(d.nextMatter)}.`
          : "A matter for the desk comes every month or two."}
        Expeditions at the treasury's charge, and petitions for grants: Work ›
        Expeditions.
        ${expedOf(s).asks.filter((a) => a.n === n && a.stage === "asked").length
          ? html`<b
              >${expedOf(s).asks.filter((a) => a.n === n && a.stage === "asked")
                .length}
              petition(s) waiting.</b
            >`
          : nothing}
      </p>`,
  )}
  ${revSection(ui, n)}`;
}

function dutiesBlock(ui: GameUi, n: number): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const d = deskView(s, n);
  const now = d.duty ?? DUTY_USUAL;
  const next = (d.dutyAt ?? -Infinity) + DUTY_REST;
  return html`<div class="cq-lever">
    <span class="cq-lever-label">Customs duties</span>
    <div class="cq-seg" role="radiogroup" aria-label="Customs duties">
      ${DUTIES.map(
        (x, i) =>
          html`<button
            role="radio"
            aria-checked=${now === i}
            title=${`${x.text} (${fxWords(x.fx)})`}
            ?disabled=${now !== i && !dutyCheck(s, life, i).ok}
            @click=${() => desk(ui, { act: "duty", level: i })}
          >
            ${x.name}
          </button>`,
      )}
    </div>
    <p class="cq-muted small">
      ${DUTIES[now].name}:
      ${fxWords(DUTIES[now].fx)}.${DUTIES[now].merchants
        ? ` The merchants ${DUTIES[now].merchants > 0 ? "like you for it" : "don't"}.`
        : ""}
      ${next > s.day ? ` Changed again from ${formatDate(next)}.` : ""}
    </p>
  </div>`;
}

function progBlock(ui: GameUi, n: number): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const d = deskView(s, n);
  const p = d.prog;
  if (p) {
    const def = PROG_BY_KEY.get(p.key);
    const at = progNext(s, ui.w, n, p.key);
    return html`<div class="cq-lever">
      <span class="cq-lever-label">A building programme</span>
      <p class="small">
        <b>${def?.name}</b>, to ${formatDate(p.until)}: ${p.built.length} built
        (${p.built.map((q) => ui.map.provinces[q]?.name).join(", ") ||
        "none yet"}).
        ${at.p >= 0
          ? html`Next, about ${formatDate(Math.max(s.day, p.next))}:
            ${provLink(ui, at.p)}.`
          : html`<span class="cq-muted">Waiting: ${at.why}</span>`}
      </p>
      <button
        class="cq-btn quiet small"
        @click=${() => desk(ui, { act: "prog", key: null })}
      >
        End it
      </button>
    </div>`;
  }
  return html`<div class="cq-lever">
    <span class="cq-lever-label">A building programme</span>
    ${more(
      "Begin one",
      html`<ul class="cq-list small">
        ${PROGRAMMES.map((x) => {
          const left = progLeft(s, ui.w, n, x.key);
          const cost = buildCost(x.b, 0);
          return html`<li>
            <b>${x.name}</b> (${x.years} years): ${x.text}
            <span class="cq-muted"
              >${left.length}
              ${left.length === 1 ? "county wants one" : "counties want one"};
              each ${BUILDING_LABELS[x.b].toLowerCase()} about ${cost.gold} gold
              from the treasury, one each ${Math.round(PROG_EVERY / 30)}
              months.</span
            >
            ${action(
              "Begin",
              progCheck(s, ui.w, life, x.key),
              () => desk(ui, { act: "prog", key: x.key }),
              "small",
            )}
          </li>`;
        })}
      </ul>`,
    )}
  </div>`;
}

function nativesBlock(ui: GameUi, n: number): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const os = nativeNeighbours(s, ui.w, n);
  const d = deskView(s, n);
  if (!os.length) return nothing;
  return html`<div class="cq-lever">
    <span class="cq-lever-label">Native affairs</span>
    <ul class="cq-list small">
      ${os.map((o) => {
        const rel = relationOf(s, ui.w, o, n);
        const last = d.councils?.[o];
        return html`<li>
          ${nationLink(ui, o)}:
          ${num(
            `${rel.total > 0 ? "+" : rel.total < 0 ? "−" : ""}${Math.abs(rel.total)}`,
            () =>
              breakdownTip(
                `What the ${nationName(s.nations[o].name)} think of the colony`,
                rel,
              ),
          )}
          ${atWar(s, n, o)
            ? html`<span class="cq-chip bad">at war</span>`
            : nothing}
          ${action(
            html`A treaty council<span class="cq-chip"
                >${COUNCIL.gold} gold</span
              >`,
            councilCheck(s, ui.w, life, o),
            () => desk(ui, { act: "council", n: o }),
            "small",
            undefined,
            false,
          )}
          ${last
            ? html`<span class="cq-muted">last ${formatDate(last)}</span>`
            : nothing}
        </li>`;
      })}
    </ul>
    <label class="cq-check small">
      <input
        type="checkbox"
        .checked=${!!d.licence}
        @change=${() => desk(ui, { act: "licence", on: !d.licence })}
      />
      License and bond the Indian traders: the nations think better of the
      colony (+${LICENCE.regard}, renewed each January); ${fxWords(LICENCE.fx)}.
    </label>
  </div>`;
}

function militiaBlock(ui: GameUi, n: number): TemplateResult {
  const s = ui.s;
  const d = deskView(s, n);
  const m = d.musters ?? 0;
  const r = d.rangers ?? 0;
  return html`<div class="cq-lever">
    <span class="cq-lever-label">The militia</span>
    <div class="cq-seg" role="radiogroup" aria-label="Musters">
      ${MUSTERS.map(
        (x, i) =>
          html`<button
            role="radio"
            aria-checked=${m === i}
            title=${`${x.gold} gold a month; recruits' spirit +${Math.round(x.morale * 100)}%; ${fxWords(x.fx)}`}
            @click=${() => desk(ui, { act: "musters", level: i })}
          >
            ${x.name}
          </button>`,
      )}
    </div>
    <p class="cq-muted small">
      ${MUSTERS[m].gold
        ? `${MUSTERS[m].gold} gold a month from the treasury; `
        : ""}militia
      raised come out
      ${m
        ? `${Math.round(MUSTERS[m].morale * 100)}% steadier`
        : "green"}${MUSTERS[m].gold ? `; ${fxWords(MUSTERS[m].fx)}` : ""}.
    </p>
    <div class="cq-btnrow">
      <span class="small">Ranging companies on the frontier: <b>${r}</b></span>
      <button
        class="cq-btn small"
        ?disabled=${r <= 0}
        @click=${() => desk(ui, { act: "rangers", level: r - 1 })}
      >
        −
      </button>
      <button
        class="cq-btn small"
        ?disabled=${r >= RANGERS.max}
        @click=${() => desk(ui, { act: "rangers", level: r + 1 })}
      >
        +<span class="cq-chip">${RANGERS.gold} gold a month</span>
      </button>
    </div>
    <p class="cq-muted small">
      A war party coming over the frontier is met and turned
      ${chanceWords(rangersTurn(s, n))} of the
      time${r ? ` (${r * RANGERS.gold} gold a month)` : ""}.
    </p>
  </div>`;
}

function courtsBlock(ui: GameUi, n: number): TemplateResult {
  const s = ui.s;
  const list = prisoners(s, n);
  return html`<div class="cq-lever">
    <span class="cq-lever-label">Courts and pardons</span>
    ${list.length
      ? html`<ul class="cq-list small">
          ${list.map(
            (l) =>
              html`<li>
                ${charLink(ui, s.chars[l.c])}: ${l.crime!.jail!.charge}
                (${l.crime!.jail!.trial
                  ? "awaiting trial"
                  : `in the gaol to ${formatDate(l.crime!.jail!.until)}`})
                <button
                  class="cq-btn small"
                  @click=${() => desk(ui, { act: "pardon", seat: l.seat })}
                >
                  Pardon
                </button>
                <button
                  class="cq-btn quiet small"
                  @click=${() => desk(ui, { act: "commute", seat: l.seat })}
                >
                  Commute
                </button>
              </li>`,
          )}
        </ul>`
      : html`<p class="cq-muted small">
          No player lies in the colony's gaols. Pleas for the mercy of others
          come to the desk as matters.
        </p>`}
  </div>`;
}

// ---------------------------------------------------------------- the question of independence

function revSection(ui: GameUi, n: number): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const nation = s.nations[n];
  if (nation.independent) return nothing;
  const d = deskView(s, n);
  if (nation.rebelling)
    return section(
      html`${term("independence", "The war with the crown")}`,
      html`<p class="small">
          The colony declared itself free ${d.rev ? formatDate(d.rev.day) : ""}.
          ${nation.rebellion
            ? html`The crown has sent ${nation.rebellion.expeditions}
              ${nation.rebellion.expeditions === 1 ? "army" : "armies"}
              (${nation.rebellion.beaten} beaten). Hold out to
              ${formatDate(nation.rebellion.since + 8 * 365)}, or beat three of
              them, and it's won; lose the capital for half a year and it's
              crushed.`
            : nothing}
        </p>
        ${d.rev?.holds.length
          ? html`<p class="small">
              Held for the King:
              ${d.rev.holds.map(
                (p, i) => html`${i ? ", " : ""}${provLink(ui, p)}`,
              )}.
            </p>`
          : nothing}`,
    );
  const m = d.motion;
  const q = quarrel(s, n);
  const war = warOdds(s, ui.w, n);
  const div = m
    ? revDivision(s, n, m.by, m.salt, m.votes)
    : revDivision(s, n, life.c, s.day & 0xffff, {});
  const check = motionCheck(s, life);
  const holds = provincesOf(s, n)
    .filter((p) => p !== nation.capital)
    .map((p) => ({ p, o: holdOdds(s, ui.w, n, p) }))
    .filter((x) => x.o.total >= 0.1)
    .sort((a, b) => b.o.total - a.o.total)
    .slice(0, 6);
  return section(
    "Breaking with the crown",
    html`<p class="small">
        Put it to the house:
        <i>that this colony is, and of right ought to be, free</i>. If most of
        those voting agree, you may declare it, and the crown will send its
        armies. The colony's quarrel with the crown:
        ${num(signed(q.total), () =>
          breakdownTip(
            "The colony's quarrel with the crown (each member leans by it)",
            q,
          ),
        )}.
      </p>
      ${m && !m.result
        ? html`<p class="cq-callout small">
            The house is debating it; it divides ${formatDate(m.divides)}. As
            they lean: about <b>${div.ayes}</b> for and <b>${div.noes}</b>
            against${div.undecided
              ? `, ${div.undecided} not yet declared`
              : ""}.
          </p>`
        : m?.result?.carried
          ? html`<div class="cq-callout lit small">
              The house carried it, ${m.result.ayes} to ${m.result.noes}.
              <div class="cq-btnrow">
                <button
                  class="cq-btn danger small"
                  @click=${() =>
                    confirm(
                      "Declare the colony free? It means war with the crown.",
                    ) && desk(ui, { act: "declare", on: true })}
                >
                  Declare it
                </button>
                <button
                  class="cq-btn quiet small"
                  @click=${() => desk(ui, { act: "declare", on: false })}
                >
                  Let it lie
                </button>
              </div>
            </div>`
          : html`<p class="small">
              If you put it now, the house would divide about
              <b>${div.ayes}</b> for and
              <b>${div.noes}</b> against${div.undecided
                ? ` (${div.undecided} players vote for themselves)`
                : ""}:
              ${div.ayes > div.noes + div.undecided
                ? "carried"
                : div.ayes + div.undecided > div.noes
                  ? "too close to call"
                  : "lost"}.
              Lost, London hears of it (favour ${REV.lostFavor} for
              ${REV.lostYears} years, a grievance against you).
            </p>`}
      ${more(
        "If it comes to war",
        html`<p class="small">
            The colony's chance against the crown, as it stands:
            ${num(chanceWords(war.total), () =>
              breakdownTip(
                "An estimate: the war decides it",
                war,
                (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)} in 100`,
                [`About ${pct(war.total)}.`],
              ),
            )}
            (an estimate: the armies decide it). Won: the colony is free and you
            frame its government. Crushed: you hang, and the patriots are
            hunted. The crown's own regiments in the colony go over to it at
            once.
          </p>
          ${holds.length
            ? html`<p class="small">Counties that may hold for the King:</p>
                <ul class="cq-list small">
                  ${holds.map(
                    (x) =>
                      html`<li>
                        ${provLink(ui, x.p)}:
                        ${num(chanceWords(x.o.total), () =>
                          breakdownTip(
                            "Would it hold for the King?",
                            x.o,
                            (v) =>
                              `${v > 0 ? "+" : ""}${Math.round(v * 100)} in 100`,
                          ),
                        )}
                      </li>`,
                  )}
                </ul>`
            : nothing}`,
      )}
      ${!m || m.result
        ? html`<div class="cq-btnrow">
            ${action(
              "Put the question to the house",
              check,
              () =>
                confirm(
                  "Put the question of independence to the house? London will hear of it either way.",
                ) && desk(ui, { act: "motion" }),
              "danger small",
            )}
          </div>`
        : nothing}`,
  );
}

/** For every player of a colony at war with its crown (not its governor): the war, and their side. */
export function revSideSection(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  if (!life || !me) return nothing;
  const nation = s.nations[me.nation];
  const rev = nation?.desk?.rev;
  if (!nation?.rebelling || !rev || governedBy(s, life) === me.nation)
    return nothing;
  const side = rev.sides[life.seat];
  return section(
    "The colony breaks with the crown",
    html`<p class="small">
        ${charLink(ui, s.chars[rev.by])} declared ${nationName(nation.name)}
        free ${formatDate(rev.day)}.
        ${side
          ? html`You stand
              <b
                >${side === "patriot"
                  ? "with the patriots"
                  : side === "loyal"
                    ? "with the King"
                    : "with neither"}</b
              >.`
          : "You haven't said where you stand."}
      </p>
      <div class="cq-btnrow">
        <button
          class="cq-btn small"
          ?disabled=${side === "patriot"}
          @click=${() => desk(ui, { act: "side", arg: "patriot" })}
        >
          With the patriots
        </button>
        <button
          class="cq-btn small"
          ?disabled=${side === "loyal"}
          @click=${() => desk(ui, { act: "side", arg: "loyal" })}
        >
          With the King
        </button>
        <button
          class="cq-btn quiet small"
          ?disabled=${side === "neutral"}
          @click=${() => desk(ui, { act: "side", arg: "neutral" })}
        >
          Neither
        </button>
      </div>
      <p class="cq-muted small">
        Won: patriots renown +${REV.wonRenown}; the King's friends lose a third
        of their purse. Crushed: the patriots are hunted (the law's heat
        +${REV.crushedHeat}, favour ${REV.crushedFavour}); the King's friends
        are rewarded (favour +${REV.loyalWonFavour}).
      </p>`,
  );
}
