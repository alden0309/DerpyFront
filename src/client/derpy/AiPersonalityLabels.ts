// AIP (r23): how the four AI personalities read in DerpyFront's UI: a name
// and a one-line hint each (en.json's ai_personalities.type_* and hint_*),
// beside the icons of AiPersonalityIcons.ts. The lobby's picker, the Derp
// Store, and the in-game info panel, tooltip, leaderboard and menu use them.

import {
  AiChoice,
  AiType,
  isAiType,
} from "@openfront/engine-lib/game/AiPersonalityTypes";
import { translateText } from "../Utils";
import { AI_CHOICE_ICON } from "./AiPersonalityIcons";

export { AI_CHOICE_BADGE, AI_CHOICE_ICON } from "./AiPersonalityIcons";

/** The personality a nation's update named, if it is one we know. */
export function aiTypeOf(value: string | null | undefined): AiType | null {
  return value && isAiType(value) ? value : null;
}

export function aiChoiceName(choice: AiChoice): string {
  return translateText(`ai_personalities.type_${choice}`);
}

export function aiChoiceHint(choice: AiChoice): string {
  return translateText(`ai_personalities.hint_${choice}`);
}

/** "🧪 Mad Scientist". */
export function aiChoiceLabel(choice: AiChoice): string {
  return `${AI_CHOICE_ICON[choice]} ${aiChoiceName(choice)}`;
}
