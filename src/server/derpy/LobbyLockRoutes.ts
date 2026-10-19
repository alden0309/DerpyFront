// FRIENDS (r25): a DerpyFront lobby's password, on its game worker.
//
//   POST /api/game/:id/password  { password: string | null }   (its host)
//   POST /api/game/:id/unlock    { password?: string, pass?: string }
//
// The host gives the lobby a password (or takes it away). Anyone else who
// wants in first unlocks it: with the password, or with an invite's pass
// (signed by the master for their account). Unlocking only marks their
// player id as let in; the join itself (GameServer.joinClient) is what
// refuses everyone else. GET /api/game/:id/exists says whether a lobby has
// a password, and nothing here ever answers with the password.

import type express from "express";
import type { Request } from "express";
import type { GameManager } from "../GameManager";
import { GamePhase } from "../GameServer";
import { verifyClientToken } from "../jwt";
import { accountsForPlayIds } from "./DerpyAuth";
import { derpyDbConfigured } from "./DerpyDb";
import { cleanPassword, mayGuess, readPass } from "./LobbyLock";

/** The player id a request's play token belongs to, or null. */
async function playerOf(req: Request): Promise<string | null> {
  const h = req.headers.authorization ?? "";
  if (!h.startsWith("Bearer ")) return null;
  const auth = await verifyClientToken(h.slice("Bearer ".length).trim());
  return auth.type === "success" ? auth.persistentId : null;
}

/** Whether `pass` is a pass into lobby `id` for the account playing as `player`. */
export async function passAdmits(
  pass: unknown,
  id: string,
  player: string,
): Promise<boolean> {
  const account = readPass(pass, "derpyfront", id);
  if (account === null) return false;
  // Without accounts (a server with no database), the signed pass alone.
  if (!derpyDbConfigured()) return true;
  try {
    const mine = await accountsForPlayIds([player]);
    return mine.get(player.toLowerCase()) === account;
  } catch {
    return false;
  }
}

export function registerLobbyLockRoutes(
  app: express.Express,
  gm: GameManager,
): void {
  app.post("/api/game/:id/password", async (req, res) => {
    const player = await playerOf(req);
    if (player === null) return res.status(401).json({ error: "signed_out" });
    const game = gm.game(String(req.params.id));
    if (game === null) return res.status(404).json({ error: "not_found" });
    if (!game.isCreator(player))
      return res.status(403).json({ error: "not_host" });
    if (game.phase() !== GamePhase.Lobby)
      return res.status(409).json({ error: "started" });
    const raw = req.body?.password;
    if (raw === null) {
      game.lobbyLock.set(null);
    } else {
      const pw = cleanPassword(raw);
      if (pw === null) return res.status(400).json({ error: "invalid" });
      game.lobbyLock.set(pw);
    }
    return res.json(game.lobbyLock.toJSON());
  });

  app.post("/api/game/:id/unlock", async (req, res) => {
    const id = String(req.params.id);
    const player = await playerOf(req);
    if (player === null) return res.status(401).json({ error: "signed_out" });
    const game = gm.game(id);
    if (game === null) return res.status(404).json({ error: "not_found" });
    const lock = game.lobbyLock;
    if (!game.needsPassword() || lock.admits(player) || game.isCreator(player))
      return res.json({ ok: true });
    if (
      req.body?.pass !== undefined &&
      (await passAdmits(req.body.pass, id, player))
    ) {
      lock.admit(player);
      return res.json({ ok: true });
    }
    const pw = cleanPassword(req.body?.password);
    if (pw === null)
      return res.status(403).json({ error: "password_required" });
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!mayGuess(ip, `df:${id}`))
      return res.status(429).json({ error: "too_many_tries" });
    if (!lock.check(pw))
      return res.status(403).json({ error: "wrong_password" });
    lock.admit(player);
    return res.json({ ok: true });
  });
}
