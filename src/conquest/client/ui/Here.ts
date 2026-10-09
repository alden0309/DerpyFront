// Where you are: the province, its places and what you can do at each, the
// work they offer, and the people you could meet. Any other province gets a
// page too: who holds it, what's there, and the road to it.

import { html, nothing, TemplateResult } from "lit";
import { areaName, areasOf, presence, Present } from "../../engine/Areas";
import { formatDate } from "../../engine/Calendar";
import { interactionView, InteractionView } from "../../engine/Interactions";
import { actCheck, actLabel, actOdds, actsAt } from "../../engine/LifeActs";
import {
  isChildLife,
  isNativeChar,
  jobTitle,
  lifeIsNative,
  lifeOfChar,
  opinionOf,
  peopleHere,
  placesIn,
  promotionView,
  startRank,
  travelRoute,
} from "../../engine/LifeQueries";
import {
  AWAY_DAYS,
  COMMAND_RANK,
  EUROPE_FORTUNE,
  EXPAND_COST,
  JOBS,
  PLACES,
  ROLES,
  WORK_DAYS,
} from "../../engine/LifeRules";
import { joinCheck, movementOf, movementsHere } from "../../engine/Movements";
import { standCheck } from "../../engine/Politics";
import { businessOf, expandCheck, handRoom } from "../../engine/Property";
import {
  ageOf,
  armyMen,
  charName,
  holder,
  settlers,
  tribesfolk,
} from "../../engine/Queries";
import { heardHere } from "../../engine/Rumours";
import type { Character, PlaceKind } from "../../engine/Types";
import { employersIn } from "../../engine/Work";
import { flagFor } from "../Flags";
import { placeIcon } from "../Icons";
import { placeThumb, sceneArt } from "../SceneArt";
import { play } from "../Sound";
import {
  GOOD_NAMES,
  nationName,
  people as peopleText,
  TERRAIN_NAMES,
} from "../Text";
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

function provHeader(ui: GameUi, p: number): TemplateResult {
  const s = ui.s;
  const pr = s.provinces[p];
  const def = ui.map.provinces[p];
  const owner = pr.owner >= 0 ? s.nations[pr.owner] : null;
  const occupier = pr.occupier >= 0 ? s.nations[pr.occupier] : null;
  const folk = settlers(pr);
  const tribe = tribesfolk(pr);
  return html`<header class="cq-panel-head with-flag">
    ${owner
      ? flagFor(owner, "cq-flag lg")
      : html`<span class="cq-flag lg empty"></span>`}
    <div>
      <h2 class="cq-h1">${def.name}</h2>
      <p class="cq-owner">
        ${owner
          ? html`${nationLink(ui, owner.id)}${owner.capital === p
              ? html`<span class="cq-chip">capital</span>`
              : nothing}`
          : html`Open country`}
        ${occupier
          ? html`<span class="cq-held"
              >held by ${nationName(occupier.name)}</span
            >`
          : nothing}
      </p>
      <p class="cq-muted small">
        ${TERRAIN_NAMES[def.terrain]}${def.coastal ? ", coast" : ""},
        ${GOOD_NAMES[ui.w.raw[p]].toLowerCase()}.
        ${folk > 0 ? `${peopleText(folk)} settlers` : ""}${folk > 0 && tribe > 0
          ? ", "
          : ""}${tribe > 0 ? `${peopleText(tribe)} of the country` : ""}.
        ${pr.unrest >= 50
          ? html`<b class="bad">Restless (${Math.round(pr.unrest)}).</b>`
          : nothing}
      </p>
    </div>
  </header>`;
}

/** The travel choices from where you are to a province. */
export function travelBlock(ui: GameUi, p: number): TemplateResult {
  const life = ui.life;
  if (!life || !ui.me || life.watching) return html``;
  const from = life.travel ? life.travel.path[0] : life.prov;
  if (p === life.prov && !life.travel) return html``;
  const native = lifeIsNative(ui.s, life);
  const sailor = life.job?.kind === "sailor";
  const land = travelRoute(ui.s, ui.map, from, p, false, native, sailor);
  const sea = travelRoute(ui.s, ui.map, from, p, true, native, sailor);
  const seaBetter =
    sea && sea.sea.some(Boolean) && (!land || sea.days < land.days - 1);
  const marching = life.job && life.job.army >= 0;
  const leads = ui.s.armies.some((a) => a.commander === ui.me!.id);
  const blocked = marching
    ? "You march with your army. Stay behind in garrison (at a fort) to travel alone."
    : leads
      ? "You command an army: march it instead (Affairs)."
      : null;
  const go = async (bySea: boolean) => {
    if (await ui.cmd({ k: "travel", to: p, bySea }))
      ui.open({ k: "tab", tab: "here" });
  };
  return section(
    "The road there",
    html`<div class="cq-travel">
      ${!land && !sea
        ? html`<p class="cq-muted">There's no way there from where you are.</p>`
        : nothing}
      ${land
        ? html`<div class="cq-travel-way">
            <span
              ><b>Overland</b>: about ${Math.ceil(land.days)} days, ${land.cost}
              coins for food and lodging.</span
            >
            ${action(
              "Set out",
              blocked ? { ok: false, why: blocked } : { ok: true },
              () => void go(false),
              "small primary",
            )}
          </div>`
        : nothing}
      ${seaBetter
        ? html`<div class="cq-travel-way">
            <span
              ><b>By sea</b>: about ${Math.ceil(sea!.days)} days,
              ${sea!.cost
                ? `${sea!.cost} coins passage`
                : sailor
                  ? "free while you sail"
                  : "by canoe"}.</span
            >
            ${action(
              "Take ship",
              blocked ? { ok: false, why: blocked } : { ok: true },
              () => void go(true),
              "small",
            )}
          </div>`
        : nothing}
    </div>`,
  );
}

/** The province you're in: its places, who's in each, and what you can do. */
export function herePanel(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  if (!life || !me) return watchingHere(ui);
  const p = life.prov;
  const t = life.travel;
  const marching =
    life.job && life.job.army >= 0
      ? s.armies.find((a) => a.id === life.job!.army)
      : undefined;
  const leading = s.armies.find((a) => a.commander === me.id);
  return html`${provHeader(ui, p)}
  ${t
    ? html`<div class="cq-callout road">
        <p>
          On the road to <b>${ui.map.provinces[t.dest].name}</b>. Next:
          ${ui.map.provinces[t.path[0]].name}${t.sea[0] ? " (by sea)" : ""}, on
          ${formatDate(t.arrive)}.
        </p>
        ${t.path.length > 1
          ? html`<button
              class="cq-btn small"
              @click=${() => ui.cmd({ k: "halt" })}
            >
              Stop at the next place
            </button>`
          : nothing}
      </div>`
    : nothing}
  ${marching || leading
    ? html`<div class="cq-callout">
        <p>
          ${leading
            ? html`You command the ${s.nations[leading.owner].adjective} army
              here (${Math.round(armyMen(leading))} men).`
            : html`You march with the ${s.nations[marching!.owner].adjective}
              army (${Math.round(armyMen(marching!))} men).`}
        </p>
        <button
          class="cq-btn small"
          @click=${() => ui.open({ k: "army", id: (leading ?? marching)!.id })}
        >
          The army
        </button>
      </div>`
    : nothing}
  ${t
    ? html`<p class="cq-muted small cq-pad">
        Places and people open up when you arrive.
      </p>`
    : areasView(ui, p)}`;
}

function watchingHere(ui: GameUi): TemplateResult {
  const life = ui.life;
  return html`<header class="cq-panel-head">
      <h2 class="cq-h1">Watching the world</h2>
    </header>
    <p class="cq-lede small">
      ${life?.ended
        ? html`${life.ended.why}.`
        : html`You haven't made a character in this world yet.`}
      The world goes on. You can take over someone living in it, or begin a new
      life of your own.
    </p>
    <div class="cq-btnrow">
      <button
        class="cq-btn primary"
        @click=${() => ui.modal({ k: "takeover" })}
      >
        Take over someone
      </button>
      <button class="cq-btn" @click=${() => ui.modal({ k: "maker" })}>
        Begin a new life
      </button>
    </div>
    <p class="cq-muted small cq-pad">
      Click any province to see who lives there; click a person to see them, and
      take them over from their page.
    </p>`;
}

function standButton(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const pol = s.polities[ui.me!.nation];
  if (!pol) return html``;
  if (life.campaign)
    return html`<p class="cq-muted small cq-campaign">
      Standing for ${pol.name}: ${life.campaign.points} campaign points. The
      count is on ${formatDate(pol.election)}.
    </p>`;
  const check = standCheck(s, life);
  return html`<button
    class="cq-act-btn"
    ?disabled=${!check.ok}
    title=${check.ok
      ? `The next election is on ${formatDate(pol.election)}.`
      : check.why}
    @click=${() => ui.cmd({ k: "stand" })}
  >
    <span>Stand for ${pol.name}</span>${!check.ok
      ? html`<span class="cq-act-why">${check.why}</span>`
      : nothing}
  </button>`;
}

function europeButton(ui: GameUi): TemplateResult {
  const life = ui.life!;
  if (lifeIsNative(ui.s, life) && !life.invite) return html``;
  const can = !!life.invite || life.purse >= EUROPE_FORTUNE;
  const why = life.invite
    ? "Answer the invitation"
    : `To live in Europe you need ${EUROPE_FORTUNE} coins`;
  return html`<button
    class="cq-act-btn ${life.invite ? "lit" : ""}"
    ?disabled=${!can}
    title=${why}
    @click=${() => ui.open({ k: "tab", tab: "affairs" })}
  >
    <span>Sail for Europe…</span>${!can
      ? html`<span class="cq-act-why">${why}</span>`
      : nothing}
  </button>`;
}

export function roleOf(ui: GameUi, c: Character): string {
  const s = ui.s;
  const n = s.nations[c.nation];
  const life = lifeOfChar(s, c.id);
  if (n?.ruler === c.id)
    return n.kind === "native"
      ? (c.title ?? "Leader")
      : n.kind === "rebels"
        ? `Leader of ${n.name}`
        : "Governor";
  for (const seat of Object.keys(n?.council ?? {}) as (keyof NonNullable<
    typeof n
  >["council"])[]) {
    if (n?.council[seat] === c.id)
      return n.kind === "native"
        ? seat === "marshal"
          ? "War chief"
          : "Speaker"
        : seat[0].toUpperCase() + seat.slice(1);
  }
  if (life) return `Played by ${life.name}`;
  if (c.role) return ROLES[c.role].title;
  const parent = s.chars[c.father] ?? s.chars[c.mother];
  if (parent?.role)
    return `${c.female ? "Daughter" : "Son"} of the ${ROLES[parent.role].title.toLowerCase()}`;
  const sp = s.chars[c.spouse];
  if (sp?.role)
    return `${c.female ? "Wife" : "Husband"} of the ${ROLES[sp.role].title.toLowerCase()}`;
  if (s.armies.some((a) => a.commander === c.id)) return "Commander";
  return isNativeChar(s, c) ? "Of the village" : "Of the town";
}

export function personRow(ui: GameUi, c: Character): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const op = life && life.c >= 0 ? opinionOf(s, c, life) : null;
  const tie = life?.ties[c.id];
  return html`<li>
    <button class="cq-folk-row" @click=${() => ui.open({ k: "char", c: c.id })}>
      ${token(ui, c, "small")}
      <span class="cq-folk-text">
        <b>${charName(c)}</b>
        <span class="cq-muted small"
          >${roleOf(ui, c)},
          ${ageOf(s, c)}${tie
            ? html` · <span class="cq-tie ${tie}">${tie}</span>`
            : nothing}</span
        >
      </span>
      ${op
        ? num(
            `${op.total > 0 ? "+" : ""}${op.total}`,
            () => breakdownTip(`What ${c.first} thinks of you`, op),
            `cq-opinion ${op.total >= 20 ? "good" : op.total <= -20 ? "bad" : ""}`,
          )
        : nothing}
    </button>
  </li>`;
}

/** Any province: who holds it, what's there, the people you've met there, and the road. */
export function provincePage(ui: GameUi, p: number): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  if (life && !life.watching && p === life.prov && !life.travel)
    return herePanel(ui);
  const list = placesIn(s, ui.w, p);
  const def = ui.map.provinces[p];
  const met = peopleHere(s, p, life ?? undefined).filter(
    (c) => !life || life.met.includes(c.id) || life.watching || !life.c,
  );
  const armies = s.armies.filter((a) => a.prov === p);
  const h = holder(s.provinces[p]);
  return html`${provHeader(ui, p)} ${travelBlock(ui, p)}
  ${section(
    "What's there",
    html`<p class="cq-place-list">
        ${list.map(
          (pl) =>
            html`<span class="cq-chip cq-place-chip"
              >${placeIcon(pl)}
              ${s.provinces[p].owner >= 0 &&
              s.nations[s.provinces[p].owner].kind === "native" &&
              PLACES[pl].nativeName
                ? PLACES[pl].nativeName
                : PLACES[pl].name.replace(/^The /, "")}</span
            >`,
        )}
      </p>
      ${life?.visited.includes(p)
        ? html`<p class="cq-muted small">You've been here.</p>`
        : html`<p class="cq-muted small">
            You've never been to ${def.name}.
          </p>`}`,
  )}
  ${armies.length
    ? section(
        "Armies",
        html`<ul class="cq-list">
          ${armies.map(
            (a) =>
              html`<li>
                <button
                  class="cq-link"
                  @click=${() => ui.open({ k: "army", id: a.id })}
                >
                  ${s.nations[a.owner].adjective} army,
                  ${Math.round(armyMen(a))} men
                </button>
                ${h >= 0 && a.owner !== h
                  ? html`<span class="cq-held">in arms here</span>`
                  : nothing}
              </li>`,
          )}
        </ul>`,
      )
    : nothing}
  ${met.length
    ? section(
        life?.watching ? "People there" : "People you know there",
        html`<ul class="cq-folk">
          ${met.map((c) => personRow(ui, c))}
        </ul>`,
      )
    : nothing}`;
}

// ---------------------------------------------------------------- the places of a province

/** Which area you're looking at: where you are (or a place just entered). */
function currentArea(ui: GameUi, list: PlaceKind[]): PlaceKind {
  const life = ui.life!;
  if (life.area && list.includes(life.area)) return life.area;
  if (life.job && life.job.prov === life.prov && list.includes(life.job.place))
    return life.job.place;
  return (
    (["tavern", "village", "market", "councilfire"] as PlaceKind[]).find((k) =>
      list.includes(k),
    ) ?? list[0]
  );
}

/** The tiles of the province's places, and the one you're in. */
function areasView(ui: GameUi, p: number): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const list = areasOf(s, ui.w, p, life);
  const crowd = presence(s, ui.w, p, s.day, life);
  const cur = currentArea(ui, list);
  const enter = (a: PlaceKind) => {
    if (a === life.area) return;
    play("paper");
    void ui.cmd({ k: "enter", area: a });
  };
  return html`<nav class="cq-areas" aria-label="Places here">
      ${list.map((a) => {
        const folk = crowd.get(a) ?? [];
        const thumb = placeThumb(a);
        const work = life.job && life.job.prov === p && life.job.place === a;
        return html`<button
          class="cq-area-tile ${a === cur ? "on" : ""}"
          aria-pressed=${a === cur}
          style=${thumb ? `--thumb:url(${thumb})` : ""}
          @click=${() => enter(a)}
        >
          <span class="cq-area-name">${areaName(s, p, a)}</span>
          <span class="cq-area-faces">
            ${folk
              .slice(0, 3)
              .map((x) => token(ui, s.chars[x.c], "xs"))}${folk.length > 3
              ? html`<i>+${folk.length - 3}</i>`
              : nothing}
          </span>
          <span class="cq-area-count"
            >${folk.length
              ? `${folk.length} here`
              : a === "home"
                ? "home"
                : "nobody"}</span
          >
          ${work ? html`<span class="cq-area-work">your work</span>` : nothing}
        </button>`;
      })}
    </nav>
    ${areaView(ui, p, cur, crowd.get(cur) ?? [])}`;
}

function areaView(
  ui: GameUi,
  p: number,
  area: PlaceKind,
  folk: Present[],
): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const art = sceneArt(area);
  const def = PLACES[area];
  return html`<section class="cq-area" aria-label=${areaName(s, p, area)}>
    <header class="cq-area-banner" style=${art ? `--art:url(${art})` : ""}>
      <h3>${areaName(s, p, area)}</h3>
      <p>${def.text}</p>
    </header>
    ${workBlock(ui, p, area)} ${hiringBlock(ui, p, area)}
    <h4 class="cq-area-h">
      Here now
      <span class="cq-muted small">${folk.length + 1}</span>
    </h4>
    <ul class="cq-present">
      <li class="you">
        <span class="cq-present-row">
          ${token(ui, ui.me!, "small")}
          <span class="cq-folk-text">
            <b>You</b>
            <span class="cq-muted small"
              >${life.job && life.job.prov === p && life.job.place === area
                ? `at work, ${jobTitle(life).toLowerCase()}`
                : "looking about"}</span
            >
          </span>
        </span>
      </li>
      ${folk.map((x) => presentRow(ui, x))}
    </ul>
    ${folk.length === 0
      ? html`<p class="cq-empty small">
          Nobody else is here just now. People come and go with the days.
        </p>`
      : nothing}
    ${actsBlock(ui, p, area)} ${talkBlock(ui, p, area)}
    ${extrasBlock(ui, p, area)}
  </section>`;
}

const KIND_TAG: Partial<Record<Present["kind"], string>> = {
  traveller: "traveller",
  player: "player",
  court: "court",
  hand: "your hand",
};

function presentRow(ui: GameUi, x: Present): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const c = s.chars[x.c];
  if (!c) return html``;
  const op = life && life.c >= 0 ? opinionOf(s, c, life) : null;
  const tie = life?.ties[c.id];
  const tag = KIND_TAG[x.kind];
  return html`<li>
    <button
      class="cq-present-row"
      @click=${() => ui.open({ k: "char", c: c.id })}
    >
      ${token(ui, c, "small")}
      <span class="cq-folk-text">
        <b>${charName(c)}</b>
        <span class="cq-muted small"
          >${roleOf(ui, c)},
          ${ageOf(s, c)}${tie
            ? html` · <span class="cq-tie ${tie}">${tie}</span>`
            : nothing}</span
        >
        <span class="cq-doing">${x.doing}</span>
      </span>
      ${tag ? html`<span class="cq-chip ${x.kind}">${tag}</span>` : nothing}
      ${op
        ? num(
            `${op.total > 0 ? "+" : ""}${op.total}`,
            () => breakdownTip(`What ${c.first} thinks of you`, op),
            `cq-opinion ${op.total >= 20 ? "good" : op.total <= -20 ? "bad" : ""}`,
          )
        : nothing}
    </button>
  </li>`;
}

/** Your own work, if this is where you do it. */
function workBlock(ui: GameUi, p: number, area: PlaceKind): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const job = life.job;
  if (!job || job.prov !== p || job.place !== area) return html``;
  const def = JOBS[job.kind];
  const boss = s.chars[job.employer];
  const v = promotionView(s, life);
  const biz = businessOf(life, p, area);
  const worked = Math.min(WORK_DAYS, job.worked ?? 0);
  const hard = actCheck(s, ui.w, life, area, "work");
  const askUp = boss?.alive
    ? interactionView(s, ui.w, life, boss.id, "promote")
    : null;
  const next = def.ranks[job.rank + 1];
  return html`<div class="cq-workblock">
    <p class="cq-work-title">
      <b>${jobTitle(life)}</b>
      <span class="cq-muted small"
        >${job.own
          ? `your own ${biz?.name ?? def.business ?? "work"}`
          : boss?.alive
            ? html`for ${charLink(ui, boss, false)}`
            : "between masters"}</span
      >
    </p>
    <div class="cq-days" title="Wages are paid by the days you work">
      ${bar(worked / WORK_DAYS, "xp")}
      <span class="small"
        >${worked} of ${WORK_DAYS} days this month:
        ${((def.ranks[job.rank].wage * worked) / WORK_DAYS).toFixed(1)} of
        ${def.ranks[job.rank].wage} coins earned</span
      >
    </div>
    ${(job.awayDays ?? 0) > 0
      ? html`<p class="cq-warn small">
          ${job.awayDays} days away
          ${job.own ? "" : `(${AWAY_DAYS} and the place is gone)`}.
        </p>`
      : nothing}
    <div class="cq-acts">
      <button
        class="cq-act-btn"
        ?disabled=${!hard.ok}
        title="A long day: skill, and a good word from your master"
        @click=${() => runAct(ui, area, "work")}
      >
        <span>Put in a hard day</span>${!hard.ok
          ? html`<span class="cq-act-why">${hard.why}</span>`
          : nothing}
      </button>
      ${askUp && next && !next.buy
        ? html`<button
            class="cq-act-btn ${askUp.will ? "lit" : ""}"
            ?disabled=${!askUp.check.ok}
            @click=${() =>
              ui.modal({ k: "interact", c: boss!.id, act: "promote" })}
          >
            <span>Ask to be made ${next.title.toLowerCase()}</span>
            ${verdictChip(askUp)}
          </button>`
        : nothing}
      ${next?.buy
        ? (() => {
            const b = actCheck(s, ui.w, life, area, "buy");
            return html`<button
              class="cq-act-btn ${b.ok ? "lit" : ""}"
              ?disabled=${!b.ok}
              @click=${() => runAct(ui, area, "buy")}
            >
              <span>Buy ${next.buy!.what} (${next.buy!.cost})</span>${!b.ok
                ? html`<span class="cq-act-why">${b.why}</span>`
                : nothing}
            </button>`;
          })()
        : nothing}
      ${v.next && !v.check.ok && !next?.buy
        ? html`<span class="cq-muted small cq-next-needs"
            >Next: ${v.next.title}. ${v.check.why}</span
          >`
        : nothing}
      ${biz
        ? (() => {
            const ex = expandCheck(life, biz);
            return html`<button
              class="cq-act-btn"
              ?disabled=${!ex.ok}
              @click=${async () => {
                if (await ui.cmd({ k: "property", act: "expand", id: biz.id }))
                  play("coins");
              }}
            >
              <span
                >Grow the
                ${biz.name}${EXPAND_COST[biz.level] !== undefined
                  ? ` (${EXPAND_COST[biz.level]})`
                  : ""}</span
              >${!ex.ok
                ? html`<span class="cq-act-why">${ex.why}</span>`
                : nothing}
            </button>`;
          })()
        : nothing}
      <button
        class="cq-act-btn rough"
        @click=${() =>
          boss?.alive && !job.own
            ? ui.modal({ k: "interact", c: boss.id, act: "quit" })
            : confirm(
                `Give up your work as ${jobTitle(life).toLowerCase()}?`,
              ) && void ui.cmd({ k: "quit" })}
      >
        <span>${job.own ? "Give up the trade" : "Hand in your notice"}</span>
      </button>
    </div>
    ${biz
      ? html`<p class="small cq-hands">
          Hands:
          ${biz.hands.length
            ? biz.hands.map((h) => html`${charLink(ui, s.chars[h], false)} `)
            : html`<span class="cq-muted">none yet</span>`}
          <span class="cq-muted"
            >(room for ${handRoom(biz)} more: offer anyone here work from their
            card)</span
          >
        </p>`
      : nothing}
  </div>`;
}

/** Who takes people on here, and whether they'd take you. */
function hiringBlock(ui: GameUi, p: number, area: PlaceKind): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  if (isChildLife(s, life)) return html``;
  const bosses = employersIn(s, ui.w, p).filter((e) => e.place === area);
  const self =
    area === "woods" && !life.job
      ? actCheck(s, ui.w, life, "woods", "traplines")
      : null;
  if (!bosses.length && !self) return html``;
  return html`<div class="cq-hiring">
    <h4 class="cq-area-h">Work to be had</h4>
    <ul>
      ${bosses.flatMap(({ c, jobs }) =>
        jobs.map((k, i) => {
          const v = interactionView(s, ui.w, life, c.id, "work", i);
          const r = JOBS[k].ranks[0];
          return html`<li>
            ${token(ui, c, "small")}
            <span class="cq-folk-text">
              <b>${JOBS[k].ranks[startRank(s, life, k)].title}</b>
              <span class="cq-muted small"
                >${charName(c)} takes people on; ${r.wage} a month, up to
                ${JOBS[k].ranks[
                  JOBS[k].ranks.length - 1
                ].title.toLowerCase()}</span
              >
            </span>
            ${life.job?.kind === k && life.job.employer === c.id
              ? html`<span class="cq-chip good">yours</span>`
              : html`<button
                  class="cq-btn small ${v.will ? "primary" : ""}"
                  ?disabled=${!v.check.ok}
                  title=${v.check.ok ? JOBS[k].text : v.check.why}
                  @click=${() =>
                    ui.modal({ k: "interact", c: c.id, act: "work", arg: i })}
                >
                  Ask ${verdictChip(v)}
                </button>`}
          </li>`;
        }),
      )}
      ${self
        ? html`<li>
            <span class="cq-folk-text">
              <b>Trapper, on your own account</b>
              <span class="cq-muted small"
                >Nobody's hand but yours: set your own traplines.</span
              >
            </span>
            <button
              class="cq-btn small"
              ?disabled=${!self.ok}
              title=${self.ok ? "" : self.why}
              @click=${() => runAct(ui, "woods", "traplines")}
            >
              Set out
            </button>
          </li>`
        : nothing}
    </ul>
    ${life.job && bosses.length
      ? html`<p class="cq-muted small">
          You hold one job at a time: to work here, hand in your notice first.
        </p>`
      : nothing}
  </div>`;
}

/** "Will accept" / "Will refuse" / "62%" beside an interaction. */
export function verdictChip(v: InteractionView): TemplateResult {
  if (!v.check.ok) return html``;
  if (v.player)
    return html`<span class="cq-verdict-chip player">they decide</span>`;
  if (v.mode === "accept" && v.will !== null)
    return html`<span class="cq-verdict-chip ${v.will ? "will" : "wont"}"
      >${v.will ? "will accept" : "will refuse"}</span
    >`;
  if (v.mode === "chance" && v.chance !== null) return html`${odds(v.chance)}`;
  return html``;
}

/** Run an act at a place, then show what came of it. */
export async function runAct(
  ui: GameUi,
  place: PlaceKind,
  act: string,
): Promise<void> {
  if (await ui.cmd({ k: "act", place, act })) ui.modal({ k: "outcome" });
}

/** What you can do at a place. */
function actsBlock(ui: GameUi, p: number, area: PlaceKind): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const shown = new Set(["work", "buy", "traplines"]);
  const acts = actsAt(area)
    .filter((a) => !shown.has(a.key))
    .map((a) => ({ a, check: actCheck(s, ui.w, life, area, a.key) }))
    .filter(
      ({ check }) =>
        check.ok ||
        !/^(Only|Not open|Land isn't|Your people|Not your way|You belong to no|You're not standing|Trappers'|Physicians'|You have work already|You're in the army|That's done where)/.test(
          check.why,
        ),
    );
  const market =
    area === "market" ||
    area === "docks" ||
    (area === "village" &&
      s.provinces[p].owner >= 0 &&
      s.nations[s.provinces[p].owner].kind === "native");
  if (!acts.length && !market) return html``;
  return html`<h4 class="cq-area-h">Things to do</h4>
    <div class="cq-acts">
      ${acts.map(({ a, check }) => {
        const o = actOdds(s, life, a.key);
        return html`<button
          class="cq-act-btn"
          ?disabled=${!check.ok}
          title=${check.ok ? a.text : `${check.why} ${a.text}`}
          @click=${() => runAct(ui, area, a.key)}
        >
          <span>${actLabel(s, life, a)}</span>${odds(o)}${!check.ok
            ? html`<span class="cq-act-why">${check.why}</span>`
            : nothing}
        </button>`;
      })}
      ${market
        ? html`<button
            class="cq-act-btn"
            @click=${() => ui.modal({ k: "trade" })}
          >
            <span>Buy and sell goods</span>
          </button>`
        : nothing}
      ${area === "governor" ||
      (area === "councilfire" &&
        s.provinces[p].owner >= 0 &&
        s.nations[s.provinces[p].owner].kind === "native")
        ? standButton(ui)
        : nothing}
      ${area === "docks" ? europeButton(ui) : nothing}
    </div>`;
}

/** The talk of the place: news and rumours that have reached it. */
function talkBlock(ui: GameUi, p: number, area: PlaceKind): TemplateResult {
  if (!["tavern", "village", "market", "docks", "councilfire"].includes(area))
    return html``;
  const heard = heardHere(ui.s, ui.map, p).slice(0, 4);
  if (!heard.length) return html``;
  return html`<h4 class="cq-area-h">The talk here</h4>
    <ul class="cq-talk">
      ${heard.map(
        (r) =>
          html`<li class=${r.tone ?? ""}>
            <span class="cq-log-date"
              >${formatDate(r.day).replace(/ \d{4}$/, "")}</span
            >
            ${r.text}
          </li>`,
      )}
    </ul>`;
}

/** Causes, armies, the road to Europe: whatever else a place has. */
function extrasBlock(ui: GameUi, p: number, area: PlaceKind): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const movements =
    area === "tavern" || area === "councilfire" ? movementsHere(s, p) : [];
  const armies =
    area === "fort" || area === "councilfire"
      ? s.armies.filter(
          (a) =>
            a.prov === p &&
            a.depart < 0 &&
            (a.owner === me.nation || a.owner === life.job?.nation),
        )
      : [];
  return html`${movements.length
    ? html`<h4 class="cq-area-h">Causes</h4>
        <ul class="cq-movements-here">
          ${movements.map((m) => {
            const check = joinCheck(s, life, m);
            const mine = movementOf(s, me.id)?.id === m.id;
            return html`<li>
              <b>${m.name}</b>
              <span class="cq-muted small">${m.text}</span>
              ${mine
                ? html`<span class="cq-chip good">sworn</span>`
                : action(
                    "Join",
                    check,
                    () => ui.cmd({ k: "movement", act: "join", id: m.id }),
                    "small",
                    undefined,
                    false,
                  )}
            </li>`;
          })}
        </ul>`
    : nothing}
  ${armies.length
    ? html`<h4 class="cq-area-h">Under arms here</h4>
        <ul class="cq-movements-here">
          ${armies.map((a) => {
            const job = life.job;
            const can =
              (!!job &&
                (job.kind === "soldier" || job.kind === "warrior") &&
                job.nation === a.owner &&
                job.rank >= (COMMAND_RANK[job.kind] ?? 99)) ||
              s.nations[a.owner].council.marshal === me.id ||
              s.nations[a.owner].ruler === me.id;
            return html`<li>
              <span
                >The ${s.nations[a.owner].adjective} army:
                ${Math.round(armyMen(a))}
                men${a.commander >= 0
                  ? `, led by ${charName(s.chars[a.commander])}`
                  : ""}.</span
              >
              ${a.commander === me.id
                ? html`<span class="cq-chip good">yours</span>`
                : action(
                    "Take command",
                    can
                      ? { ok: true }
                      : {
                          ok: false,
                          why: "Colonels, generals, war chiefs, the marshal or the governor",
                        },
                    () => ui.cmd({ k: "command", army: a.id }),
                    "small",
                    undefined,
                    false,
                  )}
            </li>`;
          })}
        </ul>`
    : nothing}`;
}
