import { PlayerSkin } from "@openfront/shared/WireSchemas";
import { logger } from "../Logger";
import { ownedItemsForPlayId } from "./DerpyAuth";
import { allDerpySkins } from "./DerpyCatalog";
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
