// Username rules and derivation. Pure.
import { USERNAME_PATTERN } from "./types";

/** Never handed out: they'd collide with routes or look official. */
export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "api", "daily", "explore", "friends", "help", "home", "leaderboard",
  "me", "mod", "moderator", "null", "profile", "requests", "root", "search", "settings", "support", "syllabyss",
  "system", "undefined",
]);

export type UsernameProblem = "format" | "reserved";

/** Null when valid. Usernames are compared lowercase; call normalizeUsername first. */
export function usernameProblem(username: string): UsernameProblem | null {
  if (!USERNAME_PATTERN.test(username)) return "format";
  if (RESERVED_USERNAMES.has(username)) return "reserved";
  return null;
}

export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

/** Lowercase ASCII letters, digits and single underscores, at most 20 characters. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents: "José" → "jose"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20)
    .replace(/_+$/g, "");
}

/** What Clerk tells us about a user; a structural subset of Clerk's `User`. */
export type ClerkProfileSource = {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  imageUrl?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses?: { emailAddress: string }[];
};

/**
 * The base username to try first: Clerk username, else full name, else the email's local
 * part, else "diver". Always matches USERNAME_PATTERN and isn't reserved.
 */
export function baseUsername(source: ClerkProfileSource | null | undefined): string {
  const email = source?.primaryEmailAddress?.emailAddress ?? source?.emailAddresses?.[0]?.emailAddress ?? null;
  const name = source?.fullName ?? [source?.firstName, source?.lastName].filter(Boolean).join(" ");
  const candidates = [source?.username, name, email?.split("@")[0]];
  for (const c of candidates) {
    if (!c) continue;
    let slug = slugify(c);
    if (slug.length > 0 && slug.length < 3) slug = `${slug}_diver`;
    if (slug.length >= 3 && !usernameProblem(slug)) return slug;
  }
  return "diver";
}

/** The n-th candidate for a base: base, base2, base3 … each cut to fit 20 characters. */
export function usernameCandidate(base: string, n: number): string {
  if (n <= 1) return base;
  const suffix = String(n);
  return `${base.slice(0, 20 - suffix.length).replace(/_+$/, "")}${suffix}`;
}

/** First candidate not in `taken` (the usernames that already start with the base). */
export function firstFreeUsername(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; ; n++) {
    const c = usernameCandidate(base, n);
    if (!used.has(c) && !usernameProblem(c)) return c;
  }
}

/** Display name from Clerk, else the username. At most 40 characters. */
export function displayNameFrom(source: ClerkProfileSource | null | undefined, username: string): string {
  const name = (source?.fullName ?? [source?.firstName, source?.lastName].filter(Boolean).join(" ")).trim();
  return (name || source?.username || username).slice(0, 40);
}
