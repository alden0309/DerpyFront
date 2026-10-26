// Small per-player choices kept in this browser (not part of the game):
// whether a right-click march asks first. If the browser won't store it,
// the default holds.

const MARCH_KEY = "derpy_conquest_confirm_march";

export function confirmMarch(): boolean {
  try {
    return localStorage.getItem(MARCH_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setConfirmMarch(on: boolean): void {
  try {
    localStorage.setItem(MARCH_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------- CQTUT (r26)

const FIRST_LIFE_KEY = "derpy_conquest_first_life";

/** The first life offered on a first visit: taken, turned down, or not yet ("" ). */
export function firstLifeSeen(): "taken" | "no" | "" {
  try {
    const v = localStorage.getItem(FIRST_LIFE_KEY);
    return v === "taken" || v === "no" ? v : "";
  } catch {
    return "";
  }
}

export function setFirstLifeSeen(v: "taken" | "no"): void {
  try {
    localStorage.setItem(FIRST_LIFE_KEY, v);
  } catch {
    // A private window: it's asked again next time.
  }
}
