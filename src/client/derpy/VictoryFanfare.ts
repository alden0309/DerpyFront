// Derpy Front (DFSTORE r21): the victory fanfare you chose, played when you
// win, through the game's own audio (the master volume and the music slider,
// so muting either silences it).

import { Howler } from "howler";
import { audioMixer, perceptualGain } from "../sound/AudioMixer";
import { UserSettings } from "../UserSettings";
import { derpyMe } from "./DerpyAccount";
import {
  chosenFanfare,
  FanfareName,
  FanfarePlayback,
  playFanfare,
} from "./Fanfares";

let playing: FanfarePlayback | null = null;

/**
 * How loud music plays now: the music channel (0 when muted) and the master
 * volume, kept apart because Howler's master gain may apply the latter.
 */
function musicVolume(): { channel: number; master: number } {
  const s = new UserSettings();
  const master = perceptualGain(s.audioVolume("master"));
  const mixer = audioMixer();
  if (mixer !== null) {
    if (!mixer.isAudible("music")) return { channel: 0, master };
    return { channel: mixer.volumeFor("music"), master };
  }
  return { channel: perceptualGain(s.audioVolume("music")), master };
}

/** The fanfare you chose, if your account owns it. */
export async function ownedChosenFanfare(): Promise<FanfareName | null> {
  const name = chosenFanfare();
  if (name === null) return null;
  const me = await derpyMe();
  return me?.owned.includes(`pack:${name}`) ? name : null;
}

/**
 * Plays `name` (or the fanfare you chose and own). Resolves to whether one
 * played: false with none chosen, not owned, or music muted, so the usual
 * victory sound can play instead.
 */
export async function playVictoryFanfare(
  name?: FanfareName | null,
): Promise<boolean> {
  const chosen = name ?? (await ownedChosenFanfare());
  if (chosen === null) return false;
  const { channel, master } = musicVolume();
  if (channel <= 0 || master <= 0) return false;
  playing?.stop();
  const ctx = (Howler.ctx as AudioContext | undefined) ?? null;
  const masterGain = (Howler.masterGain as GainNode | undefined) ?? null;
  playing = playFanfare(chosen, {
    ctx,
    // Through Howler's master gain when there is one (it applies the master
    // slider); straight out otherwise, with the master slider applied here.
    destination: masterGain,
    volume: masterGain === null ? channel * master : channel,
  });
  return playing !== null;
}

export function stopVictoryFanfare(): void {
  playing?.stop();
  playing = null;
}
