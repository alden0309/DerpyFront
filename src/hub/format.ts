// Number, date and name formatting for the hub's pages.

export const nf = (n: number | string) => Number(n).toLocaleString("en-US");

/** DerpyFront gold, shortened: 1.2M, 340K. */
export function gold(v: string | number): string {
  const n = Number(v);
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return `${n}`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 8) return d === 1 ? "yesterday" : `${d} days ago`;
  return shortDate(iso);
}

export function duration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m >= 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${Math.max(1, m)} min`;
}

export const NATION_NAMES: Record<string, string> = {
  england: "England",
  france: "France",
  spain: "Spain",
  portugal: "Portugal",
  netherlands: "the Netherlands",
  sweden: "Sweden",
};

export const nationName = (id: string) => NATION_NAMES[id] ?? id;

export const AWARD_NAMES: Record<string, string> = {
  mvp: "MVP",
  gold: "Most money made",
  ships: "Most ships",
  betrayals: "Most betrayals",
};

export const DIFFICULTY_NAMES: Record<string, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
};
