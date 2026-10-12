// CHAMBER (r16): Society › Council's new parts. The factions (the two
// parties and the four interests, by the colony's own names) with their
// members at the table and in the house, and what each thinks of you and
// why; who cares which way about each matter before the council; the
// assembly's session this year (its question, how the house leans, your
// stand, what it carried); and your seat's work still to come to something,
// and what it came to.

import { html, nothing, TemplateResult } from "lit";
import { formatDate, formatMonth } from "../../engine/Calendar";
import { measureCares } from "../../engine/Council";
import "../../engine/Docket"; // the council's wider business, for its leanings
import {
  FACTION_KEYS,
  FACTION_WANTS,
  factionMembers,
  factionName,
  hasFactions,
  MARK_CAP,
  OPINION_PER_MARK,
  partyOf,
  standWith,
} from "../../engine/Factions";
import { LATER, pendingWords } from "../../engine/Later";
import {
  broughtOver,
  divisionNow,
  nextSessionDay,
  QUESTION_BY_KEY,
  speechOf,
  wouldBring,
} from "../../engine/Session";
import type { CouncilMatter, FactionKey } from "../../engine/Types";
import { num } from "../Tip";
import { GameUi, more, section } from "./Context";
import { termMark } from "./Terms";

const up = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** A meter from −40 to 40: red to the left of the middle, green to the right. */
function regard(v: number): TemplateResult {
  const f = Math.max(-1, Math.min(1, v / MARK_CAP));
  const w = Math.round(Math.abs(f) * 50);
  return html`<span class="cq-regard" aria-hidden="true"
    ><span
      class=${f >= 0 ? "up" : "down"}
      style=${f >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`}
    ></span
  ></span>`;
}

/** Society › Council: the factions, and what each thinks of you. */
export function factionsSection(
  ui: GameUi,
  n: number,
): TemplateResult | typeof nothing {
  const s = ui.s;
  if (!hasFactions(s, n)) return nothing;
  const life = ui.life!;
  const members = factionMembers(s, n);
  const mine = partyOf(s, n, life.c);
  return section(
    "The factions",
    html`<p class="small">
        Everyone in the colony's politics belongs to a party and an interest.
        They remember how you vote in council and where you stand at the
        session, and think the better or the worse of you for
        it.${mine
          ? html` You're counted with <b>${factionName(s, n, mine)}</b>.`
          : nothing}
      </p>
      <ul class="cq-factions">
        ${FACTION_KEYS.map((f) => {
          const m = standWith(s, n, life.c, f);
          const v = m?.v ?? 0;
          const at = members[f].length;
          const eff = Math.round(v * OPINION_PER_MARK);
          return html`<li class="cq-faction ${f}">
            <div class="cq-faction-head">
              <b>${up(factionName(s, n, f))}</b>
              <span class="cq-muted small"
                >${f === "court" || f === "country" ? "a party" : "an interest"}
                · ${at} in the colony's politics</span
              >
            </div>
            <p class="small cq-faction-wants">${FACTION_WANTS[f]}</p>
            <div class="cq-faction-regard">
              ${regard(v)}
              ${num(
                v === 0
                  ? "no view of you"
                  : `${v > 0 ? "+" : ""}${Math.round(v)}`,
                () => ({
                  title: `What ${factionName(s, n, f)} remember`,
                  notes: [
                    ...(m?.why ?? [])
                      .slice()
                      .reverse()
                      .map((x) => `${x.v > 0 ? "+" : ""}${x.v}: ${x.t}`),
                    `Their members think ${eff > 0 ? `${eff} better` : eff < 0 ? `${-eff} worse` : "no differently"} of you for it (a quarter of their regard, at most 10 either way).`,
                    "It fades by a fifth each January.",
                  ],
                }),
                `cq-faction-v ${v > 0 ? "good" : v < 0 ? "bad" : ""}`,
              )}
            </div>
            ${m?.why.length
              ? html`<p class="cq-faction-why small">
                  ${m.why
                    .slice(-2)
                    .reverse()
                    .map((x) => x.t)
                    .join("; ")}
                </p>`
              : nothing}
          </li>`;
        })}
      </ul>`,
    termMark("faction"),
  );
}

/** Who cares which way about a matter: chips for the interests. */
export function caresChips(
  ui: GameUi,
  n: number,
  m: CouncilMatter,
): TemplateResult | typeof nothing {
  const s = ui.s;
  if (!hasFactions(s, n)) return nothing;
  const cares = Object.entries(measureCares(m.key)).filter(
    ([f, v]) => v && f !== "court" && f !== "country",
  ) as [FactionKey, number][];
  if (!cares.length) return nothing;
  return html`<span class="cq-cares small">
    ${cares.map(
      ([f, v]) =>
        html`<span class="cq-care ${v > 0 ? "for" : "against"}"
          >${factionName(s, n, f)} ${v > 0 ? "for" : "against"}</span
        >`,
    )}
  </span>`;
}

/** Society › Council: the assembly's session this year. */
export function sessionSection(
  ui: GameUi,
  n: number,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const pol = s.polities[n];
  if (!pol || s.nations[n]?.kind !== "power") return nothing;
  const life = ui.life!;
  const sess = s.power?.cabinets[n]?.session;
  const q = sess && QUESTION_BY_KEY.get(sess.key);
  const house = pol.name.replace(/^the /, "The ");
  const next = nextSessionDay(s);
  const waiting = life.events.find(
    (e) => e.key === "session-sits" && e.ctx.id === sess?.id,
  );
  if (!sess || !q)
    return section(
      "The session",
      html`<p class="small">
        ${house} sits each spring on the year's great question: supply, the
        governor's salary, bills of credit, the frontier's petitions and the
        like. Members and councillors who are players are asked where they
        stand. The next session opens on ${formatDate(next)}.
      </p>`,
      termMark("session"),
    );
  const g = { s, map: ui.map };
  const open = sess.carried === undefined;
  const votes = open ? divisionNow(s, n, sess) : (sess.votes ?? [0, 0, 0]);
  const mine = sess.stands[life.c];
  // While you can still speak: what a good speech for each choice would bring over.
  const canSpeak = open && !!waiting;
  const sp = speechOf(s, n, life);
  const bring = canSpeak
    ? q.choices.map((_, i) => wouldBring(s, n, sess, life, i).good)
    : null;
  return section(
    html`The session of ${sess.year}`,
    html`<div class="cq-session ${open ? "open" : "done"}">
      <p class="cq-session-q">
        <b>${q.title(g, n, sess.arg)}</b>
        <span class="cq-muted small"
          >${house} ·
          ${open
            ? html`divides ${formatDate(sess.until)}`
            : html`divided ${formatDate(sess.until)}`}</span
        >
      </p>
      <p class="small">${q.body(g, n, sess.arg)}</p>
      <ul class="cq-session-votes">
        ${q.choices.map((c, i) => {
          const total = Math.max(1, votes[0] + votes[1] + votes[2]);
          const won = !open && sess.carried === i;
          return html`<li class=${won ? "won" : ""}>
            <span class="cq-session-label"
              >${up(c.short)}${mine === i
                ? html` <span class="cq-chip good">your stand</span>`
                : nothing}${won
                ? html` <span class="cq-chip gold">carried</span>`
                : nothing}</span
            >
            <span class="cq-session-bar" aria-hidden="true"
              ><span
                style="width:${Math.round((votes[i] / total) * 100)}%"
              ></span
            ></span>
            <span class="cq-session-n">${votes[i]}</span>
            ${bring
              ? html`<span class="cq-session-bring cq-muted small"
                  >${bring[i]
                    ? `a good speech from you: ${bring[i]} more`
                    : "a speech wouldn't move anyone"}</span
                >`
              : nothing}
          </li>`;
        })}
      </ul>
      ${open
        ? html`<p class="cq-muted small">
            As the house leans now, with the members speeches have brought over.
            ${waiting
              ? html`<button
                  class="cq-btn small primary"
                  @click=${() => ui.modal({ k: "event", id: waiting.id })}
                >
                  Say where you stand
                </button>`
              : mine === undefined
                ? html`Players who sit in the house or on the council are asked
                  where they stand.`
                : mine < 0
                  ? "You've kept your counsel."
                  : html`You spoke for ${q.choices[mine].short}, and brought
                    ${broughtOver(s, n, sess, life.c)} over.`}
            ${canSpeak
              ? html`Your speech lands ${Math.round(sp.chance * 100)} times in
                100 (persuasion), and brings over the members who lean only a
                little the other way.`
              : nothing}
          </p>`
        : html`<p class="small"><i>${sess.text}</i></p>
            <p class="cq-muted small">
              ${mine === undefined
                ? "You had no part in it."
                : mine < 0
                  ? "You stood aside."
                  : mine === sess.carried
                    ? `You spoke for ${q.choices[mine].short}, and your side carried it.`
                    : `You spoke for ${q.choices[mine].short}, and lost.`}
              The next session opens on ${formatDate(next)}.
            </p>`}
    </div>`,
    termMark("session"),
  );
}

/** Your seat's work still to come to something, and what it came to. */
export function laterSection(
  ui: GameUi,
  n: number,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const line = new Set(life.line);
  const all = (s.power?.cabinets[n]?.later ?? []).filter((w) => line.has(w.by));
  if (!all.length) return nothing;
  const g = { s, map: ui.map };
  const pending = all.filter((w) => w.text === undefined);
  const came = all.filter((w) => w.text).reverse();
  return section(
    "What your work comes to",
    html`${pending.length
      ? html`<ul class="cq-later">
          ${pending.map(
            (w) =>
              html`<li class="pending">
                <span>${up(pendingWords(g, n, w))}</span>
                <span class="cq-muted small">about ${formatMonth(w.due)}</span>
              </li>`,
          )}
        </ul>`
      : nothing}
    ${came.length
      ? more(
          `What it came to (${came.length})`,
          html`<ul class="cq-later">
            ${came.map(
              (w) =>
                html`<li class=${w.tone ?? ""}>
                  <span>${w.text}</span>
                  <span class="cq-muted small">${formatMonth(w.due)}</span>
                </li>`,
            )}
          </ul>`,
          !pending.length,
        )
      : nothing}`,
  );
}

/** A seat power whose work comes to something later: its chip. */
export function laterChip(key: string): TemplateResult | typeof nothing {
  const d = LATER[key];
  if (!d) return nothing;
  return html`<span
    class="cq-chip"
    title="What it comes to arrives some ${Math.round(
      d.days[0] / 30,
    )} to ${Math.round(
      d.days[1] / 30,
    )} months later, in your journal and on this page."
    >comes to something later</span
  >`;
}
