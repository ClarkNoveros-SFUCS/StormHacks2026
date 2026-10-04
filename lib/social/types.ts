// Shapes the social API returns. Plain types and constants, safe to import from client
// components (F19 home page, F26 Profile/Friends/Leaderboard pages).
// Spec: docs/architecture/social.md, ADR-0005.

/** Ocean Ranks by Level (decisions §6, Q11). */
export const RANKS = [
  { name: "Plankton", minLevel: 1 },
  { name: "Shrimp", minLevel: 3 },
  { name: "Reef Fish", minLevel: 5 },
  { name: "Dolphin", minLevel: 8 },
  { name: "Orca", minLevel: 12 },
  { name: "Leviathan", minLevel: 17 },
] as const;
export type RankName = (typeof RANKS)[number]["name"];

/**
 * Pixel avatar ids (Q17): the 16 sprites drawn in components/ui/avatars.ts (keep the two lists equal). The DB only checks the id's shape,
 * so adding an avatar here needs no migration. The first is the default.
 */
export const AVATARS = [
  "anglerfish", "axolotl", "astronaut", "frog", "cat", "robot", "octopus", "penguin",
  "fox", "ghost", "slime", "owl", "bear", "alien", "crab", "jellyfish",
] as const;
export type AvatarId = (typeof AVATARS)[number];

/** Usernames: lowercase letters, digits and underscores, 3–20 characters. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export type LevelInfo = {
  level: number; //         1+
  totalXp: number;
  levelStartXp: number; //  total XP where this level began
  nextLevelXp: number; //   total XP where the next level begins
  xpIntoLevel: number; //   totalXp − levelStartXp
  xpForNext: number; //     nextLevelXp − levelStartXp (the bar's full width)
  rank: RankName;
};

/** Enough to draw a Player anywhere: chip, leaderboard row, friend list. */
export type PlayerSummary = {
  username: string | null; // null only for a Player who has never loaded a page since F21
  displayName: string;
  avatar: string; //          pixel avatar id
  imageUrl: string | null; // the Clerk photo, only when the Player chose use_photo
  level: number;
  rank: RankName;
};

/** A friend request you sent that was accepted, for the pop-up (#79). */
export type AcceptedNotice = { player: PlayerSummary; acceptedAt: string };

export type Streak = {
  current: number; //       consecutive Vancouver days with a finished Run, ending today or yesterday
  longest: number;
  playedToday: boolean; //  false while today's flame is still unlit (current then counts up to yesterday)
};

export type BadgeTier = "bronze" | "silver" | "gold";

export type Badge = {
  id: string;
  name: string;
  description: string;
  icon: string; //  pixel icon id for F26
  tier: BadgeTier;
};

export type EarnedBadge = Badge & { earnedAt: string };

export type HeatmapDay = {
  day: string; //    YYYY-MM-DD, Vancouver
  xp: number;
  runs: number; //   finished Runs
  level: 0 | 1 | 2 | 3 | 4; // intensity: 0 none, 1 < 40 XP, 2 < 100, 3 < 200, 4 ≥ 200
};

/** 53 weeks, oldest first. `from` is a Sunday, so day i sits in column floor(i/7), row i%7. */
export type Heatmap = {
  from: string;
  to: string; //     today (Vancouver)
  days: HeatmapDay[];
  totalXp: number;
  totalRuns: number;
  activeDays: number;
};

export type FriendStatus = "self" | "none" | "friends" | "incoming" | "outgoing";

/** Profile card (home sidebar, Q12): GET /api/me/summary. */
export type ProfileCard = {
  player: PlayerSummary;
  level: LevelInfo;
  totalXp: number;
  badgeCount: number;
  streak: Streak;
};

export type GameBest = { gameId: string; title: string; mode: string; best: number; finishedAt: string };

/** Public Profile: GET /api/profiles/[username] and GET /api/me/profile. Never any Module content. */
export type PublicProfile = {
  player: PlayerSummary;
  bio: string | null;
  banner: string | null;
  joinedAt: string;
  level: LevelInfo;
  totalXp: number;
  streak: Streak;
  badges: EarnedBadge[]; //    newest first
  heatmap: Heatmap;
  counts: { runsFinished: number; friends: number; modules: number; topicsPassed: number; badges: number };
  bests: GameBest[]; //       best finished Run per public Game (Daily Dive, Course Topics), highest first
  friendStatus: FriendStatus;
  friendRequestId: string | null; // the pending request, when friendStatus is incoming/outgoing
};

/** GET /api/me/profile adds the private, editable fields. */
export type MyProfile = PublicProfile & { usePhoto: boolean; clerkImageUrl: string | null };

/** PATCH /api/me/profile body: every field optional. */
export type ProfilePatch = {
  username?: string;
  displayName?: string;
  avatar?: AvatarId;
  usePhoto?: boolean;
  bio?: string | null;
  banner?: string | null;
};

export type FriendEntry = { player: PlayerSummary; since: string };
export type FriendRequest = { id: string; player: PlayerSummary; createdAt: string };

/** GET /api/friends */
export type FriendsList = { friends: FriendEntry[]; incoming: FriendRequest[]; outgoing: FriendRequest[] };

/** GET /api/players/search?q= */
export type PlayerSearchResult = { player: PlayerSummary; friendStatus: FriendStatus; friendRequestId: string | null };

export type LeaderboardScope = "global" | "friends";

/** `place` is the leaderboard position (1 = top); ties share a place. Not the ocean `rank`. */
export type LeaderboardEntry = {
  place: number;
  player: PlayerSummary;
  value: number; //            XP, score or Topics passed, depending on the board
  at: string | null; //        game boards: when the counted Run finished (the tie-break)
  isMe: boolean;
};

export type Leaderboard = {
  board: "weekly-xp" | "game" | "course";
  scope: LeaderboardScope;
  /** weekly-xp: the week's Monday; game: the Vancouver day when filtered by day. */
  period: string | null;
  entries: LeaderboardEntry[]; // the top N
  me: LeaderboardEntry | null; // the caller's own row even outside the top N; null if not on the board
  total: number; //               Players on the board
};

/** What onRunFinished / onTopicPassed / … return, so a Reveal can celebrate. */
export type XpAward = {
  xpAwarded: number; //        0 when this event had already been awarded (idempotent)
  totalXp: number;
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
  newBadges: Badge[];
  streak: Streak;
};
