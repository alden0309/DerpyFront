import { findEffectForSlot } from "@openfront/shared/CosmeticSchemas";
import { DERPY_DOME_STYLES } from "@openfront/shared/DerpyFx";
import {
  PlayerCosmeticRefs,
  PlayerEffect,
  PlayerSkin,
} from "@openfront/shared/WireSchemas";
import { logger } from "../Logger";
import { ownedItemsForPlayId } from "./DerpyAuth";
import {
  allDerpySkins,
  derpyCosmeticsCatalog,
  ownedAiTypes,
} from "./DerpyCatalog";
import { derpyDbConfigured } from "./DerpyDb";

const log = logger.child({ component: "DerpySkins" });

/**
 * The Derp Store skin a joining player may wear: the one they picked, if the
 * account they're signed in to owns it. Anything else (no such skin, not
 * owned, signed out, database down) just means no skin, never a refused join.
 */
export async function derpySkinForPlayer(
  playId: string,
  skinName: string | undefined,
): Promise<PlayerSkin | null> {
  if (!skinName || !derpyDbConfigured()) return null;
  const skin = allDerpySkins().find((s) => s.name === skinName);
  if (skin === undefined) return null;
  try {
    const owned = await ownedItemsForPlayId(playId);
    return owned.includes(`skin:${skin.name}`)
      ? { name: skin.name, url: skin.url }
      : null;
  } catch (err) {
    log.warn(`skin check failed: ${err}`);
    return null;
  }
}

// ---- DFSTORE (r21): the other Derp Store looks, and AI personality packs ----

/** What a joining player may wear from the Derp Store, by what they own. */
export interface DerpyLooks {
  skin?: PlayerSkin;
  /** Nuke trails and bursts, by slot (see effectTypeForSlot). */
  effects?: Record<string, PlayerEffect>;
  /** Their Domes' style (a Nuke & Dome effect pack's name). */
  derpyDome?: string;
}

/**
 * The Derp Store looks `refs` asks for that `owned` covers. Anything else (no
 * such look, not owned) is simply left off, never a refused join.
 */
export function derpyLooksFor(
  owned: readonly string[],
  refs: Pick<PlayerCosmeticRefs, "skinName" | "effects" | "derpyDome">,
): DerpyLooks {
  const looks: DerpyLooks = {};
  if (refs.skinName) {
    const skin = allDerpySkins().find((s) => s.name === refs.skinName);
    if (skin && owned.includes(`skin:${skin.name}`)) {
      looks.skin = { name: skin.name, url: skin.url };
    }
  }
  if (refs.effects) {
    const catalog = derpyCosmeticsCatalog();
    for (const [slot, name] of Object.entries(refs.effects)) {
      const effect = findEffectForSlot(catalog, slot, name);
      if (!effect || !owned.includes(`effect:${effect.name}`)) continue;
      looks.effects ??= {};
      looks.effects[slot] = {
        name: effect.name,
        effectType: effect.effectType,
      };
    }
  }
  if (
    refs.derpyDome &&
    DERPY_DOME_STYLES.has(refs.derpyDome) &&
    owned.includes(`dome:${refs.derpyDome}`)
  ) {
    looks.derpyDome = refs.derpyDome;
  }
  return looks;
}

/** The Derp Store looks a joining player may wear (see derpyLooksFor). */
export async function derpyLooksForPlayer(
  playId: string,
  refs: Pick<PlayerCosmeticRefs, "skinName" | "effects" | "derpyDome"> = {},
): Promise<DerpyLooks> {
  if (!refs.skinName && !refs.effects && !refs.derpyDome) return {};
  if (!derpyDbConfigured()) return {};
  try {
    return derpyLooksFor(await ownedItemsForPlayId(playId), refs);
  } catch (err) {
    log.warn(`looks check failed: ${err}`);
    return {};
  }
}

/**
 * AIP (r23): the AI personalities ("trader", ...), of those a host asked
 * for, that the account they play under owns. Nothing (signed out, database
 * down) means none. Normal is free and needs no asking.
 */
export async function ownedAiPersonalities(
  playId: string,
  asked: readonly string[],
): Promise<string[]> {
  if (asked.length === 0 || !derpyDbConfigured()) return [];
  try {
    const owned = ownedAiTypes(await ownedItemsForPlayId(playId));
    return owned.filter((t) => asked.includes(t));
  } catch (err) {
    log.warn(`personality check failed: ${err}`);
    return [];
  }
}
