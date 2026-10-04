# Demo script (3–4 minutes)

A walk through the real app for judges. Times are cumulative targets. **Bold** lines are what to say. Rehearse it twice end to end on the machine and network you'll present on.

## Before you present (10 minutes earlier)

- [ ] **Account.** Use a demo account that has **not** played today's Daily (one counted attempt a day) and has **not** passed Python Basics Topic 1. Anton's dev account already counted Daily #1 on 2026-10-04, so if you demo that day on it, the Daily card shows the result and share grid (that's fine, see step 2's fallback).
- [ ] **Seeded Games.** The account owns the "Graph Algorithms" Module (`npm run db:seed -- <clerkUserId>`): a ready Game in every Mode, made without Gemini. These are your fallback whenever generation is slow.
- [ ] **A deck to upload.** A small PDF or PPTX lecture deck (1–3 MB, 10–20 pages; under 4 MB if hosted on Vercel). Upload it once beforehand and generate a Dive Game, so a finished copy exists in case the live one is slow.
- [ ] **Tabs, in order:** (1) the landing page signed out (a private window), (2) `/daily` signed in, (3) `/explore/python-basics/hello-world-syntax`, (4) your profile `/u/<username>`, (5) the Graph Algorithms Module page.
- [ ] Sound on, at a low volume (the synthesized blips are part of the charm). Browser zoom 100%, window at least 1280 px wide.
- [ ] Warm the server: load each tab once, so nothing compiles or cold-starts on stage.

## The path

### 0:00 Landing (signed out) · 20 s
Open tab 1 and scroll slowly: the pixel sky turns into ocean.
**"SYLLABYSS turns your own course files into games. Every answer comes from your notes, and the rarer the answer you find, the deeper you sink."**
Point at the Game Mode tiles (hover one to play its mini-scene) and at today's Daily teaser.

### 0:20 Daily Dive · 40 s
Switch to tab 2 (`/daily`, signed in).
**"Everyone gets the same puzzle every day at midnight Vancouver time, like Wordle, but with Krillion-style open answers."**
Press Play and answer the first Prompt or two, e.g. for Daily #1 ("Launch Day: Computing Classics"): *Name a sorting algorithm* → try a rare one (e.g. "timsort" or "shell sort") before an obvious one, and say **"rarer answers score more"** as it sinks.
Then show (or skip ahead to) the Reveal: tier squares share grid, **"better than X% of today's players"**, and "% found" next to each answer.
**"The distribution, the per-answer find rates and the midnight rollover are all TimescaleDB: hypertables, real-time continuous aggregates with toolkit percentiles, and a scheduled job."**

*Fallback:* if the account already played today, the hub shows your counted result and share grid. Say that, click **See today's leaderboard**, and move on.

### 1:00 Explore → pass a Leap game · 50 s
Switch to tab 3 (Python Basics, Topic 1 "Hello World & Syntax").
**"There's also a built-in beginner course. Each Topic is a short reading plus a practice game in every Mode."**
Scroll the reading for a second (the code blocks), then **Jump to practice** → **Leap** → JUMP IN.
Answer 7 of 10 correctly without losing all 3 hearts to pass. Use the 50/50 once to show it off. Cheat sheet (the order is shuffled):

| Question | Answer |
|---|---|
| `print("a", "b")` displays | `a b` |
| Starts a comment | A hash sign (#) |
| How Python groups blocks | Indentation |
| PEP 8 indentation | 4 |
| `Print("hi")` | It raises a NameError |
| A line that starts a block ends with | A colon |
| Indented line with no open block | Raises an IndentationError |
| `end` parameter of `print()` | What is printed after the last value |
| `print "hi"` in Python 3 | A SyntaxError |
| `pass` | Nothing: it is a placeholder |
| `print("Total:", 3 + 4)` | Total: 7 |
| A comment over several lines | Start each line with a hash sign |
| What `print()` puts between values | A single space |
| When a SyntaxError is reported | Before the program starts running |
| Not a Python keyword | true |

On the Reveal: **TOPIC PASSED**, the pixel burst, +150 XP, the Topic Badge. Click **Unlock the next Topic ▶** to show Topic 2 unlocking on the Course page (that link is an `overnight/demo` integration fix; without it, open the Course page yourself).

*Fallback:* if you fall, say "three wrong and you fall", press **▲ PLAY AGAIN** and keep going. Passing any Mode works too.

### 1:50 Profile + leaderboard · 25 s
Open tab 4 (`/u/<username>`).
**"Everything you play feeds your profile."** Show the profile card (level, ocean rank, streak flame, badges; the Topic badge you just earned) and the activity heatmap (hover a cell for its tooltip).
Click **Leaderboard** in the nav: Weekly XP, Global / Friends, and your row pinned.
**"The heatmap and the weekly board are continuous aggregates over an XP hypertable."**

### 2:15 Upload a deck → generate a Game · 35 s
Open tab 5 (the Module page). Drag the prepared deck onto the drop zone: per-file progress → `Parsing…` → `Ready`.
Click a Ready file to open the file viewer for a moment (**"we parse the slides page by page; every answer will cite one of these pages"**).
**New Game** → Mode tiles (Dive, Apogee, Leap, Pairs, Blitz, Arena) → keep **Dive** → tick the file → Create. The card shows `Generating…`.
**"Gemini writes the Prompts and answers from your pages. Then a second Gemini pass checks every answer against its page and throws out what the page doesn't support."**

*Fallback (Gemini slow, over ~30 s):* say "this takes about a minute, so here's one I made earlier", and open the copy you generated beforehand, or the seeded **Graph Algorithms (Week 9)** Dive Game.

### 2:50 Play Dive with the descent · 50 s
Open the Dive Game → **▼ BEGIN DESCENT ▼**.
Answer 2–3 Prompts on camera. For the seeded Graph Algorithms Game:
- *Name a graph algorithm*: type "BFS" (common) and then "Kosaraju" or "Hopcroft-Karp" (rare, deep).
- *Name a minimum spanning tree algorithm*: "Borůvka" or "Reverse-delete" sink to the Trench.
- *Name a shortest-path algorithm*: "Floyd-Warshall".
- Odd one out, *Which one solves a different problem from the other three?*: Dijkstra. *Which one ignores edge weights?*: BFS.

Let the chip sink past the tier lines, then the catch screen and **DESCEND ▼**.
**"Rare answers from deep in your notes sink you deeper. The server owns the clock and the score, and no AI runs during play, so it stays fast."**
If time allows, jump to the Reveal: the dive log, then **The Catch**, where each answer shows the slide it came from (click one to open the file viewer on that page).

### 3:40 Close · 10–20 s
**"Six Modes from the same notes, a daily puzzle, a course, and a social layer. Built on Tiger Data, Gemini and Clerk."**

## If something breaks

| Problem | Do this |
|---|---|
| Gemini slow or erroring | Use the pre-generated copy or a seeded Game. Never wait on stage |
| Upload stuck in `Parsing…` | Skip to the pre-uploaded file: it's already Ready |
| Daily already played | Show the result card and leaderboard instead of playing |
| Topic 1 already passed | Demo Topic 2 ("Variables & Types"); a Leap pass works the same |
| Network drops | Everything except generation needs only the database, so retry once, then show the Reveal of an earlier Run from the Game page's recent Runs |
| Sound too loud or none | The mute tile is top right on every screen |
