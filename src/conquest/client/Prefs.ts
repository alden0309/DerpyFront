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
