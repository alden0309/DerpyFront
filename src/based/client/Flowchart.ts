// The flowchart, in the manner of Detroit's: every scene in order down a
// spine, the choices in each branching off it. What you've taken is lit;
// what you've never taken is blacked out like a redacted line (r22 BPLAY);
// and each option shows what share of players chose it ("You", while
// you're the only one).

import { html, nothing, TemplateResult } from "lit";
import { FlowScene } from "../engine/Flow";
import { ChapterSeen } from "../engine/Save";

/** A redaction bar, its width from the id (not from what it hides). */
function redact(id: string, min = 4, spread = 9): TemplateResult {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return html`<span
    class="mb-redact"
    style="width:${min + (h % spread)}ch"
    aria-label="Not yet found"
  ></span>`;
}

export interface FlowInput {
  flow: FlowScene[];
  seen: ChapterSeen;
  /** This run's path, to pick out the route just taken. */
  path: string[];
  players: number;
  picks: Record<string, Record<string, number>>;
}

/** The scenes, with each run of ones not yet found gathered into a list. */
function runs(
  flow: FlowScene[],
  seen: Set<string>,
): (FlowScene | FlowScene[])[] {
  const out: (FlowScene | FlowScene[])[] = [];
  for (const s of flow) {
    const last = out[out.length - 1];
    if (seen.has(s.id)) out.push(s);
    else if (Array.isArray(last)) last.push(s);
    else out.push([s]);
  }
  return out;
}

export function renderFlowchart(f: FlowInput): TemplateResult {
  const seenScenes = new Set(f.seen.scenes);
  const seenOptions = new Set(f.seen.options);
  const found = new Set(f.seen.found ?? []);
  const nowScenes = new Set(
    f.path.filter((s) => s.startsWith("s:")).map((s) => s.slice(2)),
  );
  const nowOptions = new Set(
    f.path.filter((s) => s.startsWith("c:")).map((s) => s.slice(2)),
  );
  const totalOptions = f.flow.reduce(
    (n, s) => n + s.choices.reduce((m, c) => m + c.options.length, 0),
    0,
  );
  const knownOptions = f.flow.reduce(
    (n, s) =>
      n +
      s.choices.reduce(
        (m, c) =>
          m +
          c.options.filter((o) => seenOptions.has(`${c.id}=${o.id}`)).length,
        0,
      ),
    0,
  );
  const share = (choice: string, option: string): string | null => {
    // Alone, every path you've lit is simply yours.
    if (f.players <= 1) return "You";
    const counts = f.picks[choice];
    if (!counts) return null;
    const n = counts[option] ?? 0;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0 || n === 0) return "0%";
    return `${Math.round((100 * n) / total)}%`;
  };

  return html`<div class="mb-flow">
    <div class="mb-flow-key">
      <span><i class="lit"></i>Taken</span>
      <span><i class="now"></i>This time</span>
      <span><i class="locked"></i>Not yet found</span>
      <span class="mb-flow-progress"
        >${knownOptions} of ${totalOptions} paths found</span
      >
    </div>
    <ol class="mb-flow-spine">
      ${runs(f.flow, seenScenes).map((s) => {
        if (Array.isArray(s)) {
          // r22 BPLAY: scenes not yet found, one after another: one line.
          return html`<li class="mb-flow-scene locked run">
            <div class="mb-flow-node">
              <span class="mb-flow-dot"></span>
              <span class="mb-flow-label">${redact(s[0].id, 6, 10)}</span>
              ${s.length > 1
                ? html`<span class="mb-flow-cp">and ${s.length - 1} more</span>`
                : nothing}
            </div>
          </li>`;
        }
        const known = seenScenes.has(s.id);
        const now = nowScenes.has(s.id);
        return html`<li
          class="mb-flow-scene ${known ? "known" : "locked"} ${now
            ? "now"
            : ""}"
        >
          <div class="mb-flow-node">
            <span class="mb-flow-dot"></span>
            <span class="mb-flow-label"
              >${known ? s.label : redact(s.id, 6, 10)}</span
            >
            ${s.on && known
              ? html`<span class="mb-flow-cp" title="Found by exploring"
                  >◇</span
                >`
              : nothing}
          </div>
          ${known
            ? html`${s.choices.map(
                (c) =>
                  html`<div class="mb-flow-choice">
                    ${c.prompt
                      ? html`<div class="mb-flow-prompt">${c.prompt}</div>`
                      : nothing}
                    <div class="mb-flow-options">
                      ${c.options.map((o) => {
                        const key = `${c.id}=${o.id}`;
                        const lit = seenOptions.has(key);
                        const tookNow = nowOptions.has(key);
                        const pct = lit ? share(c.id, o.id) : null;
                        return html`<span
                          class="mb-flow-opt ${lit ? "lit" : "locked"} ${tookNow
                            ? "now"
                            : ""}"
                        >
                          ${lit ? o.label : redact(key, 3, 8)}
                          ${pct ? html`<small>${pct}</small>` : nothing}
                        </span>`;
                      })}
                    </div>
                  </div>`,
              )}
              ${s.looks.map((l) => {
                const made = l.deductions.filter((d) => found.has(d.id));
                return html`<div class="mb-flow-look">
                  <span class="mb-read">Read</span> ${l.title}
                  ${l.deductions.length > 0
                    ? html`<span class="mb-flow-ded">
                        ${made.length} of ${l.deductions.length} worked
                        out</span
                      >`
                    : nothing}
                </div>`;
              })}`
            : nothing}
        </li>`;
      })}
    </ol>
  </div>`;
}
