// EDU (r13): the children's schooling. On You › Family each child has a card
// with what they're at (a chip, the year of the course, what they've
// learned, the latest letter from away, an apprentice's indenture drawn as
// the period document) and a Choose… button that opens their future: a
// school, a trade (a master in your town or one you know) or a college,
// each saying where, with whom, what it costs and why it can't be had. Home
// shows the same at a glance; the family tree wears it on each card.

import { html, nothing, TemplateResult } from "lit";
import { dateOf, formatDate } from "../../engine/Calendar";
import {
  callingOffers,
  callingsFor,
  collegeOffers,
  coursesAt,
  cultureOfTown,
  eduChipText,
  type EduOffer,
  eduStatus,
  inYourCare,
  kinCheck,
  learnedLine,
  lettersFrom,
  lettersOf,
  nowOf,
  pathOffers,
  schoolable,
  schoolOffers,
} from "../../engine/Edu";
import {
  CALLING_BY_KEY,
  COLLEGE_BY_KEY,
  COLLEGE_RANKS,
  type Course,
  COURSES,
  type Gains,
  INDENTURE_NAME,
  PATH_BY_KEY,
  SCHOOL_BY_KEY,
} from "../../engine/EduData";
import { isChildLife, isNativeChar, meOf } from "../../engine/LifeQueries";
import { JOBS, SKILL_NAMES } from "../../engine/LifeRules";
import { ordinalWord } from "../../engine/Ordinal"; // LIFE (r21)
import { ageOf, charName, yearOf } from "../../engine/Queries";
import type {
  Character,
  EduCommand,
  EduDone,
  EduNow,
  Letter,
} from "../../engine/Types";
import { play } from "../Sound";
import { bar, charLink, GameUi, token } from "./Context";
import { price } from "./Price"; // LEDGER (r15)
import { curly } from "./Scene";

// ---------------------------------------------------------------- doing it

type EduAct = Omit<EduCommand, "k">;

async function edu(ui: GameUi, c: EduAct): Promise<void> {
  if (await ui.cmd({ k: "edu", ...c })) {
    play(c.act === "home" ? "paper" : c.act === "school" ? "coins" : "seal");
    ui.modal({ k: "outcome" });
  }
}

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const his = (c: Character) => (c.female ? "her" : "his");
const him = (c: Character) => (c.female ? "her" : "him");
const childWord = (c: Character) => (c.female ? "daughter" : "son");
const num = (v: number) => String(Math.round(v * 100) / 100);

/** "letters +3.5, persuasion +0.5". */
function gains(g: Gains): string {
  return Object.entries(g)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(
      ([k, v]) =>
        `${lower(SKILL_NAMES[k as keyof typeof SKILL_NAMES])} +${num(v ?? 0)}`,
    )
    .join(", ");
}

// ---------------------------------------------------------------- chips and badges

/** The chip for a child's schooling, beside their name (or nothing). */
export function eduChip(c: Character): TemplateResult | typeof nothing {
  if (!c.alive) return nothing;
  const t = eduChipText(c);
  if (!t) return nothing;
  const now = nowOf(c);
  return html`<span
    class="cq-chip cq-edu-chip ${now ? (now.mood <= -1 ? "bad" : "") : "gold"}"
    title=${t}
    >${t}</span
  >`;
}

/** A few words for the family tree's card: "At Harvard", "Apprentice cooper". */
export function eduBadgeText(c: Character): string | null {
  if (!c.alive) return null;
  const fit = (long: string, short: string) =>
    long.length <= 18 ? long : short;
  const now = nowOf(c);
  if (now)
    switch (now.kind) {
      case "school":
        return now.key === "tutor"
          ? "With a tutor"
          : now.key === "convent"
            ? "Convent school"
            : now.key === "mission"
              ? "Mission school"
              : now.key === "dame"
                ? "Dame school"
                : "At school";
      case "apprentice":
        return fit(
          `Apprentice ${lower(CALLING_BY_KEY.get(now.key)?.name ?? "")}`.trim(),
          "Apprentice",
        );
      case "college":
        return fit(
          `At ${COLLEGE_BY_KEY.get(now.key)?.short ?? "college"}`,
          "At college",
        );
      case "path":
        return "Learning";
    }
  const e = c.edu;
  if (e?.degree)
    return fit(`${COLLEGE_BY_KEY.get(e.degree)?.short ?? ""} man`, "Graduate");
  const t = eduChipText(c);
  return t ? fit(t, t.split(" ")[0]) : null;
}

/** The badge on a family tree card. */
export function eduKinBadge(c: Character): TemplateResult | typeof nothing {
  const t = eduBadgeText(c);
  if (!t) return nothing;
  return html`<span class="cq-kin-edu ${nowOf(c) ? "now" : "done"}" title=${t}
    >${t}</span
  >`;
}

// ---------------------------------------------------------------- the section on You › Family

/** Which children's folds (the indenture, the letter) are open. */
const folds = new Map<string, boolean>();

function fold(
  key: string,
  title: string | TemplateResult,
  body: TemplateResult,
  cls = "",
): TemplateResult {
  return html`<details
    class="cq-sch-fold ${cls}"
    ?open=${folds.get(key) ?? false}
    @toggle=${(e: Event) =>
      folds.set(key, (e.currentTarget as HTMLDetailsElement).open)}
  >
    <summary>${title}</summary>
    <div class="cq-sch-fold-body">${body}</div>
  </details>`;
}

/** Open a child's fold (for a link from elsewhere, and the screenshots). */
export function openEduFold(key: string): void {
  folds.set(key, true);
}

export function schoolingSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const kids = schoolable(s, life);
  const grown = isChildLife(s, life);
  const body = kids.length
    ? html`<div class="cq-sch-list">${kids.map((k) => childCard(ui, k))}</div>`
    : html`<p class="cq-empty small">
        ${meOf(s, life)?.children.length
          ? "Your children are grown and gone their own ways."
          : "No children yet. When they come: a dame school from four, a grammar school or a tutor, a trade at twelve or so, college at fifteen."}
      </p>`;
  return html`<section class="cq-section cq-sch-section">
    <h3 class="cq-h3">
      Schooling and trades
      <span class="cq-muted small"
        >${kids.length} ${kids.length === 1 ? "child" : "children"}</span
      >
    </h3>
    ${grown
      ? html`<p class="cq-muted small">
          Until you're sixteen your guardians decide these things.
        </p>`
      : nothing}
    ${body}
    <p class="cq-muted small cq-sch-foot">
      Choose… beside a child: a school, a trade (bound to a master of a town) or
      a college. What they learn stays with them, and an heir starts with it.
      The bills are in the month's budget (Estate › Purse).
    </p>
  </section>`;
}

/** What a child is doing when they're at nothing. */
function idleLine(ui: GameUi, c: Character): string {
  const s = ui.s;
  const age = ageOf(s, c);
  const native = isNativeChar(s, c);
  if (age < 4) return "Too young for school yet.";
  if (c.spouse >= 0) return "Married, and their own master now.";
  if (native)
    return age <= 14
      ? "At home with the family: no path chosen yet."
      : "Grown, or nearly: past the children's paths.";
  if (age <= 11) return "At home: no school chosen yet.";
  if (age <= 16) return "At home: old enough for a trade, or college later.";
  if (!c.female && age <= 20) return "At home: old enough for college.";
  return "Grown, and past schooling.";
}

function childCard(ui: GameUi, c: Character): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = meOf(s, life);
  const now = nowOf(c);
  const st = eduStatus(s, ui.map, c);
  const kin = kinCheck(s, life, c);
  const learned = learnedLine(c);
  const letters = lettersFrom(life, c);
  const mates = (c.edu?.mates ?? [])
    .map((id) => s.chars[id])
    .filter((x): x is Character => !!x?.alive);
  const past = (c.edu?.past ?? []).slice(-3);
  const apprentice =
    now?.kind === "apprentice"
      ? now
      : [...(c.edu?.past ?? [])].reverse().find((x) => x.kind === "apprentice");
  const years = now ? Math.round((now.until - now.since) / 365) : 0;
  const year = now
    ? Math.min(years, Math.floor((s.day - now.since) / 365) + 1)
    : 0;
  const canWrite = ageOf(s, c) >= 14 && c.alive;
  const ours = c.mother === me?.id || c.father === me?.id;
  return html`<article
    class="cq-sch-child ${st?.tone ? `tone-${st.tone}` : ""} ${now
      ? "busy"
      : ""}"
    data-c=${c.id}
  >
    <div class="cq-sch-top">
      <div class="cq-sch-pic">${token(ui, c, "small")}</div>
      <div class="cq-sch-id">
        <button
          class="cq-link cq-sch-name-btn"
          @click=${() => ui.open({ k: "char", c: c.id })}
        >
          <b>${c.first}</b><span class="cq-sch-age">, ${ageOf(s, c)}</span>
        </button>
        ${ours
          ? nothing
          : html`<span class="cq-muted small"
              >${c.female ? "sister" : "brother"} in your care</span
            >`}
        <span class="cq-sch-chipline">${eduChip(c)}</span>
      </div>
      <div class="cq-sch-btns">
        ${now
          ? html`<button
              class="cq-btn small"
              ?disabled=${!kin.ok}
              title=${kin.ok
                ? now.kind === "apprentice"
                  ? "Buy out the indenture and bring them home (the premium isn't returned); what's learned is kept"
                  : "Bring them home; what's learned is kept"
                : kin.why}
              @click=${() => void edu(ui, { act: "home", c: c.id })}
            >
              Bring home
            </button>`
          : html`<button
              class="cq-btn small primary"
              ?disabled=${!kin.ok || !inYourCare(s, life, c)}
              title=${kin.ok ? "A school, a trade or a college" : kin.why}
              @click=${() => ui.modal({ k: "school", c: c.id })}
            >
              Choose…
            </button>`}
        <button
          class="cq-btn small quiet"
          ?disabled=${!canWrite}
          title=${canWrite
            ? `Write to ${c.first}`
            : "Too young to read a letter"}
          @click=${() => ui.modal({ k: "write", c: c.id })}
        >
          Write
        </button>
      </div>
    </div>
    <div class="cq-sch-body">
      <p class="cq-sch-line small">${st && now ? st.line : idleLine(ui, c)}</p>
      ${now
        ? html`<div class="cq-sch-progress">
            ${bar(st?.progress ?? 0, "cq-sch-bar")}
            <span class="cq-muted small"
              >Year ${year} of ${years} · done
              ${dateOf(now.until).year}${now.fee
                ? ` · ${num(now.fee)} a month`
                : ""}</span
            >
          </div>`
        : nothing}
      ${learned
        ? html`<p class="small cq-sch-learned">
            <span class="cq-muted">Learned so far:</span> ${learned}
            <span class="cq-muted">(letters ${lettersOf(s, c)} in all)</span>
          </p>`
        : nothing}
      ${past.length && !now
        ? html`<ul class="cq-sch-past small">
            ${past.map((p) => html`<li>${pastLine(ui, p)}</li>`)}
          </ul>`
        : nothing}
      ${mates.length
        ? html`<p class="small cq-sch-mates">
            <span class="cq-muted"
              >${now?.kind === "college" || c.edu?.degree
                ? "Friends at college:"
                : "Friends:"}</span
            >
            ${mates
              .slice(0, 4)
              .map((m, i) => html`${i ? ", " : ""}${charLink(ui, m, false)}`)}
          </p>`
        : nothing}
      ${letters[0]
        ? fold(
            `l${c.id}`,
            html`<span class="cq-sch-fold-t">The latest letter</span>
              <span class="cq-muted small"
                >${formatDate(letters[0].arrive)}${letters.length > 1
                  ? ` · ${letters.length} in all`
                  : ""}</span
              >`,
            html`${letterView(ui, letters[0], c)}
              <button
                class="cq-link small"
                @click=${() =>
                  ui.open({ k: "tab", tab: "society", sub: "letters" })}
              >
                All your letters (Society › Letters)
              </button>`,
            "letter",
          )
        : nothing}
      ${apprentice
        ? html`<div class="cq-sch-deed">
            <button
              class="cq-btn small quiet"
              @click=${() => ui.modal({ k: "indenture", c: c.id })}
            >
              Read the indenture
            </button>
            <span class="cq-muted small"
              >${INDENTURE_NAME[cultureOfTown(s, apprentice.at, c)] ??
              INDENTURE_NAME.english},
              ${formatDate(
                "since" in apprentice ? apprentice.since : apprentice.from,
              )}</span
            >
          </div>`
        : nothing}
    </div>
  </article>`;
}

/** EDU (r13): an apprentice's indenture, in a window of its own. */
export function indentureModal(ui: GameUi, id: number): TemplateResult {
  const c = ui.s.chars[id];
  const rec = c
    ? c.edu?.now?.kind === "apprentice"
      ? c.edu.now
      : [...(c.edu?.past ?? [])].reverse().find((x) => x.kind === "apprentice")
    : undefined;
  if (!c || !rec) return html`<p class="cq-empty">No indenture.</p>`;
  return html`<div class="cq-ind-modal">${indentureDoc(ui, c, rec)}</div>`;
}

function pastLine(ui: GameUi, p: EduDone): TemplateResult {
  const s = ui.s;
  const by = s.chars[p.by];
  const y = (d: number) => dateOf(d).year;
  const span = `${y(p.from)} to ${y(p.to)}`;
  switch (p.kind) {
    case "apprentice":
      return html`${p.done ? "Served" : "Bound"} as
      ${lower(CALLING_BY_KEY.get(p.key)?.name ?? "an apprentice")}
      ${by ? html`with ${charLink(ui, by, false)}` : nothing}
      (${span})${p.why ? html`: <i>${p.why}</i>` : nothing}`;
    case "college": {
      const c = COLLEGE_BY_KEY.get(p.key);
      return html`${c?.name ?? "College"}
      (${span})${p.done
        ? html`: <b>${COURSES[(p.course as Course) ?? "arts"].degree}</b>`
        : p.why
          ? html`: <i>${p.why}</i>`
          : nothing}`;
    }
    case "path":
      return html`${PATH_BY_KEY.get(p.key)?.name ?? "The people's ways"}
      ${by ? html`with ${charLink(ui, by, false)}` : nothing} (${span})`;
    default:
      return html`${SCHOOL_BY_KEY.get(p.key)?.name ?? "School"}
      (${span})${p.why ? html`: <i>${p.why}</i>` : nothing}`;
  }
}

// ---------------------------------------------------------------- a letter from away

function letterPlace(ui: GameUi, l: Letter, c: Character): string {
  const rec =
    c.edu?.now ??
    [...(c.edu?.past ?? [])].reverse().find((x) => x.from <= l.sent);
  if (rec?.kind === "college") {
    const col = COLLEGE_BY_KEY.get(rec.key);
    if (col) return col.town.replace(/, (in|by|then) .*$/, "");
  }
  return ui.map.provinces[l.origin]?.name ?? "";
}

function letterView(ui: GameUi, l: Letter, c: Character): TemplateResult {
  const from = ui.s.chars[l.from];
  const lines = curly(l.text)
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const sign = lines.length >= 4 ? lines.slice(-2) : [];
  const bodyLines = lines.length >= 4 ? lines.slice(0, -2) : lines;
  return html`<figure class="cq-sch-letter">
    <p class="cq-sch-letter-date">
      ${letterPlace(ui, l, c)}, ${formatDate(l.sent)}
    </p>
    ${bodyLines.map(
      (t, i) =>
        html`<p class=${i === 0 && bodyLines.length > 1 ? "cq-sch-dear" : ""}>
          ${t}
        </p>`,
    )}
    ${sign.length
      ? html`<p class="cq-sch-letter-sign">
          ${sign[0]}<br /><span class="cq-sch-hand">${sign[1]}</span>
        </p>`
      : nothing}
    ${from && from.id !== c.id
      ? html`<figcaption class="cq-muted small">
          In ${charName(from)}'s hand.
        </figcaption>`
      : nothing}
  </figure>`;
}

// ---------------------------------------------------------------- the indenture

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const NUMBERS = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];

/** LIFE (r21): the one ordinal in words (Ordinal.ts). */
const ordinal = ordinalWord;

/** What the master of a trade is called: "cooper", "attorney at law". */
function masterWord(key: string): string {
  const special: Record<string, string> = {
    merchant: "merchant",
    lawyer: "attorney at law",
    mariner: "master mariner",
    housewifery: "housewife",
    joiner: "joiner",
    cordwainer: "cordwainer",
  };
  return special[key] ?? lower(CALLING_BY_KEY.get(key)?.name ?? "master");
}

/** "the tenth day of March, in the year of our Lord 1702". */
function deedDate(day: number): string {
  const d = dateOf(day);
  return `the ${ordinal(d.day)} day of ${MONTHS[d.month]}, in the year of our Lord ${d.year}`;
}

/** An apprentice's indenture, drawn as the document it was. */
export function indentureDoc(
  ui: GameUi,
  c: Character,
  rec: EduNow | EduDone,
): TemplateResult {
  const s = ui.s;
  const def = CALLING_BY_KEY.get(rec.key);
  const master = s.chars[rec.by];
  const father = s.chars[c.father];
  const mother = s.chars[c.mother];
  const parent = father ?? mother;
  const me = meOf(s, ui.life!);
  const town = ui.map.provinces[rec.at]?.name ?? "the town";
  const home = ui.map.provinces[c.home ?? ui.life!.home]?.name ?? "";
  const since = "since" in rec ? rec.since : rec.from;
  const until = "until" in rec ? rec.until : rec.to;
  const years = Math.max(1, Math.round((until - since) / 365));
  const culture = cultureOfTown(s, rec.at, c);
  const title = INDENTURE_NAME[culture] ?? INDENTURE_NAME.english;
  const he = c.female ? "she" : "he";
  const mHis = master?.female ? "her" : "his";
  const art = def?.art ?? "the trade";
  const trade = lower(def?.name ?? "trade");
  const job = def?.job ? JOBS[def.job] : null;
  const witness = (s.locals[rec.at] ?? [])
    .map((id) => s.chars[id])
    .find((x) => x?.alive && (x.role === "official" || x.role === "lawyer"));
  const served = "done" in rec ? rec.done : false;
  return html`<div class="cq-indenture ${served ? "served" : ""}">
    <p class="cq-ind-title">${title}</p>
    ${culture !== "english" && culture !== "swedish"
      ? html`<p class="cq-ind-sub">Indenture of Apprenticeship</p>`
      : nothing}
    <p class="cq-ind-text">
      <span class="cq-ind-cap">T</span>his Indenture witnesseth, that
      <b>${charName(c)}</b>, ${childWord(c)} of
      ${parent ? charName(parent) : "a family"} of ${home}, by and with the
      consent of ${his(c)} ${parent === mother ? "mother" : "father"}, hath put
      ${c.female ? "herself" : "himself"} apprentice to
      <b>${charName(master)}</b>${master ? `, ${masterWord(rec.key)}` : ""} of
      ${town}, to learn ${art}, and with ${master?.female ? "her" : "him"} after
      the manner of an apprentice to serve from ${deedDate(since)}, for and
      during the term of ${NUMBERS[years] ?? years} years next ensuing.
    </p>
    <p class="cq-ind-text">
      During which term the said apprentice ${mHis} said
      ${master?.female ? "mistress" : "master"} faithfully shall serve, ${mHis}
      secrets keep, ${mHis} lawful commands everywhere gladly obey. ${cap(he)}
      shall do no damage to ${mHis} goods, nor waste them; at cards, dice or any
      other unlawful game ${he} shall not play; matrimony ${he} shall not
      contract; taverns and ale-houses ${he} shall not haunt; nor absent
      ${c.female ? "herself" : "himself"} day or night from ${mHis} service
      without leave; but in all things behave as a faithful apprentice ought to
      do.
    </p>
    <p class="cq-ind-text">
      And the said ${master?.female ? "mistress" : "master"} shall use the
      utmost of ${mHis} endeavour to teach the said apprentice in the art and
      mystery of a ${trade}, and to read and write, finding unto ${him(c)}
      sufficient meat, drink, apparel, lodging and washing during the said
      term${def?.premium
        ? html`, in consideration of the sum of <b>${def.premium} coins</b> to
            ${mHis} hand paid`
        : ""};
      and at the end thereof, freedom dues and a new suit of apparel.
      ${job
        ? html`<span class="cq-ind-after"
            >(Out of ${his(c)} time, ${c.first} may be taken on as
            ${lower(job.ranks[1]?.title ?? "a journeyman")}.)</span
          >`
        : nothing}
    </p>
    <p class="cq-ind-text cq-ind-witness">
      In witness whereof the parties have interchangeably set their hands and
      seals, at ${town}, ${deedDate(since)}.
    </p>
    <div class="cq-ind-hands">
      <div class="cq-ind-hand">
        <span class="cq-ind-sig">${charName(master)}</span>
        <span class="cq-ind-seal" aria-hidden="true"></span>
        <span class="cq-ind-who"
          >${master?.female ? "Mistress" : "Master"}</span
        >
      </div>
      <div class="cq-ind-hand">
        <span class="cq-ind-sig">${charName(parent ?? me)}</span>
        <span class="cq-ind-seal" aria-hidden="true"></span>
        <span class="cq-ind-who">For the apprentice</span>
      </div>
      <div class="cq-ind-hand quiet">
        <span class="cq-ind-sig small"
          >${witness ? charName(witness) : "J. Clerk"}</span
        >
        <span class="cq-ind-who">Sealed and delivered in the presence of</span>
      </div>
    </div>
    ${served
      ? html`<p class="cq-ind-served">
          ${"done" in rec && rec.done
            ? `Served out, ${formatDate(rec.to)}.`
            : `Cancelled, ${formatDate(until)}.`}
        </p>`
      : nothing}
  </div>`;
}

// ---------------------------------------------------------------- Home, at a glance

/** On Home under The family: each child's schooling, and the way to choose. */
export function homeSchooling(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  if (isChildLife(s, life)) return nothing;
  const kids = schoolable(s, life).filter((k) => ageOf(s, k) >= 3);
  if (!kids.length) return nothing;
  return html`<p class="cq-act-group">Schooling and trades</p>
    <ul class="cq-sch-mini">
      ${kids.map((k) => {
        const now = nowOf(k);
        const kin = kinCheck(s, life, k);
        return html`<li>
          ${token(ui, k, "small")}
          <span class="cq-folk-text">
            <b>${k.first}, ${ageOf(s, k)}</b>
            <span class="cq-muted small"
              >${now
                ? (eduStatus(s, ui.map, k)?.line ?? "")
                : idleLine(ui, k)}</span
            >
          </span>
          <button
            class="cq-btn small ${now ? "quiet" : ""}"
            ?disabled=${!now && !kin.ok}
            title=${now
              ? "See it on You › Family"
              : kin.ok
                ? "A school, a trade or a college"
                : kin.why}
            @click=${() =>
              now
                ? ui.open({ k: "tab", tab: "you", sub: "family" })
                : ui.modal({ k: "school", c: k.id })}
          >
            ${now ? "See" : "Choose…"}
          </button>
        </li>`;
      })}
    </ul>`;
}

// ---------------------------------------------------------------- choosing: the window

type Pane = "school" | "trade" | "college" | "ways";

const view = {
  c: -1,
  pane: "school" as Pane,
  calling: "",
  rank: 1,
  course: "arts" as Course,
};

function panesFor(native: boolean): [Pane, string][] {
  return native
    ? [
        ["ways", "The people's ways"],
        ["school", "A mission school"],
        ["college", "College"],
      ]
    : [
        ["school", "School"],
        ["trade", "A trade"],
        ["college", "College"],
      ];
}

/** The pane a child's window opens on: what suits their age. */
function firstPane(ui: GameUi, c: Character): Pane {
  const age = ageOf(ui.s, c);
  if (isNativeChar(ui.s, c)) return age >= 14 ? "college" : "ways";
  if (age >= 14 && !c.female && lettersOf(ui.s, c) >= 5) return "college";
  if (age >= 11) return "trade";
  return "school";
}

export function schoolModal(ui: GameUi, id: number): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const c = s.chars[id];
  if (!life || !c)
    return html`<p class="cq-empty">They're not among the living here.</p>`;
  const native = isNativeChar(s, c);
  if (view.c !== id) {
    view.c = id;
    view.pane = firstPane(ui, c);
    view.calling = "";
  }
  const kin = kinCheck(s, life, c);
  const panes = panesFor(native);
  let body: TemplateResult;
  switch (view.pane) {
    case "trade":
      body = tradePane(ui, c);
      break;
    case "college":
      body = collegePane(ui, c);
      break;
    case "ways":
      body = offerGrid(ui, c, pathOffers(s, ui.w, life, c), "path");
      break;
    default:
      body = offerGrid(
        ui,
        c,
        schoolOffers(s, ui.w, life, c),
        "school",
        native
          ? "No mission school is near your people just now."
          : "No school takes a child of this age.",
      );
  }
  return html`<div class="cq-sch-modal">
    <header class="cq-sch-head">
      ${token(ui, c)}
      <div>
        <h2 class="cq-h1">${c.first}'s future</h2>
        <p class="cq-muted small">
          ${cap(childWord(c))}, ${ageOf(s, c)} · letters (Latin)
          ${lettersOf(s, c)} · ${eduChipText(c) ?? "at home"} ·
          ${ui.map.provinces[c.home ?? life.home]?.name ?? ""}, ${yearOf(s)}
        </p>
        ${kin.ok ? nothing : html`<p class="cq-warn small">${kin.why}</p>`}
      </div>
    </header>
    <nav class="cq-sch-tabs" role="tablist">
      ${panes.map(
        ([p, label]) =>
          html`<button
            role="tab"
            class="cq-sch-tab ${view.pane === p ? "on" : ""}"
            aria-selected=${view.pane === p}
            @click=${() => {
              view.pane = p;
              ui.redraw();
            }}
          >
            ${label}
          </button>`,
      )}
    </nav>
    <div class="cq-sch-pane">${body}</div>
  </div>`;
}

function offerGrid(
  ui: GameUi,
  c: Character,
  offers: EduOffer[],
  act: EduAct["act"],
  empty = "Nothing for them here.",
): TemplateResult {
  if (!offers.length) return html`<p class="cq-empty small">${empty}</p>`;
  return html`<div class="cq-sch-grid">
    ${offers.map((o) => offerCard(ui, c, o, act))}
  </div>`;
}

function offerCard(
  ui: GameUi,
  c: Character,
  o: EduOffer,
  act: EduAct["act"],
  head?: TemplateResult,
): TemplateResult {
  const label =
    act === "bind"
      ? "Bind apprentice"
      : act === "college"
        ? `Send ${him(c)}`
        : act === "path"
          ? "Begin"
          : o.key === "tutor"
            ? "Engage a tutor"
            : `Send ${him(c)}`;
  const run = () =>
    void edu(ui, {
      act,
      c: c.id,
      key: o.key,
      ...(act === "bind" ? { by: o.by } : {}),
      ...(act === "college" ? { rank: o.rank, course: o.course } : {}),
    });
  return html`<article class="cq-sch-offer ${o.check.ok ? "ok" : "no"}">
    ${head ?? nothing}
    <h4 class="cq-sch-name">${o.name}</h4>
    ${o.where
      ? html`<p class="cq-sch-where small">${cap(o.where)}</p>`
      : nothing}
    <p class="cq-sch-text small">${o.text}</p>
    <dl class="cq-sch-terms">
      <div>
        <dt>Years</dt>
        <dd>${o.years}</dd>
      </div>
      <div>
        <dt>A month</dt>
        <dd>${o.fee ? num(o.fee) : "nothing"}</dd>
      </div>
      ${o.once
        ? html`<div>
            <dt>${o.kind === "apprentice" ? "Premium" : "Passage"}</dt>
            <dd>${o.once}</dd>
          </div>`
        : nothing}
      <div class="wide">
        <dt>Teaches</dt>
        <dd>${gains(o.skills)}</dd>
      </div>
    </dl>
    <ul class="cq-needs cq-sch-needs">
      ${o.needs.map(
        (n) =>
          html`<li class=${n.met ? "met" : ""}>
            ${n.met ? "✓" : "○"} ${n.label}
          </li>`,
      )}
    </ul>
    <div class="cq-sch-do">
      <button
        class="cq-btn small ${o.check.ok ? "primary" : ""}"
        ?disabled=${!o.check.ok}
        title=${o.check.ok ? "" : o.check.why}
        @click=${run}
      >
        ${label}${o.once
          ? price(o.once, {
              have: ui.life?.purse,
              note: o.kind === "apprentice" ? "the premium" : "the passage",
            })
          : nothing}${o.fee ? price(o.fee, { per: "month" }) : nothing}
      </button>
    </div>
  </article>`;
}

// ---------------------------------------------------------------- a trade

function tradePane(ui: GameUi, c: Character): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const callings = callingsFor(c);
  if (!callings.find((x) => x.key === view.calling))
    view.calling = callings[0]?.key ?? "";
  const def = CALLING_BY_KEY.get(view.calling);
  const offers = def ? callingOffers(s, ui.w, life, c, def.key) : [];
  const job = def?.job ? JOBS[def.job] : null;
  return html`<div class="cq-sch-trade">
    <div class="cq-sch-callings" role="listbox" aria-label="Trades">
      ${callings.map(
        (x) =>
          html`<button
            role="option"
            aria-selected=${x.key === view.calling}
            class="cq-sch-calling ${x.key === view.calling ? "on" : ""}"
            @click=${() => {
              view.calling = x.key;
              ui.redraw();
            }}
          >
            <span class="cq-sch-calling-n">${x.name}</span>
            <span class="cq-sch-calling-p"
              >${x.premium ? `premium ${x.premium}` : "no premium"}</span
            >
          </button>`,
      )}
    </div>
    ${def
      ? html`<div class="cq-sch-trade-body">
          <p class="cq-sch-calling-text small">
            <b>${def.name}.</b> ${def.text} ${def.years} years; teaches
            ${gains(def.skills)}.
            ${job
              ? html`Out of ${his(c)} time, taken on as
                  <b>${lower(job.ranks[1]?.title ?? "a journeyman")}</b>
                  (${lower(job.name)}).`
              : html`Out of her time, able to keep a house of her own.`}
          </p>
          ${offers.length
            ? html`<div class="cq-sch-grid masters">
                ${offers.map((o) =>
                  offerCard(
                    ui,
                    c,
                    {
                      ...o,
                      name: charName(s.chars[o.by]),
                      where: `${masterWord(def.key)} at ${ui.map.provinces[o.at]?.name ?? ""}`,
                    },
                    "bind",
                    html`<div class="cq-sch-master">
                      ${token(ui, s.chars[o.by], "small")}
                      <span class="cq-muted small"
                        >${ui.map.provinces[o.at]?.name ?? ""}${o.at ===
                        (c.home ?? life.home)
                          ? " (home)"
                          : ""}</span
                      >
                    </div>`,
                  ),
                )}
              </div>`
            : html`<p class="cq-empty small">
                No ${def.mistress ? "mistress" : "master"} of this trade in your
                town or the towns you know. Masters of other towns are listed
                here once you've been there.
              </p>`}
        </div>`
      : nothing}
  </div>`;
}

// ---------------------------------------------------------------- college

function collegePane(ui: GameUi, c: Character): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const offers = collegeOffers(s, ui.w, life, c, view.rank, view.course);
  const year = yearOf(s);
  const all = new Set<Course>();
  for (const o of offers) {
    const col = COLLEGE_BY_KEY.get(o.key);
    if (col) for (const k of coursesAt(col, year)) all.add(k);
  }
  const free = isNativeChar(s, c);
  return html`<div class="cq-sch-college">
    ${!free
      ? html`<div class="cq-sch-pick">
          <span class="cq-muted small">Entered as</span>
          ${COLLEGE_RANKS.map(
            (r, i) =>
              html`<button
                class="cq-kind ${view.rank === i ? "on" : ""}"
                title=${r.text}
                @click=${() => {
                  view.rank = i;
                  ui.redraw();
                }}
              >
                ${r.name.replace(/^An? /, "")}
              </button>`,
          )}
        </div>`
      : nothing}
    <div class="cq-sch-pick">
      <span class="cq-muted small">To read</span>
      ${[...all].map(
        (k) =>
          html`<button
            class="cq-kind ${view.course === k ? "on" : ""}"
            title=${COURSES[k].text}
            @click=${() => {
              view.course = k;
              ui.redraw();
            }}
          >
            ${COURSES[k].name}
          </button>`,
      )}
    </div>
    ${offers.length
      ? html`${[
          ["In the colonies", offers.filter((o) => o.at >= 0)],
          ["Over the sea", offers.filter((o) => o.at < 0)],
        ].map(([title, list]) =>
          (list as EduOffer[]).length
            ? html`<h4 class="cq-sch-group">${title}</h4>
                ${offerGrid(ui, c, list as EduOffer[], "college")}`
            : nothing,
        )}`
      : html`<p class="cq-empty small">
          ${c.female
            ? "No college admitted women in these years."
            : "No college takes your people yet."}
        </p>`}
  </div>`;
}
