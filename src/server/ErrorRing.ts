// ADMIN (r26): the server's last few errors, kept in memory for the owner's
// admin page (Overview). The logger hands every error it writes here (a
// winston format, so child loggers count too); nothing is written to disk
// and a restart empties it. Each process keeps its own: the master's, and
// each game worker's (sent to the master when the admin page asks).

export interface RingError {
  at: number;
  message: string;
  component?: string;
}

export const ERROR_RING_SIZE = 50;
const MAX_MESSAGE = 600;

const ring: RingError[] = [];

export function noteError(message: string, component?: string): void {
  ring.push({
    at: Date.now(),
    message: message.slice(0, MAX_MESSAGE),
    ...(component ? { component: component.slice(0, 60) } : {}),
  });
  if (ring.length > ERROR_RING_SIZE) ring.splice(0, ring.length - ERROR_RING_SIZE);
}

/** The errors kept, newest first. */
export function recentErrors(): RingError[] {
  return [...ring].reverse();
}

/** For tests. */
export function clearErrors(): void {
  ring.length = 0;
}

/** A winston log record, as the format sees it. */
export function noteLogRecord(info: Record<string, unknown>): void {
  if (info.level !== "error") return;
  const msg =
    typeof info.message === "string"
      ? info.message
      : JSON.stringify(info.message ?? "");
  const extra =
    info.error !== undefined
      ? ` ${typeof info.error === "string" ? info.error : JSON.stringify(info.error)}`
      : "";
  const comp = info.component ?? info.comp;
  noteError(msg + extra, typeof comp === "string" ? comp : undefined);
}
