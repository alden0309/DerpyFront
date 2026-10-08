// Where you are: the province, its places and what you can do at each, the
// work they offer, and the people you could meet. Any other province gets a
// page too: who holds it, what's there, and the road to it.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import { actCheck, actOdds, actsAt } from "../../engine/LifeActs";
import {
  isChildLife,
  isNativeChar,
  isPlayed,
  jobCheck,
  lifeIsNative,
  lifeOfChar,
  opinionOf,
  peopleHere,
  placesIn,
  promotionView,
  travelRoute,
} from "../../engine/LifeQueries";
import {
  COMMAND_RANK,
  EUROPE_FORTUNE,
  JOBS,
  PLACES,
  ROLES,
} from "../../engine/LifeRules";
import { joinCheck, movementOf, movementsHere } from "../../engine/Movements";
import { standCheck } from "../../engine/Politics";
import {
  ageOf,
  armyMen,
  charName,
  holder,
  settlers,
  tribesfolk,
} from "../../engine/Queries";
import type { Character, JobKind, PlaceKind } from "../../engine/Types";
import { flagFor } from "../Flags";
import { placeIcon } from "../Icons";
import {
  GOOD_NAMES,
  nationName,
  people as peopleText,
  TERRAIN_NAMES,
} from "../Text";
import { num } from "../Tip";
import {
  action,
  breakdownTip,
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

/** The province you're in, and everything you can do there. */
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
    : places(ui, p)}
  ${t ? nothing : peopleSection(ui, p)}`;
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

function places(ui: GameUi, p: number): TemplateResult {
  const s = ui.s;
  const list = placesIn(s, ui.w, p);
  return html`<div class="cq-places">
    ${list.map((pl) => placeCard(ui, p, pl))}
  </div>`;
}

function placeCard(ui: GameUi, p: number, place: PlaceKind): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const def = PLACES[place];
  const native = lifeIsNative(s, life);
  const ownerNative =
    s.provinces[p].owner >= 0 &&
    s.nations[s.provinces[p].owner].kind === "native";
  const acts = actsAt(place)
    .map((a) => ({ a, check: actCheck(s, ui.w, life, place, a.key) }))
    .filter(({ a, check }) => {
      // Buying the next rung is done where you work.
      if (a.key === "buy")
        return life.job?.place === place && life.job.prov === p
          ? check.ok || !/^The next rung/.test(check.why)
          : false;
      // Hide what can't apply to you here: others' faith, other peoples'
      // work, a cause or campaign you haven't got.
      return (
        check.ok ||
        !/^(Only|Not open|Land isn't|Your people|Not your way|You belong to no|You're not standing)/.test(
          check.why,
        )
      );
    });
  const jobs = (Object.keys(JOBS) as JobKind[]).filter(
    (k) =>
      JOBS[k].places.includes(place) &&
      (JOBS[k].native === null || JOBS[k].native === native) &&
      k !== "servant",
  );
  const here = life.job && life.job.place === place && life.job.prov === p;
  const movements =
    place === "tavern" || place === "councilfire" ? movementsHere(s, p) : [];
  const armies =
    place === "fort" || place === "councilfire"
      ? s.armies.filter(
          (a) =>
            a.prov === p &&
            a.depart < 0 &&
            (a.owner === me.nation || a.owner === life.job?.nation),
        )
      : [];
  return html`<article class="cq-place ${here ? "mine" : ""}">
    <h3 class="cq-place-name">
      <span class="cq-place-icon" aria-hidden="true">${placeIcon(place)}</span>
      ${ownerNative && def.nativeName ? def.nativeName : def.name}
      ${here ? html`<span class="cq-chip good">you work here</span>` : nothing}
    </h3>
    <p class="cq-place-text">${def.text}</p>
    ${jobs.length && !isChildLife(s, life)
      ? html`<ul class="cq-jobs">
          ${jobs.map((k) => {
            const j = JOBS[k];
            const check = jobCheck(s, ui.w, life, place, k);
            const mine = life.job?.kind === k && life.job.prov === p;
            return html`<li>
              <span class="cq-job-name"
                ><b>${j.ranks[0].title}</b>
                <span class="cq-muted small"
                  >${j.name.toLowerCase()}, ${j.ranks[0].wage} a month; up to
                  ${j.ranks[j.ranks.length - 1].title.toLowerCase()}</span
                ></span
              >
              ${mine
                ? nothing
                : action(
                    "Take it",
                    check,
                    () => ui.cmd({ k: "job", place, job: k }),
                    "small",
                    j.text,
                    false,
                  )}
            </li>`;
          })}
        </ul>`
      : nothing}
    <div class="cq-acts">
      ${acts.map(({ a, check }) => {
        const o = actOdds(s, life, a.key);
        const label = a.key === "buy" ? buyLabel(ui) : a.label;
        return html`<button
          class="cq-act-btn"
          ?disabled=${!check.ok}
          title=${check.ok ? a.text : `${check.why} ${a.text}`}
          @click=${() => ui.cmd({ k: "act", place, act: a.key })}
        >
          <span>${label}</span>${odds(o)}${!check.ok
            ? html`<span class="cq-act-why">${check.why}</span>`
            : nothing}
        </button>`;
      })}
      ${place === "market" ||
      (place === "village" && ownerNative) ||
      place === "docks"
        ? html`<button
            class="cq-act-btn"
            @click=${() => ui.modal({ k: "trade" })}
          >
            <span>Buy and sell goods</span>
          </button>`
        : nothing}
      ${place === "governor" || (place === "councilfire" && ownerNative)
        ? standButton(ui)
        : nothing}
      ${place === "docks" ? europeButton(ui) : nothing}
    </div>
    ${movements.length
      ? html`<ul class="cq-movements-here">
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
      ? html`<ul class="cq-movements-here">
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
      : nothing}
  </article>`;
}

function buyLabel(ui: GameUi): string {
  const life = ui.life!;
  const v = promotionView(ui.s, life);
  return v.next?.buy
    ? `Buy ${v.next.buy.what} (${v.next.buy.cost})`
    : "Buy your way up";
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

/** Everyone you could meet here, with what they think of you. */
function peopleSection(ui: GameUi, p: number): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const list = peopleHere(s, p, life ?? undefined);
  if (list.length === 0)
    return section("People here", html`<p class="cq-empty">Nobody about.</p>`);
  const rank = (c: Character) => {
    const n = s.nations[c.nation];
    if (n?.ruler === c.id) return 10;
    if (isPlayed(s, c.id)) return 9;
    return c.role ? ROLES[c.role].status : 0;
  };
  list.sort((a, b) => rank(b) - rank(a) || a.id - b.id);
  return section(
    "People here",
    html`<ul class="cq-folk">
      ${list.map((c) => personRow(ui, c))}
    </ul>`,
  );
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
