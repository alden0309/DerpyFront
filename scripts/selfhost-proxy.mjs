// Capital mod: one front door for a self-hosted game server.
//
// In production, nginx routes each request to the right OpenFront process:
// /w<N>/... to game worker N (port 3001 + N), /api/create_game to any worker,
// everything else to the master (port 3000). This does the same with only
// Node's built-in modules, so the whole game (page, lobby feed, game
// sockets) is reachable on a single port that a tunnel can share.
//
//   node scripts/selfhost-proxy.mjs [listenPort=9000] [numWorkers=2]

import http from "node:http";
import net from "node:net";

const LISTEN_PORT = Number(process.argv[2] ?? 9000);
const NUM_WORKERS = Number(process.argv[3] ?? 2);
const MASTER_PORT = 3000;
const FIRST_WORKER_PORT = 3001;
const WORKER_CREATE_PATHS = new Set([
  "/api/create_game",
  "/api/adminbot/create_game",
]);

let nextWorker = 0;

/** Where a request goes: the backend port and the path to send it. */
function route(url) {
  const q = url.indexOf("?");
  const pathname = q === -1 ? url : url.slice(0, q);
  const query = q === -1 ? "" : url.slice(q);
  const worker = /^\/w(\d+)(\/.*)?$/.exec(pathname);
  if (worker) {
    const n = Number(worker[1]);
    if (n < NUM_WORKERS) {
      return { port: FIRST_WORKER_PORT + n, path: (worker[2] ?? "/") + query };
    }
  }
  if (WORKER_CREATE_PATHS.has(pathname)) {
    const n = nextWorker++ % NUM_WORKERS;
    return { port: FIRST_WORKER_PORT + n, path: url };
  }
  return { port: MASTER_PORT, path: url };
}

const server = http.createServer((req, res) => {
  const { port, path } = route(req.url ?? "/");
  const upstream = http.request(
    { host: "127.0.0.1", port, path, method: req.method, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain" });
    }
    res.end("The game server isn't ready yet. Try again in a moment.\n");
  });
  req.pipe(upstream);
});

// WebSockets (lobby feed and games): replay the upgrade request to the
// backend, then join the two sockets.
server.on("upgrade", (req, socket, head) => {
  const { port, path } = route(req.url ?? "/");
  const upstream = net.connect(port, "127.0.0.1", () => {
    let raw = `${req.method} ${path} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    }
    upstream.write(raw + "\r\n");
    if (head && head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  const close = () => {
    socket.destroy();
    upstream.destroy();
  };
  upstream.on("error", close);
  socket.on("error", close);
});

server.listen(LISTEN_PORT, () => {
  console.log(`Capital mod server ready on http://localhost:${LISTEN_PORT}/`);
});
