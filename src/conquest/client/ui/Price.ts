// LEDGER (r15): what a button costs, on the button. One small coin chip for
// every button or option that spends money (and a green one for money that
// comes to you), so the price is there before you click, not only in a
// tooltip. Red when you can't afford it, with how much you're short.
// The convention is written down in scratchpad/conquest-r15/CONVENTIONS.md.

import { html, nothing, TemplateResult } from "lit";

export interface PriceOpts {
  /** Your purse: the chip turns red, and says how short you are, if it's less. */
  have?: number;
  /** A recurring cost: "3 a month". */
  per?: "month" | "trip" | "year" | "each";
  /** Money that comes to you (a sale): a green chip with a plus. */
  gain?: boolean;
  /** An expected figure, not a certain one ("≈"). */
  approx?: boolean;
  /** Extra words for the tooltip. */
  note?: string;
}

/** A coin amount, as figures: 4, 2.5, 1,250. */
export function coins(n: number): string {
  const v = Math.round(Math.abs(n) * 10) / 10;
  return v >= 1000
    ? Math.round(v).toLocaleString("en-US")
    : Number.isInteger(v)
      ? String(v)
      : v.toFixed(1);
}

/** "20 coins", "1 coin", for sentences and confirm() dialogs. */
export function priceWords(n: number): string {
  const v = coins(n);
  return `${v} coin${v === "1" ? "" : "s"}`;
}

const PER: Record<NonNullable<PriceOpts["per"]>, string> = {
  month: "a month",
  trip: "a trip",
  year: "a year",
  each: "each",
};

/**
 * The coin chip: put it in the button's label, after the words.
 * `html\`Hire a crew ${price(12, { have: life.purse })}\``
 */
export function price(amount: number, o: PriceOpts = {}): TemplateResult {
  if (!Number.isFinite(amount)) return html``;
  const short = !o.gain && o.have !== undefined && o.have < amount;
  const per = o.per ? PER[o.per] : "";
  const words = o.gain
    ? `You'd get ${priceWords(amount)}${per ? ` ${per}` : ""}`
    : `Costs ${priceWords(amount)}${per ? ` ${per}` : ""}`;
  const title = [
    words,
    short
      ? `you have ${coins(Math.max(0, o.have!))}: ${coins(amount - (o.have ?? 0))} short`
      : "",
    o.note ?? "",
  ]
    .filter(Boolean)
    .join("; ");
  return html`<span
    class="cq-price ${short ? "short" : ""} ${o.gain ? "gain" : ""}"
    title=${title}
    ><i class="cq-price-coin" aria-hidden="true"></i>${o.approx
      ? "≈"
      : ""}${o.gain ? "+" : ""}${coins(amount)}${per
      ? html`<span class="per"> ${per}</span>`
      : nothing}</span
  >`;
}

/** A label and its price chip: "Hire a crew [12]". */
export function priced(
  label: string | TemplateResult,
  amount: number | null | undefined,
  o: PriceOpts = {},
): TemplateResult {
  return amount ? html`${label}${price(amount, o)}` : html`${label}`;
}

/**
 * The price an engine label carries at its end ("Buy ten acres (22)"): the
 * words without it, and the amount, so the amount can go in a chip.
 */
export function splitPrice(label: string): {
  text: string;
  cost: number | null;
} {
  const m = /^(.*?)\s*\((\d+(?:\.\d+)?)(?: coins)?\)$/.exec(label);
  if (m) return { text: m[1], cost: Number(m[2]) };
  // CHAIR (r16): a price followed by the skill check's odds the engine
  // appends ("Bribe them (5 coins) (Persuasion 62%)"): the odds stay in the
  // words, the price goes in the chip.
  const k =
    /^(.*?)\s*\((\d+(?:\.\d+)?)(?: coins)?\)(\s*\([A-Z][a-z]+ \d+%\))$/.exec(
      label,
    );
  return k
    ? { text: `${k[1]}${k[3]}`, cost: Number(k[2]) }
    : { text: label, cost: null };
}
