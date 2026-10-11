// Society in the browser: the letter case (what's come, what you've sent and
// what's on the road), the writing desk, gatherings you give and are asked
// to, the tongues you know, and the society block on anyone's card.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import {
  attendees,
  GATHERING_KINDS,
  gatheringCost,
  gatheringName,
  GATHERINGS,
  hostCheck,
  invitables,
  myGatherings,
  rsvpBreakdown,
  SCALE,
  venuesFor,
} from "../../engine/Gatherings";
import { talkView } from "../../engine/Interactions";
import {
  addressOf,
  correspondents,
  LETTER_KINDS,
  letterAcceptance,
  letterCheck,
  letterText,
  PETITIONS,
  postOf,
  postRoute,
  WRITABLE,
} from "../../engine/Letters";
import {
  affairsOf,
  exposureWord,
  scandalOf,
  secretOn,
} from "../../engine/Liaisons";
import {
  isChildLife,
  lifeIsNative,
  lifeOfChar,
  meOf,
} from "../../engine/LifeQueries";
import { PLACES } from "../../engine/LifeRules";
import { appointerOf, localOfficesOf, officeTitle } from "../../engine/Offices";
import { charName } from "../../engine/Queries";
import {
  BOOK_CAP,
  booksHere,
  LEVEL_NAMES,
  LEVEL_POINTS,
  levelOf,
  lifeTonguePoints,
  motherTongue,
  provinceTongue,
  tongueName,
  TONGUES,
  tonguesOf,
} from "../../engine/Tongues";
import type {
  Character,
  Gathering,
  GatheringKind,
  Letter,
  LetterKind,
  Life,
  PlaceKind,
} from "../../engine/Types";
import { QuillIcon } from "../Icons";
import { play } from "../Sound";
import {
  action,
  bar,
  charLink,
  GameUi,
  more,
  provLink,
  section,
  token,
} from "./Context";
import { curly, reasons } from "./Scene";

// ---------------------------------------------------------------- counts for badges

/** Letters come that you haven't read, and ones that want an answer. */
export function postCounts(life: Life | null): { unread: number; ask: number } {
  if (!life || life.c < 0) return { unread: 0, ask: 0 };
  let unread = 0;
  let ask = 0;
  for (const l of postOf(life)) {
    if (l.to !== life.c || l.status !== "delivered") continue;
    if (!l.read) unread++;
    if (l.ask && !l.done) ask++;
  }
  return { unread, ask };
}

/** The banner's post button: the letter case, with a count of what's new. */
export function postButton(ui: GameUi): TemplateResult | typeof nothing {
  const life = ui.life;
  if (!life || life.watching || life.c < 0) return nothing;
  const { unread, ask } = postCounts(life);
  const n = Math.max(unread, ask);
  return html`<button
    class="cq-letters cq-post-btn ${n ? "has" : ""}"
    title=${n
      ? `${unread} unread, ${ask} waiting for your answer`
      : "Your letters: write to anyone, anywhere"}
    aria-label="Letters"
    @click=${() => {
      ui.open({ k: "letters" });
      if (unread) void ui.cmd({ k: "society", act: "read" });
    }}
  >
    ${QuillIcon()}${n ? html`<span class="cq-count">${n}</span>` : nothing}
  </button>`;
}

// ---------------------------------------------------------------- the letter case

let tab: "in" | "out" | "road" = "in";

function sealColor(ui: GameUi, c: Character | undefined): string {
  const n = c ? ui.s.nations[c.nation] : undefined;
  return n?.color ?? "#9e2a1e";
}

const ASK_LABELS: Partial<Record<LetterKind, [string, string]>> = {
  favour: ["Lend it", "Refuse"],
  business: ["Go halves", "Decline"],
  love: ["Write back warmly", "Burn it"],
  marriage: ["Yes, I will", "Refuse"],
  threat: ["Give in", "Defy them"],
  petition: ["Grant it", "Refuse"],
  invite: ["Accept", "Send regrets"],
  blackmail: ["Pay", "Refuse, and let them talk"],
  news: ["Accept the office", "Decline"],
  recommend: ["Thank them", "Ignore it"],
};

function kindLabel(l: Letter): string {
  if (l.kind === "news" && l.ask) return "An office offered";
  if (l.kind === "reply") return "A reply";
  return LETTER_KINDS[l.kind]?.label ?? "A letter";
}

function letterCard(ui: GameUi, l: Letter): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const mine = l.from === life.c;
  const other = s.chars[mine ? l.to : l.from];
  const where = ui.map.provinces[mine ? l.dest : l.origin]?.name ?? "somewhere";
  const status =
    l.status === "transit"
      ? html`<span class="cq-chip"
          >${mine ? "on its way" : "coming"}: about
          ${formatDate(l.arrive)}${l.bySea ? ", by ship" : ""}</span
        >`
      : l.status === "lost"
        ? html`<span class="cq-chip bad">lost on the way</span>`
        : l.ask && !l.done && !mine
          ? html`<span class="cq-chip gold">wants an answer</span>`
          : nothing;
  const labels = ASK_LABELS[l.kind] ?? ["Yes", "No"];
  const canAnswer = !mine && l.ask && !l.done && l.status === "delivered";
  const left = canAnswer ? Math.max(0, 60 - (s.day - l.arrive)) : 0;
  const answer = l.answer;
  const showBody = l.status !== "transit" || mine;
  return html`<article
    class="cq-post ${mine ? "out" : "in"} ${l.read === false
      ? "unread"
      : ""} ${l.status}"
  >
    <header class="cq-post-head">
      <span
        class="cq-post-seal"
        style="--seal:${sealColor(ui, mine ? meOf(s, life) : other)}"
      ></span>
      <span class="cq-post-who">
        <span class="cq-post-kind">${kindLabel(l)}</span>
        <span class="small"
          >${mine ? "To" : "From"} ${charLink(ui, other, false)}, ${where} ·
          ${formatDate(mine ? l.sent : l.arrive)}</span
        >
        ${status === nothing ? nothing : html`<span>${status}</span>`}
      </span>
    </header>
    ${showBody
      ? html`<p class="cq-post-text">${curly(l.text)}</p>`
      : html`<p class="cq-post-text muted">
          A letter is on its way to you from ${charName(other)}.
        </p>`}
    ${l.arg &&
    (l.kind === "favour" ||
      l.kind === "business" ||
      l.kind === "threat" ||
      l.kind === "blackmail")
      ? html`<p class="cq-muted small">
          ${l.kind === "business"
            ? "Stake"
            : l.kind === "favour"
              ? "Asked"
              : "Demanded"}:
          ${l.arg} coins.
        </p>`
      : nothing}
    ${answer && mine
      ? html`<div
          class="cq-accept ${answer.yes ? "will" : "wont"} cq-post-answer"
        >
          <span class="cq-accept-verdict"
            >${answer.yes ? "They said yes" : "They said no"}</span
          >
          <span class="cq-accept-score"
            >${answer.why.total > 0 ? "+" : ""}${answer.why.total}</span
          >
          ${reasons(answer.why, 6)}
        </div>`
      : nothing}
    ${answer && !mine && l.done
      ? html`<p class="cq-muted small">${answer.text}.</p>`
      : nothing}
    ${canAnswer
      ? html`<div class="cq-btnrow">
            <button
              class="cq-btn primary small"
              @click=${async () => {
                if (
                  await ui.cmd({
                    k: "society",
                    act: "answer",
                    id: l.id,
                    yes: true,
                  })
                )
                  play("seal");
              }}
            >
              ${labels[0]}
            </button>
            <button
              class="cq-btn small"
              @click=${() =>
                ui.cmd({ k: "society", act: "answer", id: l.id, yes: false })}
            >
              ${labels[1]}
            </button>
            ${other && !mine && other.alive
              ? html`<button
                  class="cq-btn quiet small"
                  @click=${() => ui.modal({ k: "write", c: other.id })}
                >
                  Write back
                </button>`
              : nothing}
          </div>
          <p class="cq-muted small">Unanswered, it lapses in ${left} days.</p>`
      : !mine && l.status === "delivered" && other?.alive && !l.ask
        ? html`<div class="cq-btnrow">
            <button
              class="cq-btn quiet small"
              @click=${() => ui.modal({ k: "write", c: other.id })}
            >
              Write back
            </button>
          </div>`
        : nothing}
  </article>`;
}

export function lettersPage(ui: GameUi): TemplateResult {
  const life = ui.life;
  if (!life || life.c < 0)
    return html`<p class="cq-empty">You're watching.</p>`;
  const post = [...postOf(life)].reverse();
  const incoming = post.filter(
    (l) => l.to === life.c && l.status !== "transit" && l.kind !== "reply",
  );
  const replies = post.filter(
    (l) => l.to === life.c && l.kind === "reply" && l.status !== "transit",
  );
  const sent = post.filter((l) => l.from === life.c && l.to !== life.c);
  const road = post.filter((l) => l.status === "transit");
  const waiting = incoming.filter((l) => l.ask && !l.done);
  const shown =
    tab === "in"
      ? [...waiting, ...incoming.filter((l) => !(l.ask && !l.done))]
      : tab === "out"
        ? sent
        : road;
  const counts = { in: incoming.length, out: sent.length, road: road.length };
  return html`<header class="cq-panel-head">
      <h2 class="cq-h1">Letters</h2>
      <p class="cq-muted small">
        Write to anyone you've met or know of, wherever they are. Letters go by
        rider or with the next ship, take as long as the road, and are sometimes
        lost. Answers come back with their reasons.
      </p>
      <div class="cq-btnrow">
        <button class="cq-btn primary" @click=${() => ui.modal({ k: "write" })}>
          ${QuillIcon()} Write a letter
        </button>
      </div>
    </header>
    <div class="cq-seg cq-post-tabs" role="tablist">
      ${(
        [
          ["in", "Received"],
          ["out", "Sent"],
          ["road", "On the road"],
        ] as const
      ).map(
        ([k, label]) =>
          html`<button
            role="tab"
            aria-selected=${tab === k}
            class=${tab === k ? "on" : ""}
            @click=${() => {
              tab = k;
              ui.redraw();
            }}
          >
            ${label}<span class="cq-muted small"
              >${k === "in" && waiting.length
                ? waiting.length === counts.in
                  ? `${waiting.length} to answer`
                  : `${counts.in} · ${waiting.length} to answer`
                : counts[k]}</span
            >
          </button>`,
      )}
    </div>
    ${tab === "out" && replies.length
      ? html`<p class="cq-muted small cq-pad">
          Answers are shown on the letters they answer.
        </p>`
      : nothing}
    <div class="cq-post-list">
      ${shown.length
        ? shown.slice(0, 40).map((l) => letterCard(ui, l))
        : html`<p class="cq-empty">
            ${tab === "in"
              ? "No letters yet. Write to someone, and they'll write back."
              : tab === "out"
                ? "You haven't written to anyone."
                : "Nothing on the road just now."}
          </p>`}
    </div>`;
}

// ---------------------------------------------------------------- the writing desk

let desk: {
  key: string;
  to: number;
  kind: LetterKind;
  arg: number;
  about: number;
  filter: string;
} = { key: "", to: -1, kind: "friendly", arg: 0, about: -1, filter: "" };

function group(ui: GameUi, life: Life, c: Character): string {
  const s = ui.s;
  const me = meOf(s, life)!;
  if (lifeOfChar(s, c.id)) return "Players";
  if (
    life.ties[c.id] ||
    [me.spouse, me.father, me.mother, ...me.children].includes(c.id)
  )
    return "Family and friends";
  if (
    s.nations.some(
      (n) => n.ruler === c.id || Object.values(n.council).includes(c.id),
    )
  )
    return "Governors and councils";
  if (addressOf(s, c) === life.prov) return "Here";
  return "People you've met";
}

const GROUP_ORDER = [
  "Family and friends",
  "Players",
  "Here",
  "People you've met",
  "Governors and councils",
];

/** Who a letter about someone (a recommendation, an introduction) could be about. */
function aboutChoices(ui: GameUi, life: Life): Character[] {
  return life.met
    .map((id) => ui.s.chars[id])
    .filter((c): c is Character => !!c?.alive && !c.abroad)
    .slice(-40)
    .reverse();
}

export function writeModal(
  ui: GameUi,
  m: { c?: number; kind?: LetterKind; arg?: number; about?: number },
): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  if (!life || !me) return html`<p class="cq-muted">You're watching.</p>`;
  const key = `${ui.modalSeq}`;
  if (desk.key !== key)
    desk = {
      key,
      to: m.c ?? -1,
      kind:
        m.kind ??
        (m.c !== undefined && life.ties[m.c] === "lover" ? "love" : "friendly"),
      arg: m.arg ?? LETTER_KINDS[m.kind ?? "friendly"].coins?.[1] ?? 0,
      about: m.about ?? -1,
      filter: "",
    };
  const people = correspondents(s, life)
    .map((id) => s.chars[id])
    .filter((c): c is Character => !!c);
  const f = desk.filter.trim().toLowerCase();
  const listed = people.filter(
    (c) => !f || charName(c).toLowerCase().includes(f),
  );
  const groups = GROUP_ORDER.map((gname) => ({
    gname,
    list: listed
      .filter((c) => group(ui, life, c) === gname)
      .slice(0, gname === "People you've met" ? 30 : 40),
  })).filter((x) => x.list.length);
  const to = s.chars[desk.to];
  const def = LETTER_KINDS[desk.kind];
  if (def.coins && !def.coins.includes(desk.arg))
    desk.arg = def.coins[1] ?? def.coins[0];
  const arg =
    desk.kind === "petition"
      ? desk.arg
      : def.coins
        ? desk.arg
        : desk.kind === "invite"
          ? desk.arg
          : 0;
  const check = to
    ? letterCheck(s, ui.w, life, to.id, desk.kind, arg, desk.about)
    : { ok: false as const, why: "Choose someone to write to." };
  const route = to ? postRoute(s, ui.map, life.prov, addressOf(s, to)) : null;
  const accept = to
    ? letterAcceptance(s, ui.w, life, to, desk.kind, arg, desk.about)
    : null;
  const player = to ? !!lifeOfChar(s, to.id) : false;
  const set = (patch: Partial<typeof desk>) => {
    Object.assign(desk, patch);
    ui.redraw();
  };
  const theirOffices = to
    ? Object.values(s.society?.offices ?? {})
        .flat()
        .filter((o) => appointerOf(s, o) === to.id && o.key !== "founder")
    : [];
  const mineGatherings = myGatherings(s, life).filter(
    (x) => x.host === me.id && x.status === "planned",
  );
  return html`<div class="cq-desk">
    <h2 class="cq-h1">The writing desk</h2>
    <div class="cq-desk-grid">
      <div class="cq-desk-to">
        <label class="cq-field">
          <span>To</span>
          <input
            type="search"
            placeholder="Find someone…"
            .value=${desk.filter}
            @input=${(e: Event) =>
              set({ filter: (e.target as HTMLInputElement).value })}
          />
        </label>
        <div class="cq-desk-people">
          ${groups.map(
            (gr) =>
              html`<h4 class="cq-int-group">${gr.gname}</h4>
                <ul>
                  ${gr.list.map(
                    (c) =>
                      html`<li>
                        <button
                          class="cq-desk-person ${c.id === desk.to ? "on" : ""}"
                          @click=${() =>
                            set({
                              to: c.id,
                              kind:
                                life.ties[c.id] === "lover" &&
                                desk.kind === "friendly"
                                  ? "love"
                                  : desk.kind,
                            })}
                        >
                          ${token(ui, c, "small")}
                          <span>
                            <b>${charName(c)}</b>
                            <span class="cq-muted small"
                              >${ui.map.provinces[addressOf(s, c)]?.name ??
                              ""}</span
                            >
                          </span>
                        </button>
                      </li>`,
                  )}
                </ul>`,
          )}
          ${groups.length
            ? nothing
            : html`<p class="cq-muted small">Nobody by that name.</p>`}
        </div>
      </div>
      <div class="cq-desk-paper">
        <div
          class="cq-desk-kinds"
          role="radiogroup"
          aria-label="What kind of letter"
        >
          ${WRITABLE.map((k) => {
            const ok = to
              ? letterCheck(
                  s,
                  ui.w,
                  life,
                  to.id,
                  k,
                  LETTER_KINDS[k].coins?.[1] ??
                    (k === "petition"
                      ? desk.arg
                      : k === "invite"
                        ? (mineGatherings[0]?.id ?? -1)
                        : 0),
                  k === "recommend"
                    ? desk.about >= 0
                      ? desk.about
                      : (aboutChoices(ui, life)[0]?.id ?? -1)
                    : desk.about,
                )
              : { ok: true as const };
            return html`<button
              role="radio"
              aria-checked=${desk.kind === k}
              class="cq-kind ${desk.kind === k ? "on" : ""} ${ok.ok
                ? ""
                : "dim"}"
              title=${ok.ok ? LETTER_KINDS[k].text : ok.why}
              @click=${() =>
                set({
                  kind: k,
                  arg:
                    k === "petition"
                      ? 0
                      : k === "invite"
                        ? (mineGatherings[0]?.id ?? -1)
                        : (LETTER_KINDS[k].coins?.[1] ?? 0),
                  about:
                    k === "recommend"
                      ? (aboutChoices(ui, life)[0]?.id ?? -1)
                      : k === "petition"
                        ? (theirOffices[0]?.id ?? -1)
                        : -1,
                })}
            >
              ${LETTER_KINDS[k].label}
            </button>`;
          })}
        </div>
        <p class="cq-muted small">${def.text}</p>
        ${def.coins
          ? html`<div class="cq-seg cq-desk-coins">
              ${def.coins.map(
                (n) =>
                  html`<button
                    class=${desk.arg === n ? "on" : ""}
                    @click=${() => set({ arg: n })}
                  >
                    ${n
                      ? `${n} coins`
                      : desk.kind === "threat"
                        ? "Just back off"
                        : "Nothing"}
                  </button>`,
              )}
            </div>`
          : nothing}
        ${desk.kind === "recommend" || desk.kind === "introduce"
          ? html`<label class="cq-field">
              <span
                >${desk.kind === "recommend" ? "Recommend" : "Introduce"}</span
              >
              <select
                @change=${(e: Event) =>
                  set({ about: Number((e.target as HTMLSelectElement).value) })}
              >
                ${desk.kind === "introduce"
                  ? html`<option value="-1" ?selected=${desk.about < 0}>
                      Yourself
                    </option>`
                  : nothing}
                ${aboutChoices(ui, life)
                  .filter((c) => c.id !== desk.to)
                  .map(
                    (c) =>
                      html`<option
                        value=${c.id}
                        ?selected=${c.id === desk.about}
                      >
                        ${charName(c)}
                      </option>`,
                  )}
              </select>
            </label>`
          : nothing}
        ${desk.kind === "petition"
          ? html`<label class="cq-field">
                <span>Petition for</span>
                <select
                  @change=${(e: Event) =>
                    set({
                      arg: Number((e.target as HTMLSelectElement).value),
                      about: theirOffices[0]?.id ?? -1,
                    })}
                >
                  ${PETITIONS.map(
                    (p, i) =>
                      html`<option value=${i} ?selected=${desk.arg === i}>
                        ${p.label}
                      </option>`,
                  )}
                </select>
              </label>
              ${desk.arg === 0
                ? html`<label class="cq-field">
                    <span>Which office</span>
                    <select
                      @change=${(e: Event) =>
                        set({
                          about: Number((e.target as HTMLSelectElement).value),
                        })}
                    >
                      ${theirOffices.length
                        ? theirOffices.map(
                            (o) =>
                              html`<option
                                value=${o.id}
                                ?selected=${o.id === desk.about}
                              >
                                ${officeTitle(s, ui.w, o)}${o.holder >= 0
                                  ? ` (held by ${charName(s.chars[o.holder])})`
                                  : " (empty)"}
                              </option>`,
                          )
                        : html`<option value="-1">
                            Nothing in their gift
                          </option>`}
                    </select>
                  </label>`
                : nothing}`
          : nothing}
        ${desk.kind === "invite"
          ? html`<label class="cq-field">
              <span>To</span>
              <select
                @change=${(e: Event) =>
                  set({ arg: Number((e.target as HTMLSelectElement).value) })}
              >
                ${mineGatherings.length
                  ? mineGatherings.map(
                      (x) =>
                        html`<option
                          value=${x.id}
                          ?selected=${x.id === desk.arg}
                        >
                          ${gatheringName(s, ui.w, x)}, ${formatDate(x.day)}
                        </option>`,
                    )
                  : html`<option value="-1">
                      You're giving nothing just now
                    </option>`}
              </select>
            </label>`
          : nothing}
        ${to
          ? html`<div class="cq-letter-preview">
              <p>
                ${curly(
                  letterText(s, ui.w, life, to, desk.kind, arg, desk.about),
                )}
              </p>
              <p class="cq-letter-sign">${charName(me)}</p>
            </div>`
          : html`<p class="cq-empty">Choose who to write to.</p>`}
        ${route && to
          ? html`<p class="small cq-desk-route">
              To ${ui.map.provinces[addressOf(s, to)]?.name}: about
              <b>${route.days} day${route.days === 1 ? "" : "s"}</b>${route.sea
                ? html`, by ship (${Math.round(route.risk * 100)}% chance it's
                  lost)`
                : html` by rider`};
              postage ${route.cost} coins. The answer takes as long to come
              back.
            </p>`
          : nothing}
        ${player
          ? html`<div class="cq-accept player">
              <span class="cq-accept-verdict">${to!.first} will decide</span>
              <span class="cq-muted small"
                >Another player: they'll answer it themselves.</span
              >
            </div>`
          : accept && to
            ? html`<div class="cq-accept ${accept.total > 0 ? "will" : "wont"}">
                <span class="cq-accept-verdict"
                  >${LETTER_KINDS[desk.kind].ask
                    ? accept.total > 0
                      ? "Likely yes"
                      : "Likely no"
                    : "They'll read it"}</span
                >
                <span class="cq-accept-score"
                  >${accept.total > 0 ? "+" : ""}${accept.total}</span
                >
                ${reasons(accept, 6)}
                <span class="cq-muted small"
                  >As things stand: they decide when it arrives.</span
                >
              </div>`
            : nothing}
        <div class="cq-btnrow end">
          ${action(
            html`${QuillIcon()} Seal and send`,
            check,
            async () => {
              if (
                await ui.cmd({
                  k: "society",
                  act: "write",
                  c: desk.to,
                  kind: desk.kind,
                  arg,
                  about: desk.about,
                })
              ) {
                play("seal");
                ui.toast(
                  `Your letter to ${charName(to)} is on its way.`,
                  "good",
                );
                ui.modal(null);
                ui.open({ k: "letters" });
              }
            },
            "primary",
          )}
          <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
            Not now
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- gatherings

let plan: {
  key: string;
  kind: GatheringKind;
  venue: PlaceKind | "";
  days: number;
  scale: number;
  guests: number[];
} = { key: "", kind: "dinner", venue: "", days: 14, scale: 1, guests: [] };

const DAYS = [7, 14, 30, 60, 90];

function draftGathering(ui: GameUi, life: Life): Gathering {
  const me = meOf(ui.s, life)!;
  return {
    id: -1,
    kind: plan.kind,
    host: me.id,
    prov: life.prov,
    venue: (plan.venue || "home") as PlaceKind,
    day: ui.s.day + plan.days,
    scale: plan.scale,
    cost: 0,
    invited: [],
    rsvp: {},
    about: [],
    status: "planned",
    mood: 0,
    played: [],
    turns: {},
    lines: [],
  };
}

export function hostModal(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  if (!life || !me) return html`<p class="cq-muted">You're watching.</p>`;
  const key = `${ui.modalSeq}`;
  const native = lifeIsNative(s, life);
  const kinds = GATHERING_KINDS.filter((k) => {
    const w = GATHERINGS[k].who;
    return w === "any" || (w === "native") === native;
  });
  if (plan.key !== key)
    plan = {
      key,
      kind: native ? "nfeast" : "dinner",
      venue: "",
      days: 14,
      scale: 1,
      guests: [],
    };
  const venues = venuesFor(s, ui.w, life, plan.kind);
  if (!venues.includes(plan.venue as PlaceKind)) plan.venue = venues[0] ?? "";
  const def = GATHERINGS[plan.kind];
  const check = plan.venue
    ? hostCheck(s, ui.w, life, plan.kind, plan.venue, plan.days, plan.scale)
    : { ok: false as const, why: `There's nowhere here for ${def.a}.` };
  const cost = plan.venue
    ? gatheringCost(plan.kind, plan.venue, plan.scale)
    : 0;
  const max = SCALE[plan.scale - 1].guests;
  const can = invitables(s, ui.w, life);
  const draft = draftGathering(ui, life);
  plan.guests = plan.guests
    .filter((id) => can.some((x) => x.c.id === id))
    .slice(0, max);
  const set = (patch: Partial<typeof plan>) => {
    Object.assign(plan, patch);
    ui.redraw();
  };
  const full = plan.guests.length >= max;
  const guestCheck = plan.guests.length
    ? check
    : check.ok
      ? { ok: false as const, why: "Choose your guests." }
      : check;
  return html`<div class="cq-host">
    <h2 class="cq-h1">Give a gathering</h2>
    <p class="cq-muted small">
      At ${ui.map.provinces[life.prov].name}. Choose what, where, when and how
      grand; then who to ask. People here answer at once; people far off get a
      letter, and need time to come. On the day, things happen.
    </p>
    <div class="cq-host-kinds">
      ${kinds.map((k) => {
        const d = GATHERINGS[k];
        const v = venuesFor(s, ui.w, life, k);
        const c = hostCheck(
          s,
          ui.w,
          life,
          k,
          v[0] ?? "home",
          plan.days,
          plan.scale,
        );
        const blocked =
          !v.length || (!c.ok && !/costs|cost|guests/.test(c.why));
        return html`<button
          class="cq-host-kind ${plan.kind === k ? "on" : ""} ${blocked
            ? "dim"
            : ""}"
          title=${blocked
            ? v.length
              ? (c as { why: string }).why
              : "There's nowhere here for it."
            : d.text}
          @click=${() => set({ kind: k })}
        >
          <b>${d.name}</b>
          <span class="small">${d.base} coins and up</span>
        </button>`;
      })}
    </div>
    <p class="cq-host-text">${def.text}</p>
    <div class="cq-host-row">
      <label class="cq-field">
        <span>Where</span>
        <select
          @change=${(e: Event) =>
            set({ venue: (e.target as HTMLSelectElement).value as PlaceKind })}
        >
          ${venues.length
            ? venues.map(
                (v) =>
                  html`<option value=${v} ?selected=${v === plan.venue}>
                    ${PLACES[v].name}${v === "tavern"
                      ? " (the long room, rented)"
                      : ""}
                  </option>`,
              )
            : html`<option value="">Nowhere here</option>`}
        </select>
      </label>
      <label class="cq-field">
        <span>When</span>
        <select
          @change=${(e: Event) =>
            set({ days: Number((e.target as HTMLSelectElement).value) })}
        >
          ${DAYS.map(
            (d) =>
              html`<option value=${d} ?selected=${d === plan.days}>
                In ${d} days (${formatDate(s.day + d)})
              </option>`,
          )}
        </select>
      </label>
      <div class="cq-field">
        <span>How grand</span>
        <div class="cq-seg">
          ${SCALE.map(
            (sc, i) =>
              html`<button
                class=${plan.scale === i + 1 ? "on" : ""}
                @click=${() => set({ scale: i + 1 })}
              >
                ${sc.name}
              </button>`,
          )}
        </div>
      </div>
    </div>
    <p class="small">
      Costs <b>${cost} coins</b> (you have ${Math.floor(life.purse)}). Up to
      ${max} guests. Grander gatherings bring more renown, if they go well.
    </p>
    <h3 class="cq-h3">
      Guests <span class="cq-muted small">${plan.guests.length} of ${max}</span>
    </h3>
    <ul class="cq-guest-list">
      ${can.slice(0, 60).map(({ c, near, days }) => {
        const on = plan.guests.includes(c.id);
        const b = lifeOfChar(s, c.id)
          ? null
          : rsvpBreakdown(s, ui.w, draft, c, life);
        const will = b ? b.total > 0 : null;
        return html`<li>
          <label
            class="cq-guest ${on ? "on" : ""} ${!on && full ? "dim" : ""}"
            title=${b
              ? b.parts
                  .map((p) => `${p.value > 0 ? "+" : ""}${p.value} ${p.label}`)
                  .join("\n")
              : "Another player: they'll answer"}
          >
            <input
              type="checkbox"
              .checked=${on}
              ?disabled=${!on && full}
              @change=${() =>
                set({
                  guests: on
                    ? plan.guests.filter((x) => x !== c.id)
                    : [...plan.guests, c.id],
                })}
            />
            ${token(ui, c, "small")}
            <span class="cq-guest-name">
              <b>${charName(c)}</b>
              <span class="cq-muted small"
                >${near
                  ? "here"
                  : `by letter, ${ui.map.provinces[addressOf(s, c)]?.name ?? ""} (${days} days there and back)`}</span
              >
            </span>
            ${will === null
              ? html`<span class="cq-verdict-chip player">they decide</span>`
              : html`<span class="cq-verdict-chip ${will ? "will" : "wont"}"
                  >${will ? "likely yes" : "likely no"}</span
                >`}
          </label>
        </li>`;
      })}
    </ul>
    <div class="cq-btnrow end">
      ${action(
        `Send the invitations (${cost})`,
        guestCheck,
        async () => {
          if (
            await ui.cmd({
              k: "society",
              act: "host",
              kind: plan.kind,
              venue: plan.venue as PlaceKind,
              days: plan.days,
              arg: plan.scale,
              list: plan.guests,
            })
          ) {
            play("seal");
            ui.modal(null);
            ui.open({ k: "gatherings" });
          }
        },
        "primary",
      )}
      <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
        Not now
      </button>
    </div>
  </div>`;
}

function rsvpChips(ui: GameUi, gat: Gathering): TemplateResult {
  const s = ui.s;
  return html`<ul class="cq-rsvp">
    ${gat.invited.map((id) => {
      const c = s.chars[id];
      const r = gat.rsvp[id];
      return html`<li
        class=${r ? (r.yes ? "yes" : "no") : "wait"}
        title=${r ? r.why : "No answer yet"}
      >
        ${charLink(ui, c, false)}
        <span class="small"
          >${r
            ? r.yes
              ? "coming"
              : `no: ${r.why.toLowerCase()}`
            : "no answer yet"}</span
        >
      </li>`;
    })}
  </ul>`;
}

export function gatheringsPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  if (!life || !me) return html`<p class="cq-empty">You're watching.</p>`;
  const all = myGatherings(s, life);
  const mine = all.filter(
    (x) => x.host === me.id && (x.status === "planned" || x.status === "on"),
  );
  const asked = all.filter((x) => x.host !== me.id && x.status === "planned");
  const past = all
    .filter((x) => x.status === "held" || x.status === "cancelled")
    .slice(-6)
    .reverse();
  const canHost = !isChildLife(s, life) && !life.travel;
  return html`<header class="cq-panel-head">
      <h2 class="cq-h1">Gatherings</h2>
      <p class="cq-muted small">
        Dinners, balls, hunts, frolics, weddings, feasts and councils: give one,
        and choose who to ask. Things happen on the day; how it goes changes
        what people think of you, and how well you're known.
      </p>
      <div class="cq-btnrow">
        ${action(
          "Give a gathering…",
          canHost
            ? { ok: true }
            : {
                ok: false,
                why: life.travel
                  ? "Not from the road."
                  : "Not until you're grown.",
              },
          () => ui.modal({ k: "host" }),
          "primary",
        )}
      </div>
    </header>
    ${section(
      "Yours",
      mine.length
        ? html`${mine.map(
            (x) =>
              html`<div class="cq-gather-card">
                <p class="cq-gather-title">
                  <b>${gatheringName(s, ui.w, x)}</b>
                  <span class="cq-chip ${x.status === "on" ? "gold" : ""}"
                    >${x.status === "on"
                      ? "under way"
                      : formatDate(x.day)}</span
                  >
                </p>
                <p class="cq-muted small">
                  ${PLACES[x.venue]?.name ?? ""},
                  ${SCALE[x.scale - 1]?.name.toLowerCase()}
                  ${x.kind === "wedding" ? "" : `· ${x.cost} coins`}. Be there
                  on the day.
                </p>
                ${rsvpChips(ui, x)}
                ${x.status === "planned"
                  ? html`<div class="cq-btnrow">
                      <button
                        class="cq-btn small"
                        @click=${() =>
                          ui.modal({ k: "write", kind: "invite", arg: x.id })}
                      >
                        Ask someone far off…
                      </button>
                      ${x.kind === "wedding"
                        ? nothing
                        : html`<button
                            class="cq-btn quiet small"
                            @click=${() =>
                              ui.cmd({ k: "society", act: "cancel", id: x.id })}
                          >
                            Call it off
                          </button>`}
                    </div>`
                  : nothing}
              </div>`,
          )}`
        : html`<p class="cq-muted small">You're giving nothing just now.</p>`,
    )}
    ${section(
      "You're asked to",
      asked.length
        ? html`${asked.map((x) => {
            const r = x.rsvp[me.id];
            const here = life.prov === x.prov;
            return html`<div class="cq-gather-card">
              <p class="cq-gather-title">
                <b>${gatheringName(s, ui.w, x)}</b>
                <span class="cq-chip">${formatDate(x.day)}</span>
              </p>
              <p class="cq-muted small">
                At ${provLink(ui, x.prov)},
                ${PLACES[x.venue]?.name.toLowerCase() ?? ""}.
                ${r
                  ? r.yes
                    ? "You said you'll come."
                    : "You sent your regrets."
                  : "You haven't answered."}
                ${r?.yes && !here ? html`<b>Be there on the day.</b>` : nothing}
              </p>
              ${r
                ? nothing
                : html`<div class="cq-btnrow">
                    <button
                      class="cq-btn primary small"
                      @click=${() =>
                        ui.cmd({
                          k: "society",
                          act: "rsvp",
                          id: x.id,
                          yes: true,
                        })}
                    >
                      Accept
                    </button>
                    <button
                      class="cq-btn small"
                      @click=${() =>
                        ui.cmd({
                          k: "society",
                          act: "rsvp",
                          id: x.id,
                          yes: false,
                        })}
                    >
                      Send regrets
                    </button>
                  </div>`}
            </div>`;
          })}`
        : html`<p class="cq-muted small">
            No invitations. People who like you (and people who want something)
            will ask.
          </p>`,
    )}
    ${past.length
      ? section(
          "Lately",
          html`<ul class="cq-gather-past">
            ${past.map(
              (x) =>
                html`<li>
                  <b>${gatheringName(s, ui.w, x)}</b>, ${formatDate(x.day)}:
                  ${x.status === "cancelled"
                    ? "called off"
                    : (x.lines[x.lines.length - 1] ?? "held")}
                  ${x.status === "held"
                    ? html`<span class="cq-muted small"
                        >${attendees(s, x).length} came</span
                      >`
                    : nothing}
                </li>`,
            )}
          </ul>`,
        )
      : nothing}`;
}

// ---------------------------------------------------------------- tongues

export function tonguesSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const pts = lifeTonguePoints(s, ui.map, life);
  const known = Object.entries(pts)
    .filter(([t, v]) => v > 0 && TONGUES[t])
    .sort((a, b) => b[1] - a[1]);
  const local = provinceTongue(s, ui.map, life.prov);
  const books = booksHere(s, life.prov).filter(
    (b) => (pts[b.tongue] ?? 0) < BOOK_CAP,
  );
  return section(
    "Tongues",
    html`<ul class="cq-tongues">
        ${known.map(([t, v]) => {
          const lvl = levelOf(v);
          return html`<li title=${TONGUES[t].text}>
            <span class="cq-tongue-name">${tongueName(t)}</span>
            <span class="cq-tongue-level lvl${lvl}">${LEVEL_NAMES[lvl]}</span>
            ${bar(lvl >= 3 ? 1 : (v % LEVEL_POINTS) / LEVEL_POINTS, "xp")}
            <span class="cq-muted small">${Math.floor(v)}</span>
          </li>`;
        })}
      </ul>
      <p class="cq-muted small">
        Without a shared tongue, most things can't be said (talk goes by signs),
        and what can be said goes worse. An interpreter nearby helps. You learn
        by talking with people (Learning makes it faster), by living among
        speakers${local ? html` (here: <b>${tongueName(local)}</b>)` : nothing},
        from lessons (anyone fluent will teach you, for a fee: their card) and
        from grammars.
      </p>
      ${books.length && !life.travel
        ? html`<div class="cq-btnrow">
            ${books.map((b) =>
              action(
                `${b.title} (${b.cost})`,
                (pts[b.tongue] ?? 0) >= BOOK_CAP
                  ? { ok: false, why: "Books will take you no further." }
                  : (life.cooldowns[`book:${b.tongue}`] ?? 0) > s.day
                    ? { ok: false, why: "You're still working through it." }
                    : life.purse < b.cost
                      ? { ok: false, why: `${b.cost} coins.` }
                      : { ok: true },
                () => ui.cmd({ k: "society", act: "study", kind: b.tongue }),
                "small",
                undefined,
                false,
              ),
            )}
          </div>`
        : nothing}`,
  );
}

/** How you'd talk with someone, in words, for their card and the scene. */
export function talkLine(
  ui: GameUi,
  c: Character,
): TemplateResult | typeof nothing {
  const life = ui.life;
  if (!life || life.c < 0 || lifeOfChar(ui.s, c.id) || c.id === life.c)
    return nothing;
  const t = talkView(ui.s, ui.w, life, c);
  const theirs = tongueName(t.theirs);
  if (t.via >= 0)
    return html`<p class="cq-tongue-note via">
      Through an interpreter: ${charLink(ui, ui.s.chars[t.via], false)} speaks
      with you both. It's slow, and things are lost.
    </p>`;
  if (t.level >= 3) return nothing;
  if (t.level === 2)
    return html`<p class="cq-tongue-note">
      You talk in ${tongueName(t.tongue)}, haltingly.
    </p>`;
  if (t.level === 1)
    return html`<p class="cq-tongue-note bad">
      Only a few words of ${tongueName(t.tongue)} between you: most things are
      harder, some can't be said.
    </p>`;
  return html`<p class="cq-tongue-note bad">
    You share no tongue: ${c.first} speaks ${theirs}. You'll be talking with
    your hands (and learning a little ${theirs} as you go).
  </p>`;
}

// ---------------------------------------------------------------- on someone's card

export function personSociety(ui: GameUi, c: Character): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  if (!life || life.c < 0 || !c.alive || c.abroad) return html``;
  const theirs = tonguesOf(s, ui.map, c);
  const list = Object.entries(theirs)
    .filter(([t]) => TONGUES[t])
    .sort((a, b) => b[1] - a[1])
    .map(([t, l]) => `${tongueName(t)}${l < 3 ? ` (${LEVEL_NAMES[l]})` : ""}`);
  const offices = localOfficesOf(s, c.id);
  const sec = secretOn(life, c.id);
  const affair = affairsOf(life).find((a) => a.c === c.id);
  const isMe = c.id === life.c;
  return html`<div class="cq-person-soc">
    <p class="small">
      <span class="cq-muted">Speaks</span> ${list.join(", ") ||
      tongueName(motherTongue(c.culture))}
    </p>
    ${talkLine(ui, c)}
    ${offices.length
      ? html`<p class="small">
          ${offices.map(
            (o) =>
              html`<button
                class="cq-link"
                @click=${() => ui.open({ k: "offices", p: o.prov })}
              >
                ${officeTitle(s, ui.w, o)}
              </button> `,
          )}
        </p>`
      : nothing}
    ${affair
      ? html`<p class="small">
          <span class="cq-tie lover">secret</span> Your affair:
          ${exposureWord(affair)}.
        </p>`
      : nothing}
    ${sec
      ? html`<p class="small">
          <span class="cq-chip bad">you know their secret</span> ${sec.kind ===
          "affair"
            ? `a lover, ${charName(s.chars[sec.with])}`
            : sec.kind === "debt"
              ? "debts they hide"
              : "smuggling"}
        </p>`
      : nothing}
    ${isMe
      ? nothing
      : html`<div class="cq-btnrow">
          <button
            class="cq-btn small"
            @click=${() => ui.modal({ k: "write", c: c.id })}
          >
            ${QuillIcon()} Write a letter
          </button>
        </div>`}
  </div>`;
}

// ---------------------------------------------------------------- your affairs, at a glance

export function societySection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const { unread, ask } = postCounts(life);
  const all = myGatherings(s, life);
  const giving = all.filter(
    (x) => x.host === me.id && x.status === "planned",
  ).length;
  const asked = all.filter(
    (x) => x.host !== me.id && x.status === "planned" && !x.rsvp[me.id],
  ).length;
  const offices = localOfficesOf(s, me.id);
  const affairs = affairsOf(life);
  const scandal = scandalOf(s, life);
  const tile = (
    title: string,
    line: string | TemplateResult,
    run: () => void,
    hot = false,
  ) =>
    html`<button class="cq-soc-tile ${hot ? "hot" : ""}" @click=${run}>
      <b>${title}</b><span class="small">${line}</span>
    </button>`;
  return section(
    "Society",
    html`<div class="cq-soc-tiles">
        ${tile(
          "Letters",
          ask
            ? `${ask} to answer`
            : unread
              ? `${unread} unread`
              : "Write to anyone",
          () => ui.open({ k: "letters" }),
          ask > 0,
        )}
        ${tile(
          "Gatherings",
          asked
            ? `${asked} invitation${asked === 1 ? "" : "s"}`
            : giving
              ? `${giving} planned`
              : "Give one",
          () => ui.open({ k: "gatherings" }),
          asked > 0,
        )}
        ${tile(
          "Local office",
          offices.length
            ? officeTitle(s, ui.w, offices[0])
            : "The county's offices",
          () => ui.open({ k: "offices", p: offices[0]?.prov ?? life.prov }),
        )}
        ${tile(
          life.founding ? "Your settlement" : "A settlement",
          life.founding
            ? `${life.founding.stage === "underway" ? "on the way to" : "getting up"} ${ui.map.provinces[life.founding.target].name}`
            : "Found one of your own",
          () => ui.open({ k: "founding" }),
        )}
      </div>
      ${life.constitute && life.constitute.until > s.day
        ? html`<div class="cq-callout lit">
            <p>
              <b>${s.nations[life.constitute.n]?.name}</b> waits for its
              government: a name, a flag, a form, its first officers.
            </p>
            <button
              class="cq-btn primary"
              @click=${() => ui.modal({ k: "constitute" })}
            >
              Set up the government…
            </button>
          </div>`
        : nothing}
      ${scandal
        ? html`<p class="cq-callout bad small">
            The talk of the town: ${scandal.toLowerCase()}.
          </p>`
        : nothing}
      ${affairs.length
        ? more(
            `Secret affairs (${affairs.length})`,
            html`<ul class="cq-ties">
                ${affairs.map(
                  (a) =>
                    html`<li>
                      <span class="cq-tie lover">secret</span> ${charLink(
                        ui,
                        s.chars[a.c],
                      )}
                      <span class="cq-muted small"
                        >${exposureWord(a)}${a.kids.length
                          ? `, ${a.kids.length} child${a.kids.length > 1 ? "ren" : ""}`
                          : ""}</span
                      >
                      ${bar(a.exposure / 100, "invert")}
                      <button
                        class="cq-btn quiet small"
                        @click=${() =>
                          ui.cmd({ k: "society", act: "endaffair", c: a.c })}
                      >
                        End it
                      </button>
                    </li>`,
                )}
              </ul>
              <p class="cq-muted small">
                Meet in secret (their card) to keep it alive; every meeting, and
                every letter, may be noticed. Stealth helps.
              </p>`,
            true,
          )
        : nothing}`,
  );
}

/** A slim row on the Here page: this county's offices, a gathering, a letter. */
export function hereStrip(ui: GameUi): TemplateResult | typeof nothing {
  const life = ui.life;
  if (!life || life.c < 0 || life.travel) return nothing;
  const { ask } = postCounts(life);
  return html`<div class="cq-soc-strip">
    <button
      class="cq-btn small"
      @click=${() => ui.open({ k: "offices", p: life.prov })}
    >
      County offices
    </button>
    <button class="cq-btn small" @click=${() => ui.modal({ k: "host" })}>
      Give a gathering
    </button>
    <button
      class="cq-btn small ${ask ? "lit" : ""}"
      @click=${() => ui.open({ k: "letters" })}
    >
      Letters${ask ? ` (${ask})` : ""}
    </button>
  </div>`;
}
