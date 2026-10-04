# #91 Sonar chat: resizable panel, chat history, message avatars

Status: done
Branch: feat/91-sonar-chat-ui (built on feat/83-sonar-module-scope, PR #85; merge after it)
Updated: 2026-10-04

## Goal
Make the Sonar drawer nicer: resize it by dragging, keep a history of chats, show replies as a chat with Sonar's avatar.

## Done so far
- `lib/sonar/chats.ts` (+ tests): saved chats in localStorage (`sonar:chats`, current id `sonar:chat`), max 30 chats x 60 messages, titles from the first question, search, date labels. Moves the old sessionStorage transcript into the first chat.
- `POST /api/sonar/chat` takes optional `chatId`; `runSonar` uses thread `sonar:<playerId>:<chatId>` (else the old `sonar:<playerId>`). Announced on #91. Test in agent.test.ts.
- `SonarBuddy.tsx`: drag the left edge (phones: top grabber) to resize, arrow keys on the grip, double-click resets; size saved in `sonar:size`. Chat bar with the current chat's title opens the history (search, open, delete, New). "+" starts a new chat (Sonar briefs it). Avatars on Sonar's messages, right-aligned Player bubbles, copy button, auto-growing textarea (Enter sends, Shift+Enter new line), "Jump to latest" when scrolled up.
- Kept #85's "Now on this Module" dividers.

## Next steps
None. PR is based on feat/83-sonar-module-scope; it retargets to main when #85 merges (FEATURES.md may need the usual row merge then).

## Decisions & gotchas
- History is browser-only (user's choice). Server memory is an in-process MemorySaver, so an old chat reopened after a server restart shows its messages but Sonar no longer remembers them.
- The global `:focus-visible` outline is unlayered, so Tailwind's `outline-none` can't beat it; `.bare` in sonar.module.css does.

## Files touched
- components/sonar/SonarBuddy.tsx, components/sonar/sonar.module.css
- lib/sonar/chats.ts, lib/sonar/chats.test.ts
- lib/sonar/chat-request.ts, lib/sonar/agent.ts, lib/sonar/agent.test.ts, app/api/sonar/chat/route.ts
