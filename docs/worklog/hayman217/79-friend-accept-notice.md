# #79 Pop-up notification when a friend accepts your request

Status: done
Branch: feat/79-friend-accept-notice
Updated: 2026-10-04 09:55

## Goal
When someone accepts your friend request, you get a toast on whatever page you're on, once,
linking to their profile. Issue #79.

## Done so far
- `db/migrations/20261004T1400_friend_notices.sql`: `friendships.requester_notified_at` (applied to the
  shared DB; existing accepted rows backfilled as told).
- `takeAcceptedNotices(me)` in `lib/social/friends.ts`: one UPDATE … RETURNING marks and returns the
  caller's untold acceptances, so each shows once. Type `AcceptedNotice` in `lib/social/types.ts`.
- `POST /api/friends/notices` → `{ accepted: AcceptedNotice[] }`.
- `components/social/FriendNotices.tsx`, mounted in `app/layout.tsx` for signed-in Players: checks on
  load, every 30 s while visible, and when the tab becomes visible; toasts link to `/u/<username>`.
- `ToastInput.href` (additive): the toast becomes a link and closes on click.
- DB test in `lib/social/social.db.test.ts` (pending, accepter not told, once only, crossed requests).
- Verified in the browser with a temporary accepted friendship (deleted afterwards).

## Next steps
None: shipped in the PR that closes #79 (F36 in docs/FEATURES.md).

## Decisions & gotchas
- Polling, not websockets: no realtime infra in the app; 30 s is plenty for a friend notice.
- "Taking" marks as told even if the tab closes before the toast renders (acceptable).
- Crossed requests (B asks A after A asked B) notify A, the original requester.

## Files touched
- db/migrations/20261004T1400_friend_notices.sql
- lib/social/friends.ts, lib/social/types.ts, lib/social/social.db.test.ts
- app/api/friends/notices/route.ts
- components/social/FriendNotices.tsx, components/ui/Toast.tsx, app/layout.tsx
