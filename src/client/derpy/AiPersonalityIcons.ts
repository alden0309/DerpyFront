// AIP (r23): the four AI personalities' icons and badge colours, for every
// page that shows them (DerpyFront's lobby, store and HUD, and Derp Land's
// store). No translations here, so Derp Land can use it as it is; the words
// are in AiPersonalityLabels.ts and en.json's ai_personalities.*.

import type { AiChoice } from "@openfront/engine-lib/game/AiPersonalityTypes";

/** An icon a glance can tell apart from the others (and from the HUD's own). */
export const AI_CHOICE_ICON: Readonly<Record<AiChoice, string>> = {
  normal: "🏛️",
  mad_scientist: "🧪",
  trader: "⚓",
  aggressive: "🔥",
  protector: "🛡️",
};

/** Tailwind classes for a personality's badge: border, wash and text. */
export const AI_CHOICE_BADGE: Readonly<Record<AiChoice, string>> = {
  normal: "border-zinc-400/30 bg-zinc-500/10 text-zinc-200",
  mad_scientist: "border-lime-400/40 bg-lime-500/10 text-lime-200",
  trader: "border-sky-400/40 bg-sky-500/10 text-sky-200",
  aggressive: "border-orange-400/40 bg-orange-500/10 text-orange-200",
  protector: "border-amber-300/40 bg-amber-400/10 text-amber-100",
};
