// SITE (r19): the games being played now, for the pages that list them (the
// Derp Land front page and DerpyFront's). One request every few seconds
// while the page is in view; nothing while it's hidden, or while a game of
// DerpyFront is being played in this tab.

import type { LiveGames } from "./LiveTypes";

export const LIVE_POLL_MS = 10_000;

export async function fetchLive(): Promise<LiveGames | null> {
  try {
    const res = await fetch("/derpy/api/live", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as LiveGames;
  } catch {
    return null;
  }
}

/**
 * Calls `fn` with the games being played now (null: the server couldn't say),
 * straight away and then every LIVE_POLL_MS while the page is visible.
 * Returns a function that stops it.
 */
export function watchLive(fn: (g: LiveGames | null) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let busy = false;
  let stopped = false;
  let inGame = false;
  const canPoll = () => !stopped && !inGame && !document.hidden;
  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const tick = async () => {
    timer = null;
    if (!canPoll() || busy) return;
    busy = true;
    const games = await fetchLive();
    busy = false;
    if (stopped) return;
    fn(games);
    if (canPoll()) timer = setTimeout(() => void tick(), LIVE_POLL_MS);
  };
  const resume = () => {
    if (canPoll() && timer === null) void tick();
  };
  const onVisible = () => (document.hidden ? clear() : resume());
  // DerpyFront's menu stays in the page through a game: stop while one runs.
  const onGame = () => {
    inGame = true;
    clear();
  };
  const onLeave = () => {
    inGame = false;
    resume();
  };
  document.addEventListener("visibilitychange", onVisible);
  document.addEventListener("game-starting", onGame);
  document.addEventListener("leave-lobby", onLeave);
  resume();
  return () => {
    stopped = true;
    clear();
    document.removeEventListener("visibilitychange", onVisible);
    document.removeEventListener("game-starting", onGame);
    document.removeEventListener("leave-lobby", onLeave);
  };
}

/** How long a game has been going: { hours, minutes }. */
export function timeIn(
  startedAt: number,
  serverTime: number,
  fetchedAt: number,
  now: number = Date.now(),
): { hours: number; minutes: number } {
  const ms = Math.max(0, serverTime - startedAt + (now - fetchedAt));
  const total = Math.floor(ms / 60_000);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
