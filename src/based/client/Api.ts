// Mr. Based's calls to the server. Everything but /access needs the
// signed-in account to be one that may play; the pictures and sound come the
// same way, as blobs, so they can't be fetched by anyone else either.

import { DERPY_API } from "../../client/derpy/DerpySession";
import { api, derpyToken } from "../../derpland/Account";
import { FlowScene } from "../engine/Flow";
import { PlaceDef } from "../engine/Place";
import { Profile, SlotMeta, SlotSave } from "../engine/Save";
import { Chapter } from "../engine/Types";

export interface Access {
  signedIn: boolean;
  play: boolean;
}

export interface ChapterInfo {
  n: number;
  title: string;
  summary: string;
  ok: boolean;
}

/** r22: a save slot as the load screen lists it. */
export interface SlotInfo {
  slot: string;
  meta: SlotMeta;
  updatedAt: string;
}

export interface Credit {
  keys: string[];
  what: string;
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
  changes?: string;
}

export interface LoadedChapter {
  chapter: Chapter;
  flow: FlowScene[];
  warnings: string[];
  credits: { note: string; items: Credit[] };
  /** r21: the 3D places the chapter uses, by key. */
  places: Record<string, PlaceDef>;
}

export interface Stats {
  players: number;
  picks: Record<string, Record<string, number>>;
}

export interface WriterNote {
  id: number;
  chapter: number;
  scene: string;
  line: string;
  note: string;
  createdAt: string;
}

export async function access(): Promise<Access> {
  try {
    return await api<Access>("/based/access");
  } catch {
    return { signedIn: derpyToken() !== null, play: false };
  }
}

export const chapters = () =>
  api<{ chapters: ChapterInfo[]; next: number }>("/based/chapters");

/** A chapter, or the mistakes in its script while it's being edited. */
export async function loadChapter(
  n: number,
): Promise<
  { ok: true; chapter: LoadedChapter } | { ok: false; problems: string[] }
> {
  const token = derpyToken();
  try {
    const res = await fetch(`${DERPY_API}/based/chapter/${n}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = (await res.json()) as LoadedChapter & { problems?: string[] };
    if (res.ok) return { ok: true, chapter: body };
    return {
      ok: false,
      problems: body.problems ?? [
        `Chapter ${n} couldn't be loaded (${res.status}).`,
      ],
    };
  } catch {
    return { ok: false, problems: [`Chapter ${n} couldn't be loaded.`] };
  }
}

/** r22: the profile and the slots (a round-21 save is converted first). */
export async function loadProfile(): Promise<{
  save: Profile | null;
  slots: SlotInfo[];
}> {
  return api<{ save: Profile | null; slots: SlotInfo[] }>("/based/save");
}

export async function storeProfile(save: Profile): Promise<void> {
  await api("/based/save", { method: "PUT", body: JSON.stringify({ save }) });
}

export async function listSlots(): Promise<SlotInfo[]> {
  return (await api<{ slots: SlotInfo[] }>("/based/slots")).slots;
}

export async function loadSlot(slot: string): Promise<SlotSave | null> {
  return (await api<{ save: SlotSave | null }>(`/based/slot/${slot}`)).save;
}

export async function storeSlot(slot: string, save: SlotSave): Promise<void> {
  await api(`/based/slot/${slot}`, {
    method: "PUT",
    body: JSON.stringify({ save }),
  });
}

export async function eraseSlot(slot: string): Promise<void> {
  await api(`/based/slot/${slot}`, { method: "DELETE" });
}

export async function eraseSave(): Promise<void> {
  await api("/based/save", { method: "DELETE" });
}

export async function recordPicks(
  chapter: number,
  picks: { choice: string; option: string }[],
): Promise<void> {
  await api("/based/picks", {
    method: "POST",
    body: JSON.stringify({ chapter, picks }),
  });
}

export const stats = (n: number) => api<Stats>(`/based/stats/${n}`);

export async function leaveNote(n: {
  chapter: number;
  scene: string;
  line: string;
  path: string[];
  note: string;
}): Promise<void> {
  await api("/based/notes", { method: "POST", body: JSON.stringify(n) });
}

export async function notesFor(
  chapter: number,
  scene: string,
): Promise<WriterNote[]> {
  const q = new URLSearchParams({ chapter: String(chapter), scene });
  return (await api<{ notes: WriterNote[] }>(`/based/notes?${q}`)).notes;
}

/** r26: one of his notes, as the notes sheet lists it. */
export interface MyNote {
  id: number;
  chapter: number;
  scene: string;
  sceneLabel: string;
  note: string;
  createdAt: string;
  sentAt: string | null;
  /** The note as plain text to paste to the writer. */
  entry: string;
}

/** r26: all his notes, oldest first. */
export async function myNotes(): Promise<MyNote[]> {
  return (await api<{ notes: MyNote[] }>("/based/notes/all")).notes;
}

/** r26: these were copied out to the writer. */
export async function markNotesSent(ids: number[]): Promise<number> {
  return (
    await api<{ marked: number }>("/based/notes/sent", {
      method: "POST",
      body: JSON.stringify({ ids }),
    })
  ).marked;
}

/** r26: the ones he's sent, gone. */
export async function clearSentNotes(): Promise<number> {
  return (
    await api<{ cleared: number }>("/based/notes/sent", { method: "DELETE" })
  ).cleared;
}

const blobs = new Map<string, Promise<string>>();

/** A picture, sound or model as a local object URL, fetched with the session. */
export function media(
  kind: "art" | "audio" | "model",
  key: string,
): Promise<string> {
  const id = `${kind}/${key}`;
  let p = blobs.get(id);
  if (p === undefined) {
    p = (async () => {
      const token = derpyToken();
      const res = await fetch(`${DERPY_API}/based/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`${id}: ${res.status}`);
      return URL.createObjectURL(await res.blob());
    })();
    p.catch(() => blobs.delete(id));
    blobs.set(id, p);
  }
  return p;
}

/** The URL if it's already loaded, for drawing without waiting. */
const ready = new Map<string, string>();
export function mediaNow(kind: "art" | "audio", key: string): string | null {
  return ready.get(`${kind}/${key}`) ?? null;
}

export async function preload(
  keys: string[],
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  let done = 0;
  onProgress(0, keys.length);
  await Promise.all(
    keys.map(async (key) => {
      try {
        ready.set(`art/${key}`, await media("art", key));
      } catch {
        // drawn as darkness if it won't load
      }
      onProgress(++done, keys.length);
    }),
  );
}
