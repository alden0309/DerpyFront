// Capital mod: start the hosted site (e.g. on Render) in as few processes as
// possible, so it fits a small server's memory.
//
// Runs the OpenFront game server (master plus NUM_WORKERS workers, as
// TypeScript through tsx) and, in this same process, the single-port proxy
// from selfhost-proxy.mjs on $PORT.
//
//   node scripts/start-site.mjs

import { spawn } from "node:child_process";

const defaults = {
  // Dev mode is what lets the server run without OpenFront's own backend:
  // players sign in with a local ID instead of an OpenFront account.
  GAME_ENV: "dev",
  // Cloudflare's always-pass test key; the bot check needs OpenFront's
  // backend otherwise.
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  DOMAIN: "localhost",
  GIT_COMMIT: "capital-mod",
  NUM_WORKERS: "1",
};
for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}

const server = spawn(
  process.execPath,
  // A modest heap cap keeps memory in check on small servers (the cluster
  // workers inherit it): garbage is collected well before 512 MB fills up.
  ["--max-old-space-size=200", "--import", "tsx", "src/server/Server.ts"],
  { stdio: "inherit", env: process.env },
);
server.on("exit", (code, signal) => {
  console.error(`Game server stopped (${signal ?? code}); exiting.`);
  process.exit(code ?? 1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.kill(signal);
    process.exit(0);
  });
}

await import("./selfhost-proxy.mjs");
