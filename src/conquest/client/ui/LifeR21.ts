// LIFE (r21): round 21's pieces of the character sheet, a person's page,
// the teaching window, a challenge to the death, and your people's posts.
// Each is a small render function the existing pages call in a marked line.

import { html, nothing, TemplateResult } from "lit";
import {
  KNOW_WORDS,
  statsView,
  type FoggedNumber,
} from "../../engine/Acquaint";
import { bodyNotes, maxHealthOf, stressTier } from "../../engine/Body";
import { deathAgree, deathOdds, deathWords } from "../../engine/Duels";
import type { InteractionView } from "../../engine/Interactions";
import { skillOf } from "../../engine/LifeQueries";
import { markOn, STUDY, studyOf } from "../../engine/LifeR21Core";
import {
  ATTRIBUTE_NAMES,
  SKILL_HELP,
  SKILL_MAX,
  SKILL_NAMES,
  skillTier,
  xpToNext,
} from "../../engine/LifeRules";
import { chanceWords } from "../../engine/Odds";
import {
  holderOf,
  POST_ORDER,
  postEffect,
  POSTS,
  postSkill,
} from "../../engine/Retinue";
import { TEACH } from "../../engine/Teach";
import type { Character, Follower, PostKey, Skill } from "../../engine/Types";
import { SKILLS } from "../../engine/Types";
import { num, plain } from "../Tip";
import { bar, breakdownTip, GameUi, section } from "./Context";
import { price } from "./Price";
import { term } from "./Terms";

const pc = (p: number) => `${Math.round(p * 100)}%`;

// ---------------------------------------------------------------- your sheet

/** Health, with the most it can be now marked on the bar, and the strain. */
export function healthMeter(ui: GameUi): TemplateResult {
  const life = ui.life!;
  const mh = maxHealthOf(ui.s, ui.me ?? undefined, life);
  const t = stressTier(life.stress);
  const notes = bodyNotes(ui.s, life);
  return html`<div class="cq-meter cq-health21">
    <span class="cq-meter-label">${term("health")}</span>
    <span class="cq-capbar">
      ${bar(life.health / 100)}
      ${mh.total < 100
        ? html`<span
            class="cq-cap"
            style="left:${mh.total}%"
            title="The most your health can be now: ${mh.total}"
          ></span>`
        : nothing}
    </span>
    ${num(
      html`${Math.round(life.health)}<span class="cq-muted small"
          >/${mh.total}</span
        >`,
      () => ({
        title: "Health",
        b: { total: mh.total, parts: mh.parts },
        notes,
      }),
      "cq-meter-n",
    )}
    ${t.mult > 1
      ? html`<span class="cq-muted small cq-strain"
          >${t.name}: hurts take ×${t.mult}</span
        >`
      : nothing}
  </div>`;
}

/** The skills, each with its tier, its progress to the next level and what that costs. */
export function skillsList(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  return html`<ul class="cq-skills cq-skills21">
    ${SKILLS.map((sk) => {
      const b = skillOf(s, life, sk);
      const learned = life.skills[sk] ?? 0;
      const top = learned >= SKILL_MAX;
      const xp = Math.floor(life.xp[sk] ?? 0);
      const need = xpToNext(learned);
      const tier = skillTier(b.total);
      return html`<li title=${SKILL_HELP[sk]}>
        <span class="cq-skill-name"
          >${SKILL_NAMES[sk]}
          <span class="cq-skill-tier" title=${tier.text}
            >${tier.name.toLowerCase()}</span
          ></span
        >
        ${bar(top ? 1 : xp / need, "xp")}
        <span class="cq-skill-next"
          >${top
            ? "the most there is"
            : html`${plain(xp)} / ${plain(need)} to ${learned + 1}`}</span
        >
        ${num(
          String(b.total),
          () =>
            breakdownTip(SKILL_NAMES[sk], b, undefined, [
              SKILL_HELP[sk],
              top
                ? `Learned to ${SKILL_MAX}, the most there is.`
                : `Learned to ${learned}: ${xp} of ${need} toward ${learned + 1}. Each level costs more than the last (${xpToNext(Math.min(SKILL_MAX - 1, learned + 1))} for the one after).`,
              `${tier.name}: ${tier.text}`,
            ]),
          "cq-skill-n",
        )}
      </li>`;
    })}
  </ul>`;
}

/** Study's progress toward the next point of Learning. */
export function studyLine(ui: GameUi): TemplateResult | typeof nothing {
  const st = studyOf(ui.life!);
  if (!st.pts && !st.grown) return nothing;
  return html`<p class="cq-muted small cq-study21">
    Learning grown by study: ${st.grown} of
    ${STUDY.most}${st.grown < STUDY.most
      ? `; ${Math.ceil((STUDY.per - st.pts) / STUDY.pts)} lessons with the minister to the next`
      : ""}.
  </p>`;
}

/** What you carry for a while: a coward's name, a rake's, the pox. */
export function marksChips(ui: GameUi): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life!;
  const out: TemplateResult[] = [];
  const coward = markOn(s, life, "coward");
  if (coward)
    out.push(
      html`<span
        class="cq-chip bad"
        title="You ran from a duel to the death. Everyone thinks less of you (−12; the brave and the soldiers −20), until the town forgets."
        >Called a coward</span
      >`,
    );
  if (markOn(s, life, "rake"))
    out.push(
      html`<span
        class="cq-chip bad"
        title="Seen at the bawdy house: the godly and the minister think less of you (−12), others a little (−3), for a year after the last time."
        >Known at the bawdy house</span
      >`,
    );
  if (markOn(s, life, "pox"))
    out.push(
      html`<span
        class="cq-chip bad"
        title="The French pox: the most your health can be is 10 less, for good."
        >The French pox</span
      >`,
    );
  return out.length ? html`<span class="cq-traits">${out}</span>` : nothing;
}

// ---------------------------------------------------------------- someone's page

function fogged(v: FoggedNumber): string {
  if (v.value !== null) return String(v.value);
  if (v.lo !== undefined && v.hi !== undefined) return `${v.lo}–${v.hi}`;
  return "?";
}

/** Their stats, as you'd know them: combat, the duel's odds, attributes, skills. */
export function statsSection(ui: GameUi, c: Character): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  if (!life || life.c < 0 || !c.alive) return html``;
  const v = statsView(s, life, c);
  const kw = KNOW_WORDS[v.know];
  const exact = v.know >= 3;
  const odds = (p: number) =>
    exact ? pc(p) : `about ${Math.round(p * 10) * 10}%`;
  const d = v.duel;
  const traitLines = (xs: { label: string; value: number }[]) =>
    xs.length
      ? xs
          .map((x) => `${x.label} ${x.value > 0 ? "+" : ""}${x.value}`)
          .join(", ")
      : "nothing either way";
  return section(
    html`Their stats
      <span class="cq-muted small" title=${`${kw.text} (${v.knowWhy})`}
        >${kw.name.toLowerCase()}</span
      >`,
    html`<div class="cq-stats21">
      <div class="cq-stats21-fight">
        <h4 class="cq-int-group">In a fight</h4>
        <dl class="cq-family">
          <dt>Fighting</dt>
          <dd>${fogged(v.fighting)}</dd>
          <dt>Health</dt>
          <dd>${v.health.words}</dd>
          ${d
            ? html`<dt>Traits that tell</dt>
                <dd>${traitLines(d.theirs)}</dd>
                <dt>A duel with them</dt>
                <dd>
                  swords: ${odds(d.sword)} at each pass, keeping your guard;
                  pistols: ${odds(d.pistol)} you hit, ${odds(d.theirPistol)}
                  they do
                </dd>
                <dt>To the death</dt>
                <dd>
                  ${odds(d.death.win)} you walk off the field (swords),
                  ${odds(d.deathPistols.win)} (pistols)
                </dd>`
            : nothing}
          ${v.opinion !== null
            ? html`<dt>What they think of you</dt>
                <dd>${v.opinion > 0 ? "+" : ""}${v.opinion}</dd>`
            : nothing}
        </dl>
      </div>
      <div class="cq-stats21-grid">
        <h4 class="cq-int-group">Attributes</h4>
        <div class="cq-stats21-cells">
          ${v.attributes.map(
            (a) =>
              html`<span
                class="cq-stats21-cell ${a.v.value === null ? "fog" : ""}"
                ><span>${ATTRIBUTE_NAMES[a.stat]}</span
                ><b>${fogged(a.v)}</b></span
              >`,
          )}
        </div>
        <h4 class="cq-int-group">Skills</h4>
        <div class="cq-stats21-cells">
          ${v.skills.map(
            (k) =>
              html`<span
                class="cq-stats21-cell ${k.v.value === null
                  ? "fog"
                  : ""} ${k.skill === v.trade ? "trade" : ""}"
                ><span>${SKILL_NAMES[k.skill]}</span><b>${fogged(k.v)}</b></span
              >`,
          )}
        </div>
        <p class="cq-muted small">
          ${kw.text}${v.know < 3
            ? " A question mark is what you can't tell; a range is your guess."
            : ""}
        </p>
      </div>
    </div>`,
  );
}

// ---------------------------------------------------------------- the interaction window

/** "Ask them to teach you": the skill, their level against yours, the rate and a forecast. */
export function teachPanel(
  ui: GameUi,
  c: Character,
  v: InteractionView,
): TemplateResult | typeof nothing {
  const t = v.teach;
  if (!t) return nothing;
  const sk = SKILL_NAMES[t.skill as Skill];
  return html`<div class="cq-teach21">
    <p>
      <b>${sk}</b>: ${c.first}'s ${t.theirs} against your ${t.mine}.
      ${t.rate > 0
        ? html`They'd teach at <b>×${t.rate}</b>: about
            <b>${plain(t.perMonth)}</b> a
            month${t.near
              ? ""
              : " (by letter and visits, a third as much: they live elsewhere)"}${t.work
              ? html`, and your own work in it adds ${plain(t.work)}`
              : ""}.`
        : html`They've nothing more to teach you.`}
    </p>
    <p class="cq-muted small">
      Your ${sk.toLowerCase()} is learned to ${t.learned}: ${t.xp} of ${t.need}
      toward ${t.learned + 1}.
      ${t.nextIn !== null
        ? `With them, the next level in about ${t.nextIn} month${t.nextIn === 1 ? "" : "s"}${t.nextAlone !== null ? ` (${t.nextAlone} without)` : ""}; after a year, about ${t.yearLevel}${t.yearAlone !== t.learned ? ` (${t.yearAlone} without)` : ""}.`
        : ""}
      A teacher ${TEACH.gap} above you teaches at ×${TEACH.atGap}; each level
      more adds ×${TEACH.perLevel}, to ×${TEACH.most}. As you catch them up, it
      slows.
    </p>
  </div>`;
}

/** A challenge to the death: whether they'd take it, and how it would go. */
export function deathPanel(
  ui: GameUi,
  c: Character,
  m: { act: string; arg?: number },
  player: boolean,
): TemplateResult | typeof nothing {
  if (m.act !== "duel" || m.arg !== 1) return nothing;
  const life = ui.life!;
  const ctx = { c: c.id, sec: -1, mw: 0, fw: 0, r: 0 };
  const sw = deathOdds(ui.s, life, { ...ctx, w: 1 });
  const ps = deathOdds(ui.s, life, { ...ctx, w: 2 }, "aim");
  const agree = player ? null : deathAgree(ui.s, life, c);
  return html`<div class="cq-teach21 cq-death21">
    <p>
      <b>To the death</b>: no first blood, no shots into the air, no yielding.
      The one who goes down doesn't get up. Losing, you may run for it, and be
      called a coward for three years.
    </p>
    <p class="small">
      With smallswords, ${deathWords(sw)}. With pistols, ${deathWords(ps)}.
    </p>
    ${agree
      ? html`<p class="small">
          ${num(
            html`They'd take your terms:
              <b>${chanceWords(agree.chance)}</b> (${pc(agree.chance)})`,
            () => breakdownTip("Would they fight to the death?", agree.why),
          )}.
          If not, it's the ordinary terms.
        </p>`
      : html`<p class="small">
          ${c.first} is another player: they'll accept your terms, or refuse.
        </p>`}
  </div>`;
}

// ---------------------------------------------------------------- your people

/** One of your people: their post (or none), what it does by their skill, and its pay. */
export function postRow(ui: GameUi, f: Follower): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const pick = (post: string) =>
    void ui.cmd({
      k: "r21",
      act: "post",
      id: f.id,
      post: post as PostKey | "",
    });
  const cur = f.post;
  const held = (k: PostKey) => {
    const h = holderOf(s, life, k);
    return h && h.id !== f.id ? s.chars[h.c]?.first : undefined;
  };
  return html`<div class="cq-post21">
    <label class="small"
      >Post:
      <select
        @change=${(e: Event) => pick((e.target as HTMLSelectElement).value)}
      >
        <option value="" ?selected=${!cur}>none</option>
        ${POST_ORDER.map((k) => {
          const sk = postSkill(s, f, k);
          const other = held(k);
          return html`<option value=${k} ?selected=${cur === k}>
            ${POSTS[k].name} (${SKILL_NAMES[POSTS[k].skill].toLowerCase()}
            ${sk})${other ? `, now ${other}` : ""}
          </option>`;
        })}
      </select></label
    >
    ${cur
      ? html`<span class="small cq-post21-fx"
            >${postEffect(cur, postSkill(s, f, cur)).words}${f.task
              ? html` <span class="bad"
                  >(away: nothing while they're gone)</span
                >`
              : nothing}</span
          >${price(POSTS[cur].extra, {
            per: "month",
            note: "over their wages, for the post",
          })}`
      : html`<span class="cq-muted small"
          >No post: they do no more than they're sent to.</span
        >`}
  </div>`;
}
