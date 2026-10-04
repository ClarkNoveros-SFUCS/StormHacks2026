# Sonar: what it does and how to test it

Sonar is the pixel dolphin at the bottom right of every page. It's a study coach that knows where you stand in your material, tells you what to practise next and why, and talks about your actual mistakes. How it's built: [`architecture/sonar.md`](architecture/sonar.md) and the diagram below.

![The Sonar pipeline](img/sonar-pipeline.png)

## What Sonar can do

| It can… | How |
|---|---|
| **Tell you where you stand** in Python Basics, per Concept (22 of them, like `range()`, comparison operators, `return` vs `print`) | The learner model replays every guess you've made and estimates how likely you are to know each Concept |
| **Find the root cause** of your misses ("you're not bad at for loops, your misses come from `range()`") | Each miss is split across the Concepts the question tested; a weak prerequisite that keeps taking the blame is the root cause |
| **Disagree with the Course** ("Course says passed, I'm hearing 57%") | Passing a Topic once unlocks the next one; Sonar keeps measuring after that |
| **Quote your own wrong answers** and explain them from the reading or your file's pages | Its `get_mistakes`, `read_topic` and `read_source_page` tools |
| **Recommend what to play next**, as a card with a Start button | It picks the planner's **Top pick**, or a Game of its own (**Sonar's pick**), which the server checks is real, yours or public, and not locked |
| **Choose the Mode on purpose** | Weak Concept → Leap (recognising the answer); learning → Dive (recalling it yourself); a specific mix-up → Blitz (true/false contrasts) |
| **Make you a new Game** from one of your uploaded files, on Module pages | Its `propose_game` tool shows a card; nothing is made until you press **Make this Game** |
| **Speak up first** on results, Topic and Module pages | A speech bubble from the mascot, written from your numbers with no AI call |
| **Remember the conversation** while the server runs | LangGraph memory, one thread per Player |

What it won't do:
- appear during a Run (the buddy hides on the play screen);
- make up a mastery number (every number comes from the learner model, not the AI);
- send you to a locked Topic;
- create a Game without your click.

## The feedback loop

```
 play a Run ──▶ every guess is logged (guess_events)
     ▲                         │
     │                         ▼
 Start the card        learner model (no AI, ~80 ms): mastery per Concept, blame, root cause, top 3 actions
     ▲                         │
     │                         ▼
 Sonar recommends ◀── Sonar (Claude) reads the model + your mistakes + the reading, and explains
```

1. **You play.** Each answer is stored with whether it was right, how long you took, whether you used a Hint or the 50/50, and the Game Mode.
2. **The model updates on the next look.** There's no batch job: the next time Sonar or `/sonar` loads, it replays all your guesses, so a Run you just finished counts straight away.
3. **How much an answer counts depends on how you could have guessed it.**
   - A typed Dive answer is strong evidence (about a 5% chance of a lucky guess).
   - A Leap multiple-choice answer is medium (25%), or weaker after the 50/50.
   - A Blitz true/false answer is weak (50%).
   
   So a lucky tap moves you less than a typed answer.
4. **Misses are shared out.** A question that tests two Concepts lowers the one you're weaker at more. When one prerequisite keeps taking most of the blame (40% or more of your last 10 misses), it becomes the **root cause** and goes to the top of the plan.
5. **Unpractised Concepts fade** on the map over a few days (forgetting), and a faded Concept you once knew gets a quick review card.
6. **Sonar closes the loop:** it explains, recommends a card, you press Start, and the new Run feeds step 1.

## Use cases to try

Sign in, then follow these in order. You can run them on your own history or on the demo history. The demo seed only runs for the allowlisted demo account and `demo_sonar_*` test ids. **It replaces that account's Python Basics Runs, guesses and Topic progress.**

Run it with `npm run sonar:demo`. For your own account, add your Clerk id to the `DEMO_PLAYERS` allowlist in `scripts/sonar-demo.mts` first.

### 1. "Where do I stand?"
**Do:** open **Sonar** in the nav (`/sonar`).
**Expect:**
- Concepts in Topic lanes, each with a bar.
- One Concept outlined in red and pulsing (the root cause), with red dashes flowing to it from the Concepts you missed on.
- The recommended Concept glowing.
- Hover or tap a node to see its numbers.
- A lane where the Course says Passed but Sonar is under 70% is tinted, e.g. "Sonar: 57%".

Demo history: the root cause is `range()` (about 11%), with blame flowing from for loops, and Operators & Expressions is tinted.

### 2. The briefing
**Do:** click the dolphin.
**Expect:** a 3–4 sentence summary of where you stand, naming the root cause, plus a **Top pick** card. It takes about 4–6 seconds; the dolphin pings while it thinks.

### 3. "Why am I getting this wrong?"
**Do:** in the drawer ask *"Why do I keep missing loop questions? Use my actual mistakes."*
**Expect:** it quotes what you actually answered (e.g. "you answered `3`") next to the reading ("page 2 says… up to, but not including, stop"), and names the one habit behind them.

### 4. Explain a Concept from the reading
**Do:** ask *"Explain range() like I'm new, using the reading."*
**Expect:** an explanation that quotes the Loops reading, not generic internet Python.

### 5. Time-boxed plan
**Do:** ask *"I only have 5 minutes, what should I do?"*
**Expect:** it may pick a shorter Game than the Top pick, e.g. a 60-second Blitz. Then the card says **Sonar's pick** and gives its reason.

### 6. Close the loop
**Do:** press **Start** on a card and play the Run. Sonar is hidden while you play.
**Expect on the results screen:** a speech bubble from the dolphin ("3 misses on Loops… want to know why?" or a cheer for a clean Run) and an **Ask Sonar** button. Click it: Sonar explains that Run.
**Then:** reopen `/sonar`. The Concepts that Run touched have moved, and the root cause or Top pick may have changed.

### 7. "Course says passed"
**Do:** open a Topic page you've passed, e.g. `/explore/python-basics/operators-expressions` on the demo history.
**Expect:** a bubble like "Course says passed. I'm hearing 57%…". Click it to hear why.

### 8. Your own notes (Module pages)
**Do:** open one of your Modules that has a few played Games (e.g. the seeded Graph Algorithms Module) and click **Ask Sonar**, or the bubble if you've missed 3 or more there this week.
**Expect:** it talks about your misses in that Module and quotes pages of your uploaded file. Ask *"Make me something to fix this."*: a **Make this Game** card names a Mode and the file. Press it and the Game starts generating (about a minute). Sonar doesn't build a concept map for your own files (that's Python Basics only, for now).

### 9. Guardrails
- **Ask for a locked Topic:** *"Start me on Functions"* while Loops isn't passed. It won't give a Start card for a locked Topic.
- **Ask for numbers:** *"What's my mastery of scope?"* When you haven't played it, it says so rather than inventing a percentage.
- **Start any Run:** the dolphin disappears on the play screen and comes back on the results.

### 10. It remembers
**Do:** ask a follow-up like *"and what about while loops?"*
**Expect:** it answers in the context of the earlier turns. Memory lasts until the server restarts.

## If something looks off

| Symptom | Likely cause |
|---|---|
| Replies are in a different voice and come faster | `ANTHROPIC_API_KEY` is missing or failing, so Sonar fell back to Gemini |
| "Sonar lost the signal. Try again." | Both Claude and Gemini failed for that turn; try again |
| `/sonar` says to play a Topic first | No Python Basics guesses yet: play any Practice Game |
| The map didn't change after a Run | Reload `/sonar`. The model is computed when the page loads, not pushed live |
| Every turn appears in LangSmith | That's tracing (`LANGSMITH_TRACING=true`, project `syllabyss-sonar`) |
