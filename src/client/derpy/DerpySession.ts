// The signed-in Derpy Front session as stored in this browser. Kept free of
// other imports so anything (the end-of-game screen, the game client) can
// ask "who's signed in?" cheaply.

export const DERPY_API = "/derpy/api";

/** Fired on window whenever the signed-in account (or its coins) changes. */
export const DERPY_ACCOUNT_EVENT = "derpy-account-changed";

export const TOKEN_KEY = "derpy_session_token";
export const USER_KEY = "derpy_username";

export function derpyStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function derpyToken(): string | null {
  return derpyStorage()?.getItem(TOKEN_KEY) ?? null;
}

/** The signed-in username as of the last sign-in, without a network call. */
export function derpyUsername(): string | null {
  return derpyToken() === null
    ? null
    : (derpyStorage()?.getItem(USER_KEY) ?? null);
}

export function isDerpySignedIn(): boolean {
  return derpyToken() !== null;
}
