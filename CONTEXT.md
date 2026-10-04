# StormHacks Study Game

A solo study game in the style of Krillion: a student uploads their own course files, and the app turns them into timed prompts where less obvious correct answers score more.

## Language

**Player**:
The single student who uploads files and plays the Games made from them. There is no shared play between Players.
_Avoid_: User (in game logic), contestant

**Module**:
A Player's private container for one subject: it holds many Source Documents and many Games.
_Avoid_: Course, folder, class, project

**Source Document**:
One file a Player uploaded into a Module (PDF, PPTX, DOCX), which Prompts are generated from.
_Avoid_: Upload, file, material

**Game**:
The set of Prompts generated once from a chosen subset of a Module's Source Documents. A Game is never regenerated; to change it, the Player makes a new Game.
_Avoid_: Deck, quiz, set

**Run**:
One play-through of a Game: 7 Prompts drawn at random, 25 seconds each. Each wrong guess costs 3 seconds. Running out of time scores 0 for that Prompt and the Run continues.
_Avoid_: Dive, game, round, session, play

**Prompt**:
One timed question in a Game that the Player answers by typing. The first correct Answer ends it.
_Avoid_: Question, card

**Open Prompt**:
A Prompt with many valid Answers, each with its own Rarity (e.g. "Name a graph algorithm").
_Avoid_: Open set, category prompt

**Single-answer Prompt**:
A Prompt with exactly one correct Answer: fill-in-the-blank, definition-to-term, put-in-order, or odd-one-out. The Prompt itself carries one Tier, assigned when the Game is generated.
_Avoid_: Closed prompt, fact question

**Hint**:
A short clue toward the Answer of a Single-answer Prompt, written when the Game is generated and never containing the Answer. Revealing it drops the points by one Tier; a hinted common Prompt is worth 5.
_Avoid_: Clue, help

**Answer**:
A response the game accepts as correct for a Prompt. It must be backed by Evidence in a Source Document.
_Avoid_: Solution, option

**Alias**:
Another accepted spelling or name for an Answer (e.g. "breadth-first search" for BFS).
_Avoid_: Synonym, variant

**Evidence**:
The page in a Source Document that supports an Answer.
_Avoid_: Citation, source

**Off-syllabus guess**:
A guess that may be true in general but has no Evidence in the Source Documents, so it is not accepted.
_Avoid_: Wrong answer (it is not necessarily wrong)

## Scoring

**Rarity**:
An Answer's rank of obscurity among the other Answers to the same Open Prompt, set once when the Game is generated and never changed by play. Exactly one Answer per Open Prompt is rarest.
_Avoid_: Prior rarity, crowd rarity, difficulty

**Tier**:
A named points band (common 10, solid 25, deep 60, rare 100). Answers to Open Prompts get a Tier from their Rarity; a Single-answer Prompt gets one Tier for the whole Prompt.
_Avoid_: Level, rank

**Staleness**:
The halving of an Open Prompt Answer's points for each earlier Run in which the Player scored with that same Answer on that same Prompt, never below 1 point.
_Avoid_: Decay, repeat penalty

## Progress

**Personal Best**:
The Player's highest Run score on a Game.
_Avoid_: High score, leaderboard, ranking

**Mastery**:
The share of a Game's Answers the Player has ever found.
_Avoid_: Progress, completion
