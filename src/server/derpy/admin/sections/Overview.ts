// ADMIN (r26): Overview. The deployed commit and build time, the server's
// uptime and memory (the master's and each game worker's), who's on the
// site now (Mr. Based shown as it is: this is the owner's own view), the
// games running, accounts, the database's size, the last errors, and any
// lines other sections add.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { englishSocial, placeText } from "../../../../derpland/SocialText";
import { recentErrors } from "../../../ErrorRing";
import { db } from "../../DerpyDb";
import { placeOf, presence, whereRank } from "../../Presence";
import { adminSection, type OverviewLine } from "../AdminRegistry";
import { basedSince, conquestAdmin, frontAdmin } from "../AdminSources";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../../..");
const STARTED_AT = Date.now();

/** Someone's Mr. Based counts as "playing" within this of its last call. */
export const BASED_PLAYING_MS = 3 * 60 * 1000;

/** The commit this server runs: Render's, else the checkout's, else GIT_COMMIT. */
export function deployedCommit(): string | null {
  const render = process.env.RENDER_GIT_COMMIT;
  if (render && /^[0-9a-f]{7,40}$/i.test(render)) return render;
  try {
    const head = fs
      .readFileSync(path.join(ROOT, ".git", "HEAD"), "utf8")
      .trim();
    if (/^[0-9a-f]{40}$/.test(head)) return head;
    const ref = /^ref: (.+)$/.exec(head)?.[1];
    if (ref) {
      const loose = path.join(ROOT, ".git", ref);
      if (fs.existsSync(loose)) return fs.readFileSync(loose, "utf8").trim();
      const packed = fs.readFileSync(
        path.join(ROOT, ".git", "packed-refs"),
        "utf8",
      );
      const line = packed.split("\n").find((l) => l.endsWith(` ${ref}`));
      if (line) return line.split(" ")[0];
    }
  } catch {
    // no checkout here (a worktree's .git is a file): fall through
  }
  return process.env.GIT_COMMIT ?? null;
}

/** When the site's files were built: the built hub page's time. */
export function builtAt(): string | null {
  for (const f of ["static/derpland.html", "static/index.html"]) {
    try {
      return fs.statSync(path.join(ROOT, f)).mtime.toISOString();
    } catch {
      // not built
    }
  }
  return null;
}

async function overview(
  ctxSections: readonly {
    overview?: () => Promise<OverviewLine[]>;
    id: string;
  }[],
) {
  const pool = await db();
  const now = Date.now();
  const front = frontAdmin();
  const conquest = conquestAdmin();
  const [accounts, size, frontList] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS total,
         count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS week,
         count(*) FILTER (WHERE created_at >= now() - interval '1 day')::int AS day
       FROM derpy_accounts`,
    ),
    pool.query("SELECT pg_database_size(current_database())::bigint AS bytes"),
    front
      ? front.list().catch(() => null)
      : Promise.resolve({ games: [], workers: [] }),
  ]);
  // Who's here: every page that beat lately and every Conquest seat,
  // appearing offline or not.
  const snap = presence.snapshot();
  const based = basedSince(now - 60 * 60 * 1000);
  const ids = [...new Set([...snap.keys(), ...based.keys()])];
  const names = new Map<number, string>();
  if (ids.length > 0) {
    const r = await pool.query(
      "SELECT id, username FROM derpy_accounts WHERE id = ANY($1::bigint[])",
      [ids],
    );
    for (const x of r.rows) names.set(Number(x.id), String(x.username));
  }
  const online = ids
    .map((id) => {
      const w = snap.get(id);
      const lastBased = based.get(id) ?? null;
      const inBased =
        lastBased !== null &&
        now - lastBased < BASED_PLAYING_MS &&
        (w === undefined || w.k === "around");
      if (!w && !inBased) return null;
      return {
        id,
        username: names.get(id) ?? presence.username(id) ?? `#${id}`,
        place: inBased
          ? "Playing Mr. Based"
          : placeText(placeOf(w!), englishSocial),
        rank: inBased ? 3 : whereRank(w!),
        hidden: presence.hidden(id),
        // On the site's own list only through its pages (none in Mr. Based).
        listed: w !== undefined,
        basedAt: lastBased === null ? null : new Date(lastBased).toISOString(),
      };
    })
    .filter((x) => x !== null)
    .sort((a, b) => b.rank - a.rank || a.username.localeCompare(b.username));
  const rooms = conquest?.rooms() ?? [];
  const lines: OverviewLine[] = [];
  for (const s of ctxSections) {
    if (!s.overview) continue;
    try {
      lines.push(...(await s.overview()));
    } catch {
      lines.push({ label: s.id, value: "couldn't say" });
    }
  }
  const mem = process.memoryUsage();
  const workerErrors = (frontList?.workers ?? []).flatMap((w) =>
    w.errors.map((e) => ({ ...e, where: `worker ${w.worker}` })),
  );
  return {
    build: { commit: deployedCommit(), builtAt: builtAt() },
    server: {
      startedAt: new Date(STARTED_AT).toISOString(),
      uptimeS: Math.round(process.uptime()),
      node: process.version,
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
      },
      workers: frontList?.workers ?? [],
      workersAnswered: frontList !== null,
    },
    online,
    games: {
      frontLobbies:
        frontList?.games.filter((g) => g.phase === "lobby").length ?? null,
      frontGames:
        frontList?.games.filter((g) => g.phase !== "lobby").length ?? null,
      frontPlayers:
        frontList?.games.reduce((n, g) => n + g.players.length, 0) ?? null,
      conquestRooms: rooms.filter((r) => !r.started).length,
      conquestGames: rooms.filter((r) => r.started && !r.over).length,
      conquestPlayers: rooms.reduce(
        (n, r) => n + r.seats.filter((x) => x.online).length,
        0,
      ),
    },
    accounts: {
      total: accounts.rows[0].total,
      newThisWeek: accounts.rows[0].week,
      newToday: accounts.rows[0].day,
    },
    dbBytes: Number(size.rows[0].bytes),
    errors: [
      ...recentErrors().map((e) => ({ ...e, where: "master" })),
      ...workerErrors,
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, 40)
      .map((e) => ({ ...e, at: new Date(e.at).toISOString() })),
    lines,
  };
}

export const overviewSection = adminSection({
  id: "overview",
  routes: [
    {
      method: "get",
      path: "/",
      handler: async (_req, res, ctx) => {
        res.json(await overview(ctx.sections));
      },
    },
  ],
});
