// Client helpers for F21's social API (docs/architecture/social.md § API). Client-safe.
import type { FriendsList, Leaderboard, LeaderboardScope, MyProfile, PlayerSearchResult, ProfilePatch } from "@/lib/social/types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const socialApi = {
  friends: () => api<FriendsList>("/api/friends"),
  request: (username: string) =>
    api<{ status: "pending" | "accepted"; requestId: string }>("/api/friends/requests", { method: "POST", body: JSON.stringify({ username }) }),
  accept: (requestId: string) => api<void>(`/api/friends/requests/${requestId}/accept`, { method: "POST" }),
  decline: (requestId: string) => api<void>(`/api/friends/requests/${requestId}/decline`, { method: "POST" }),
  /** Unfriend, cancel your request, or drop theirs. */
  remove: (username: string) => api<void>(`/api/friends/${encodeURIComponent(username)}`, { method: "DELETE" }),
  search: (q: string, limit = 20, signal?: AbortSignal) =>
    api<{ players: PlayerSearchResult[] }>(`/api/players/search?q=${encodeURIComponent(q)}&limit=${limit}`, { signal }),
  updateProfile: (patch: ProfilePatch) => api<{ profile: MyProfile }>("/api/me/profile", { method: "PATCH", body: JSON.stringify(patch) }),
  weeklyXp: (scope: LeaderboardScope, limit = 50) => api<Leaderboard>(`/api/leaderboards/weekly-xp?scope=${scope}&limit=${limit}`),
  course: (scope: LeaderboardScope, limit = 50, course?: string) =>
    api<Leaderboard>(`/api/leaderboards/course?scope=${scope}&limit=${limit}${course ? `&course=${encodeURIComponent(course)}` : ""}`),
  game: (gameId: string, opts: { scope: LeaderboardScope; day?: string; counting?: "best" | "first"; limit?: number }) => {
    const q = new URLSearchParams({ scope: opts.scope, limit: String(opts.limit ?? 50) });
    if (opts.day) q.set("day", opts.day);
    if (opts.counting) q.set("counting", opts.counting);
    return api<Leaderboard>(`/api/leaderboards/games/${gameId}?${q}`);
  },
};

/** Profile link for a Player summary. */
export const userHref = (p: { username: string | null }) => (p.username ? `/u/${p.username}` : "/friends");
